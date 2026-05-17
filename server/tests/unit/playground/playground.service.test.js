import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../../config/database.js';
import { playgroundService } from '../../../src/contexts/playground/playground.service.js';
import { playgroundRepository } from '../../../src/contexts/playground/playground.repository.js';

const makeReq = ({
  sessionId = '11111111-1111-1111-1111-111111111111',
  winnerId = '22222222-2222-2222-2222-222222222222',
  roleLevel = 2,
  hotelCompanyId = 'co-1',
  expectedVersion,
  body = {},
  query = {},
} = {}) => ({
  params: { sessionId, winnerId },
  body: expectedVersion === undefined ? body : { ...body, expectedVersion },
  query,
  user: {
    role_level: roleLevel,
    sub: 'user-1',
  },
  hotelCompanyId,
});

const withMockedPlayground = async (run) => {
  const originals = {
    getConnection: pool.getConnection,
    findSession: playgroundRepository.findSession,
    getDrawRows: playgroundRepository.getDrawRows,
    getNextPrize: playgroundRepository.getNextPrize,
    drawNext: playgroundRepository.drawNext,
    setAutoDraw: playgroundRepository.setAutoDraw,
    drawHistory: playgroundRepository.drawHistory,
    listWinners: playgroundRepository.listWinners,
    findWinner: playgroundRepository.findWinner,
    claimWinner: playgroundRepository.claimWinner,
    getPoolState: playgroundRepository.getPoolState,
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
    playgroundRepository.findSession = originals.findSession;
    playgroundRepository.getDrawRows = originals.getDrawRows;
    playgroundRepository.getNextPrize = originals.getNextPrize;
    playgroundRepository.drawNext = originals.drawNext;
    playgroundRepository.setAutoDraw = originals.setAutoDraw;
    playgroundRepository.drawHistory = originals.drawHistory;
    playgroundRepository.listWinners = originals.listWinners;
    playgroundRepository.findWinner = originals.findWinner;
    playgroundRepository.claimWinner = originals.claimWinner;
    playgroundRepository.getPoolState = originals.getPoolState;
  }
};

test('drawNext blocks duplicate forced draw number', async () => {
  await withMockedPlayground(async () => {
    playgroundRepository.findSession = async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'DRAWING',
      totalNumbersPool: 100,
      version: 5,
    });

    playgroundRepository.getDrawRows = async () => [
      { drawPosition: 1, winningNumber: 10 },
      { drawPosition: 2, winningNumber: 15 },
    ];

    playgroundRepository.getNextPrize = async () => ({
      drawPosition: 3,
      beerQuantity: 2,
    });

    await assert.rejects(
      () => playgroundService.drawNext(makeReq({ expectedVersion: 5, body: { forceNumber: 10 } })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'DRAW_NUMBER_ALREADY_USED');
        return true;
      }
    );
  });
});

test('drawNext blocks forceNumber outside pool range', async () => {
  await withMockedPlayground(async () => {
    playgroundRepository.findSession = async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'DRAWING',
      totalNumbersPool: 75,
      version: 5,
    });

    playgroundRepository.getDrawRows = async () => [];
    playgroundRepository.getNextPrize = async () => ({ drawPosition: 1, beerQuantity: 1 });

    await assert.rejects(
      () => playgroundService.drawNext(makeReq({ expectedVersion: 5, body: { forceNumber: 100 } })),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, 'VALIDATION_ERROR');
        return true;
      }
    );
  });
});

test('drawNext enforces company scope for non-super-admin', async () => {
  await withMockedPlayground(async () => {
    playgroundRepository.findSession = async () => ({
      id: 'session-1',
      companyId: 'co-2',
      status: 'DRAWING',
      totalNumbersPool: 75,
      version: 5,
    });

    await assert.rejects(
      () => playgroundService.drawNext(makeReq({ expectedVersion: 5, hotelCompanyId: 'co-1' })),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.code, 'ACCESS_DENIED');
        return true;
      }
    );
  });
});

test('claimWinner blocks already-claimed winner', async () => {
  await withMockedPlayground(async () => {
    playgroundRepository.findWinner = async () => ({
      winnerId: 'winner-1',
      companyId: 'co-1',
      isClaimed: true,
      version: 9,
    });

    await assert.rejects(
      () => playgroundService.claimWinner(makeReq({ expectedVersion: 9 })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'WINNER_ALREADY_CLAIMED');
        return true;
      }
    );
  });
});

test('claimWinner enforces version match', async () => {
  await withMockedPlayground(async () => {
    playgroundRepository.findWinner = async () => ({
      winnerId: 'winner-1',
      companyId: 'co-1',
      isClaimed: false,
      version: 10,
    });

    await assert.rejects(
      () => playgroundService.claimWinner(makeReq({ expectedVersion: 9 })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'VERSION_CONFLICT');
        return true;
      }
    );
  });
});

test('claimWinner returns claimed payload on success', async () => {
  await withMockedPlayground(async () => {
    playgroundRepository.findWinner = async () => ({
      winnerId: 'winner-1',
      companyId: 'co-1',
      isClaimed: false,
      version: 10,
    });

    playgroundRepository.claimWinner = async () => ({
      winnerId: 'winner-1',
      sessionId: 'session-1',
      claimed: true,
      claimedAt: '2026-01-01T12:00:00.000Z',
      version: 11,
    });

    const result = await playgroundService.claimWinner(makeReq({ expectedVersion: 10 }));

    assert.deepEqual(result, {
      winnerId: 'winner-1',
      sessionId: 'session-1',
      claimed: true,
      claimedAt: '2026-01-01T12:00:00.000Z',
      version: 11,
    });
  });
});
