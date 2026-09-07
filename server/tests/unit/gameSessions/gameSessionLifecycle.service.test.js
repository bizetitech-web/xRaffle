import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../../config/database.js';
import { gameSessionService } from '../../../src/contexts/gameSessions/gameSession.service.js';
import { gameSessionRepository } from '../../../src/contexts/gameSessions/gameSession.repository.js';
import { realtimeGateway } from '../../../src/contexts/realtime/realtime.gateway.js';
import { RealtimeEventContracts } from '../../../src/contexts/realtime/realtime.events.js';

const makeReq = ({
  sessionId = '11111111-1111-1111-1111-111111111111',
  roleLevel = 2,
  hotelCompanyId = 'co-1',
  expectedVersion,
} = {}) => ({
  params: { sessionId },
  body: expectedVersion === undefined ? {} : { expectedVersion },
  user: {
    role_level: roleLevel,
    sub: 'user-1',
  },
  hotelCompanyId,
});

const withMockedTransaction = async (run) => {
  const originalGetConnection = pool.getConnection;
  const originalFindById = gameSessionRepository.findById;
  const originalFindTemplateForSessionCreate = gameSessionRepository.findTemplateForSessionCreate;
  const originalFindDefaultBranchByCompany = gameSessionRepository.findDefaultBranchByCompany;
  const originalHasPersistedTemplateCards = gameSessionRepository.hasPersistedTemplateCards;
  const originalCreateFromTemplate = gameSessionRepository.createFromTemplate;
  const originalUpdateStatus = gameSessionRepository.updateStatus;
  const originalResetRuntime = gameSessionRepository.resetRuntime;
  const originalComplete = gameSessionRepository.complete;

  const idempotencyStore = new Map();
  const idempotencyById = new Map();

  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql, params = []) => {
      const normalized = String(sql || '').replace(/\s+/g, ' ').trim().toUpperCase();

      if (normalized.startsWith('INSERT INTO WALLET_IDEMPOTENCY_REQUESTS')) {
        const [id, endpoint, key, requestHash, requestPayload] = params;
        const cacheKey = `${endpoint}|${key}`;
        if (!idempotencyStore.has(cacheKey)) {
          const row = {
            id,
            endpoint,
            idempotency_key: key,
            request_hash: requestHash,
            request_payload: requestPayload,
            response_code: null,
            response_body: null,
            status: 'PENDING',
          };
          idempotencyStore.set(cacheKey, row);
          idempotencyById.set(id, row);
        }
        return [{ affectedRows: 1 }];
      }

      if (normalized.includes('FROM WALLET_IDEMPOTENCY_REQUESTS') && normalized.includes('FOR UPDATE')) {
        const [endpoint, key] = params;
        const row = idempotencyStore.get(`${endpoint}|${key}`) || null;
        return [[row]];
      }

      if (normalized.startsWith('UPDATE WALLET_IDEMPOTENCY_REQUESTS')) {
        const [responseBody, id] = params;
        const row = idempotencyById.get(id);
        if (row) {
          row.response_body = responseBody;
          row.response_code = 200;
          row.status = 'COMPLETED';
        }
        return [{ affectedRows: row ? 1 : 0 }];
      }

      if (normalized.includes('FROM GAME_CHARGES') && normalized.includes('FOR UPDATE')) {
        // default: no charge row in unit tests unless explicitly mocked elsewhere
        return [[null]];
      }

      if (normalized.includes('FROM DRAWS')) {
        return [[{ total: 1 }]];
      }

      if (normalized.includes('FROM GAME_PRIZES')) {
        return [[{ total: 1 }]];
      }

      if (normalized.includes('FROM WALLET_TRANSACTIONS WHERE ID =')) {
        return [[null]];
      }

      return [[{}]];
    },
  };

  const calls = {
    updateStatus: [],
    resetRuntime: 0,
    complete: [],
  };

  pool.getConnection = async () => connection;

  try {
    gameSessionRepository.hasPersistedTemplateCards = async () => true;

    await run({
      setFindTemplateForSessionCreate: (fn) => {
        gameSessionRepository.findTemplateForSessionCreate = fn;
      },
      setCreateFromTemplate: (fn) => {
        gameSessionRepository.createFromTemplate = fn;
      },
      setFindDefaultBranchByCompany: (fn) => {
        gameSessionRepository.findDefaultBranchByCompany = fn;
      },
      setHasPersistedTemplateCards: (fn) => {
        gameSessionRepository.hasPersistedTemplateCards = fn;
      },
      setFindById: (fn) => {
        gameSessionRepository.findById = fn;
      },
      setUpdateStatus: (fn) => {
        gameSessionRepository.updateStatus = async (...args) => {
          calls.updateStatus.push(args);
          return fn(...args);
        };
      },
      setResetRuntime: (fn) => {
        gameSessionRepository.resetRuntime = async (...args) => {
          calls.resetRuntime += 1;
          return fn(...args);
        };
      },
      setComplete: (fn) => {
        gameSessionRepository.complete = async (...args) => {
          calls.complete.push(args);
          return fn(...args);
        };
      },
      calls,
      connection,
    });
  } finally {
    pool.getConnection = originalGetConnection;
    gameSessionRepository.findById = originalFindById;
    gameSessionRepository.findTemplateForSessionCreate = originalFindTemplateForSessionCreate;
    gameSessionRepository.findDefaultBranchByCompany = originalFindDefaultBranchByCompany;
    gameSessionRepository.hasPersistedTemplateCards = originalHasPersistedTemplateCards;
    gameSessionRepository.createFromTemplate = originalCreateFromTemplate;
    gameSessionRepository.updateStatus = originalUpdateStatus;
    gameSessionRepository.resetRuntime = originalResetRuntime;
    gameSessionRepository.complete = originalComplete;
  }
};

test('createSession creates a session from template', async () => {
  const originalQuery = pool.query;
  pool.query = async () => [[{ id: 'br-1', company_id: 'co-1' }]];

  try {
    await withMockedTransaction(async ({ setFindTemplateForSessionCreate, setCreateFromTemplate }) => {
      setFindTemplateForSessionCreate(async () => ({
        id: 'template-1',
        companyId: 'co-1',
        branchId: 'br-1',
        title: 'Night Draw',
        cardPrice: 50,
        totalCards: 25,
        numbersPerCard: 4,
        totalPrizeBeers: 10,
        totalNumbersPool: 100,
        isActive: true,
      }));

      setCreateFromTemplate(async (_connection, payload) => ({
        id: 'session-1',
        sessionCode: payload.gameCode,
        status: 'PENDING',
        version: 12,
      }));

      const result = await gameSessionService.createSession({
        body: { templateId: 'template-1' },
        params: {},
        user: { sub: 'user-1', role_level: 2 },
        hotelCompanyId: 'co-1',
      });

      assert.equal(result.sessionId, 'session-1');
      assert.equal(result.status, 'PENDING');
      assert.equal(result.version, 12);
      assert.match(result.sessionCode, /^GAME-/);
    });
  } finally {
    pool.query = originalQuery;
  }
});

test('listSessions forwards templateId filter for deterministic lookup', async () => {
  const originalListSessions = gameSessionRepository.listSessions;
  try {
    let receivedFilters = null;
    gameSessionRepository.listSessions = async (_connection, filters) => {
      receivedFilters = filters;
      return [];
    };

    const result = await gameSessionService.listSessions({
      query: { templateId: 'template-1' },
      user: { role_level: 2 },
      hotelCompanyId: 'co-1',
    });

    assert.deepEqual(result, []);
    assert.equal(receivedFilters.companyId, 'co-1');
    assert.equal(receivedFilters.templateId, 'template-1');
  } finally {
    gameSessionRepository.listSessions = originalListSessions;
  }
});

test('createSession rejects archived template', async () => {
  await withMockedTransaction(async ({ setFindTemplateForSessionCreate }) => {
    setFindTemplateForSessionCreate(async () => ({
      id: 'template-1',
      companyId: 'co-1',
      branchId: 'br-1',
      isActive: false,
    }));

    await assert.rejects(
      () => gameSessionService.createSession({
        body: { templateId: 'template-1' },
        params: {},
        user: { sub: 'user-1', role_level: 2 },
        hotelCompanyId: 'co-1',
      }),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, 'VALIDATION_ERROR');
        return true;
      }
    );
  });
});

test('createSession enforces company scope', async () => {
  await withMockedTransaction(async ({ setFindTemplateForSessionCreate }) => {
    setFindTemplateForSessionCreate(async () => ({
      id: 'template-1',
      companyId: 'co-2',
      branchId: 'br-1',
      isActive: true,
    }));

    await assert.rejects(
      () => gameSessionService.createSession({
        body: { templateId: 'template-1' },
        params: {},
        user: { sub: 'user-1', role_level: 2 },
        hotelCompanyId: 'co-1',
      }),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.code, 'ACCESS_DENIED');
        return true;
      }
    );
  });
});

test('createSession rejects template with zero persisted cards', async () => {
  await withMockedTransaction(async ({ setFindTemplateForSessionCreate, setHasPersistedTemplateCards }) => {
    setFindTemplateForSessionCreate(async () => ({
      id: 'template-1',
      companyId: 'co-1',
      branchId: 'br-1',
      isActive: true,
    }));

    setHasPersistedTemplateCards(async () => false);

    await assert.rejects(
      () => gameSessionService.createSession({
        body: { templateId: 'template-1' },
        params: {},
        user: { sub: 'user-1', role_level: 2 },
        hotelCompanyId: 'co-1',
      }),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.match(error.message, /no persisted cards/i);
        return true;
      }
    );
  });
});

test('createSession resolves default branch when template branch is null', async () => {
  await withMockedTransaction(async ({ setFindTemplateForSessionCreate, setFindDefaultBranchByCompany, setCreateFromTemplate }) => {
    setFindTemplateForSessionCreate(async () => ({
      id: 'template-1',
      companyId: 'co-1',
      branchId: null,
      isActive: true,
    }));

    setFindDefaultBranchByCompany(async () => 'br-fallback-1');

    setCreateFromTemplate(async (_connection, payload) => ({
      id: 'session-1',
      sessionCode: payload.gameCode,
      status: 'PENDING',
      version: 1,
      usedBranchId: payload.branchId,
    }));

    const result = await gameSessionService.createSession({
      body: { templateId: 'template-1' },
      params: {},
      user: { sub: 'user-1', role_level: 2 },
      hotelCompanyId: 'co-1',
    });

    assert.equal(result.sessionId, 'session-1');
    assert.equal(result.status, 'PENDING');
  });
});

test('createSession fails with validation error when no active branch exists', async () => {
  await withMockedTransaction(async ({ setFindTemplateForSessionCreate, setFindDefaultBranchByCompany }) => {
    setFindTemplateForSessionCreate(async () => ({
      id: 'template-1',
      companyId: 'co-1',
      branchId: null,
      isActive: true,
    }));

    setFindDefaultBranchByCompany(async () => null);

    await assert.rejects(
      () => gameSessionService.createSession({
        body: { templateId: 'template-1' },
        params: {},
        user: { sub: 'user-1', role_level: 2 },
        hotelCompanyId: 'co-1',
      }),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.match(error.message, /no active branch/i);
        return true;
      }
    );
  });
});

test('startSession transitions PENDING to ACTIVE', async () => {
  const originalEmitSessionEvent = realtimeGateway.emitSessionEvent;
  const realtimeEvents = [];
  realtimeGateway.emitSessionEvent = (payload) => {
    realtimeEvents.push(payload);
    return true;
  };

  try {
    await withMockedTransaction(async ({ setFindById, setUpdateStatus, calls }) => {
      setFindById(async () => ({
        id: 'session-1',
        companyId: 'co-1',
        status: 'PENDING',
        version: 5,
      }));

      setUpdateStatus(async () => ({
        id: 'session-1',
        status: 'ACTIVE',
        version: 6,
      }));

      const result = await gameSessionService.startSession(makeReq({ expectedVersion: 5 }));

      assert.deepEqual(result, {
        sessionId: 'session-1',
        status: 'ACTIVE',
        version: 6,
        idempotencyStatus: 'new',
      });

      assert.equal(calls.updateStatus.length, 1);
      assert.equal(calls.updateStatus[0][2], 'ACTIVE');
      assert.deepEqual(calls.updateStatus[0][4], { setStartedAt: true });
      assert.equal(realtimeEvents.length, 1);
      assert.equal(realtimeEvents[0].event, RealtimeEventContracts.session.statusChanged);
      assert.equal(realtimeEvents[0].sessionId, 'session-1');
      assert.equal(realtimeEvents[0].companyId, 'co-1');
      assert.equal(realtimeEvents[0].payload.action, 'start');
      assert.equal(realtimeEvents[0].payload.status, 'ACTIVE');
    });
  } finally {
    realtimeGateway.emitSessionEvent = originalEmitSessionEvent;
  }
});

test('startSession rejects stale expectedVersion', async () => {
  await withMockedTransaction(async ({ setFindById, setUpdateStatus }) => {
    setFindById(async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'PENDING',
      version: 9,
    }));

    setUpdateStatus(async () => ({
      id: 'session-1',
      status: 'ACTIVE',
      version: 10,
    }));

    await assert.rejects(
      () => gameSessionService.startSession(makeReq({ expectedVersion: 8 })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'VERSION_CONFLICT');
        return true;
      }
    );
  });
});

test('pauseSession rejects invalid state transition', async () => {
  await withMockedTransaction(async ({ setFindById }) => {
    setFindById(async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'ACTIVE',
      version: 4,
    }));

    await assert.rejects(
      () => gameSessionService.pauseSession(makeReq({ expectedVersion: 4 })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'SESSION_INVALID_STATE');
        return true;
      }
    );
  });
});

test('endSession enforces company scope for non-super-admin', async () => {
  await withMockedTransaction(async ({ setFindById }) => {
    setFindById(async () => ({
      id: 'session-1',
      companyId: 'co-2',
      status: 'DRAWING',
      version: 3,
    }));

    await assert.rejects(
      () => gameSessionService.endSession(makeReq({ hotelCompanyId: 'co-1', roleLevel: 2, expectedVersion: 3 })),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.code, 'ACCESS_DENIED');
        return true;
      }
    );
  });
});

test('endSession transitions to ENDED and sets endedAt', async () => {
  await withMockedTransaction(async ({ setFindById, setUpdateStatus, calls }) => {
    setFindById(async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'DRAWING',
      version: 3,
    }));

    setUpdateStatus(async () => ({
      id: 'session-1',
      status: 'ENDED',
      version: 4,
    }));

    const result = await gameSessionService.endSession(makeReq({ sessionId: 'session-1', expectedVersion: 3 }));

    assert.equal(calls.updateStatus[0][2], 'ENDED');
    assert.deepEqual(calls.updateStatus[0][4], { setEndedAt: true });
    assert.deepEqual(result, {
      sessionId: 'session-1',
      status: 'ENDED',
      version: 4,
    });
  });
});

test('endSession falls back to complete() when ENDED is unsupported by DB enum', async () => {
  await withMockedTransaction(async ({ setFindById, setUpdateStatus, setComplete, calls }) => {
    setFindById(async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'DRAWING',
      version: 3,
    }));

    setUpdateStatus(async () => {
      const error = new Error("Data truncated for column 'status' at row 1");
      error.code = 'WARN_DATA_TRUNCATED';
      error.errno = 1265;
      error.sqlMessage = "Data truncated for column 'status' at row 1";
      throw error;
    });

    setComplete(async () => ({
      sessionId: 'session-1',
      status: 'COMPLETED',
      version: 4,
      summary: {
        drawCount: 5,
        winnersCount: 1,
        claimsCount: 0,
        revenue: 1500,
      },
    }));

    const result = await gameSessionService.endSession(makeReq({ sessionId: 'session-1', expectedVersion: 3 }));

    assert.equal(calls.updateStatus.length, 1);
    assert.equal(calls.complete.length, 1);
    assert.deepEqual(result, {
      sessionId: 'session-1',
      status: 'COMPLETED',
      version: 4,
      summary: {
        drawCount: 5,
        winnersCount: 1,
        claimsCount: 0,
        revenue: 1500,
      },
    });
  });
});

test('resetSession clears runtime data and returns PENDING', async () => {
  const originalEmitSessionEvent = realtimeGateway.emitSessionEvent;
  const realtimeEvents = [];
  realtimeGateway.emitSessionEvent = (payload) => {
    realtimeEvents.push(payload);
    return true;
  };

  try {
    await withMockedTransaction(async ({ setFindById, setResetRuntime, setUpdateStatus, calls }) => {
      setFindById(async () => ({
        id: 'session-1',
        companyId: 'co-1',
        status: 'DRAWING',
        version: 11,
      }));

      setResetRuntime(async () => {});
      setUpdateStatus(async () => ({
        id: 'session-1',
        status: 'PENDING',
        version: 12,
      }));

      const result = await gameSessionService.resetSession(makeReq({ expectedVersion: 11 }));

      assert.equal(calls.resetRuntime, 1);
      assert.equal(calls.updateStatus[0][2], 'PENDING');
      assert.deepEqual(calls.updateStatus[0][4], { clearStartedAt: true, clearEndedAt: true });
      assert.deepEqual(result, {
        sessionId: 'session-1',
        status: 'PENDING',
        version: 12,
      });
      assert.equal(realtimeEvents.length, 1);
      assert.equal(realtimeEvents[0].event, RealtimeEventContracts.session.reset);
      assert.equal(realtimeEvents[0].payload.action, 'reset');
    });
  } finally {
    realtimeGateway.emitSessionEvent = originalEmitSessionEvent;
  }
});

test('completeSession returns repository summary payload', async () => {
  const originalEmitSessionEvent = realtimeGateway.emitSessionEvent;
  const realtimeEvents = [];
  realtimeGateway.emitSessionEvent = (payload) => {
    realtimeEvents.push(payload);
    return true;
  };

  try {
    await withMockedTransaction(async ({ setFindById, setComplete, calls }) => {
      setFindById(async () => ({
        id: 'session-1',
        companyId: 'co-1',
        status: 'DRAWING',
        version: 7,
      }));

      setComplete(async () => ({
        sessionId: 'session-1',
        status: 'COMPLETED',
        version: 8,
        summary: {
          drawCount: 12,
          winnersCount: 4,
          claimsCount: 3,
          revenue: 2500,
        },
      }));

      const result = await gameSessionService.completeSession(makeReq({ expectedVersion: 7 }));

      assert.equal(calls.complete.length, 1);
      assert.equal(calls.complete[0][1], 'session-1');
      assert.deepEqual(result, {
        sessionId: 'session-1',
        status: 'COMPLETED',
        version: 8,
        summary: {
          drawCount: 12,
          winnersCount: 4,
          claimsCount: 3,
          revenue: 2500,
        },
      });
      assert.equal(realtimeEvents.length, 1);
      assert.equal(realtimeEvents[0].event, RealtimeEventContracts.session.statusChanged);
      assert.equal(realtimeEvents[0].payload.action, 'complete');
      assert.deepEqual(realtimeEvents[0].payload.summary, {
        drawCount: 12,
        winnersCount: 4,
        claimsCount: 3,
        revenue: 2500,
      });
    });
  } finally {
    realtimeGateway.emitSessionEvent = originalEmitSessionEvent;
  }
});
