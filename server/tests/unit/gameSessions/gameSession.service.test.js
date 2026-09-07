import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../../config/database.js';
import { gameSessionService } from '../../../src/contexts/gameSessions/gameSession.service.js';
import { gameSessionRepository } from '../../../src/contexts/gameSessions/gameSession.repository.js';
import { realtimeGateway } from '../../../src/contexts/realtime/realtime.gateway.js';

const makeReq = ({ sessionId = 'sess-1', roleLevel = 2, hotelCompanyId = 'co-1', expectedVersion, body = {} } = {}) => ({
  params: { sessionId },
  body: expectedVersion === undefined ? body : { ...body, expectedVersion },
  user: { role_level: roleLevel, sub: 'user-1' },
  hotelCompanyId,
});

const withMockedGameSession = async (run) => {
  const originals = {
    getConnection: pool.getConnection,
    findById: gameSessionRepository.findById,
    updateStatus: gameSessionRepository.updateStatus,
  };

  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  pool.getConnection = async () => connection;

  try {
    await run();
  } finally {
    pool.getConnection = originals.getConnection;
    gameSessionRepository.findById = originals.findById;
    gameSessionRepository.updateStatus = originals.updateStatus;
  }
};

test('beginDrawSession transitions ACTIVE -> DRAWING and emits event', async () => {
  await withMockedGameSession(async () => {
    let emitted = null;
    const originalEmit = realtimeGateway.emitSessionEvent;
    realtimeGateway.emitSessionEvent = (payload) => { emitted = payload; return true; };

    gameSessionRepository.findById = async () => ({ id: 'sess-1', companyId: 'co-1', status: 'ACTIVE', version: 3 });
    gameSessionRepository.updateStatus = async () => ({ id: 'sess-1', status: 'DRAWING', version: 4 });

    const res = await gameSessionService.beginDrawSession(makeReq({ expectedVersion: 3 }));

    assert.equal(res.status, 'DRAWING');
    assert.ok(emitted);
    assert.equal(emitted.event, 'session:status-changed');

    realtimeGateway.emitSessionEvent = originalEmit;
  });
});

test('pauseSession transitions DRAWING -> PAUSED and emits event', async () => {
  await withMockedGameSession(async () => {
    let emitted = null;
    const originalEmit = realtimeGateway.emitSessionEvent;
    realtimeGateway.emitSessionEvent = (payload) => { emitted = payload; return true; };

    gameSessionRepository.findById = async () => ({ id: 'sess-1', companyId: 'co-1', status: 'DRAWING', version: 5 });
    gameSessionRepository.updateStatus = async () => ({ id: 'sess-1', status: 'PAUSED', version: 6 });

    const res = await gameSessionService.pauseSession(makeReq({ expectedVersion: 5 }));

    assert.equal(res.status, 'PAUSED');
    assert.ok(emitted);
    assert.equal(emitted.event, 'session:status-changed');

    realtimeGateway.emitSessionEvent = originalEmit;
  });
});

test('resumeSession transitions PAUSED -> DRAWING and emits event', async () => {
  await withMockedGameSession(async () => {
    let emitted = null;
    const originalEmit = realtimeGateway.emitSessionEvent;
    realtimeGateway.emitSessionEvent = (payload) => { emitted = payload; return true; };

    gameSessionRepository.findById = async () => ({ id: 'sess-1', companyId: 'co-1', status: 'PAUSED', version: 7 });
    gameSessionRepository.updateStatus = async () => ({ id: 'sess-1', status: 'DRAWING', version: 8 });

    const res = await gameSessionService.resumeSession(makeReq({ expectedVersion: 7 }));

    assert.equal(res.status, 'DRAWING');
    assert.ok(emitted);
    assert.equal(emitted.event, 'session:status-changed');

    realtimeGateway.emitSessionEvent = originalEmit;
  });
});
