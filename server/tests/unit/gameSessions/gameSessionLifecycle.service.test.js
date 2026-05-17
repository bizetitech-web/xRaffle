import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../../config/database.js';
import { gameSessionService } from '../../../src/contexts/gameSessions/gameSession.service.js';
import { gameSessionRepository } from '../../../src/contexts/gameSessions/gameSession.repository.js';

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
  const originalCreateFromTemplate = gameSessionRepository.createFromTemplate;
  const originalUpdateStatus = gameSessionRepository.updateStatus;
  const originalResetRuntime = gameSessionRepository.resetRuntime;
  const originalComplete = gameSessionRepository.complete;

  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const calls = {
    updateStatus: [],
    resetRuntime: 0,
    complete: [],
  };

  pool.getConnection = async () => connection;

  try {
    await run({
      setFindTemplateForSessionCreate: (fn) => {
        gameSessionRepository.findTemplateForSessionCreate = fn;
      },
      setCreateFromTemplate: (fn) => {
        gameSessionRepository.createFromTemplate = fn;
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

test('startSession transitions PENDING to ACTIVE', async () => {
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
    });

    assert.equal(calls.updateStatus.length, 1);
    assert.equal(calls.updateStatus[0][2], 'ACTIVE');
    assert.deepEqual(calls.updateStatus[0][4], { setStartedAt: true });
  });
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

test('resetSession clears runtime data and returns PENDING', async () => {
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
  });
});

test('completeSession returns repository summary payload', async () => {
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
  });
});
