import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../../config/database.js';
import { boardService } from '../../../src/contexts/board/board.service.js';
import { boardRepository } from '../../../src/contexts/board/board.repository.js';

const makeReq = ({
  sessionId = '11111111-1111-1111-1111-111111111111',
  roleLevel = 2,
  hotelCompanyId = 'co-1',
  expectedVersion,
  body = {},
  query = {},
} = {}) => ({
  params: { sessionId },
  body: expectedVersion === undefined ? body : { ...body, expectedVersion },
  query,
  user: {
    role_level: roleLevel,
    sub: 'user-1',
  },
  hotelCompanyId,
});

const withMockedBoard = async (run) => {
  const originals = {
    getConnection: pool.getConnection,
    findSession: boardRepository.findSession,
    listCards: boardRepository.listCards,
    sellCard: boardRepository.sellCard,
    unsellCard: boardRepository.unsellCard,
    bulkAction: boardRepository.bulkAction,
    resetBoard: boardRepository.resetBoard,
    getTotals: boardRepository.getTotals,
  };

  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  pool.getConnection = async () => connection;

  try {
    await run({ connection });
  } finally {
    pool.getConnection = originals.getConnection;
    boardRepository.findSession = originals.findSession;
    boardRepository.listCards = originals.listCards;
    boardRepository.sellCard = originals.sellCard;
    boardRepository.unsellCard = originals.unsellCard;
    boardRepository.bulkAction = originals.bulkAction;
    boardRepository.resetBoard = originals.resetBoard;
    boardRepository.getTotals = originals.getTotals;
  }
};

test('listCards rejects cross-company access for non-super-admin', async () => {
  await withMockedBoard(async () => {
    boardRepository.findSession = async () => ({
      id: 'session-1',
      companyId: 'co-2',
      status: 'ACTIVE',
      version: 5,
    });

    await assert.rejects(
      () => boardService.listCards(makeReq({ hotelCompanyId: 'co-1' })),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.code, 'ACCESS_DENIED');
        return true;
      }
    );
  });
});

test('sellCard rejects version mismatch', async () => {
  await withMockedBoard(async () => {
    boardRepository.findSession = async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'ACTIVE',
      cardPrice: 100,
      version: 9,
    });

    await assert.rejects(
      () => boardService.sellCard(makeReq({ expectedVersion: 8, body: { cardNumber: 1 } })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'VERSION_CONFLICT');
        return true;
      }
    );
  });
});

test('sellCard rejects non-ACTIVE session', async () => {
  await withMockedBoard(async () => {
    boardRepository.findSession = async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'DRAWING',
      cardPrice: 100,
      version: 9,
    });

    await assert.rejects(
      () => boardService.sellCard(makeReq({ expectedVersion: 9, body: { cardNumber: 1 } })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'SESSION_INVALID_STATE');
        return true;
      }
    );
  });
});

test('sellCard returns sold card state and updated totals', async () => {
  await withMockedBoard(async () => {
    let findCount = 0;
    boardRepository.findSession = async () => {
      findCount += 1;
      return {
        id: 'session-1',
        companyId: 'co-1',
        status: 'ACTIVE',
        cardPrice: 100,
        version: findCount === 1 ? 5 : 6,
      };
    };

    boardRepository.sellCard = async () => ({
      skipped: false,
      card: {
        cardId: 'card-1',
        cardNumber: 4,
      },
    });

    boardRepository.getTotals = async () => ({
      available: 99,
      sold: 1,
      winner: 0,
      claimed: 0,
      revenue: 100,
    });

    const result = await boardService.sellCard(makeReq({ expectedVersion: 5, body: { cardNumber: 4 } }));

    assert.deepEqual(result, {
      cardState: 'SOLD',
      cardId: 'card-1',
      cardNumber: 4,
      totals: {
        available: 99,
        sold: 1,
        winner: 0,
        claimed: 0,
        revenue: 100,
      },
      version: 6,
    });
  });
});

test('bulkAction returns processed and skipped counts', async () => {
  await withMockedBoard(async () => {
    let findCount = 0;
    boardRepository.findSession = async () => {
      findCount += 1;
      return {
        id: 'session-1',
        companyId: 'co-1',
        status: 'ACTIVE',
        cardPrice: 100,
        version: findCount === 1 ? 10 : 11,
      };
    };

    boardRepository.bulkAction = async () => ({
      processedCount: 2,
      skippedCount: 1,
      totals: {
        available: 97,
        sold: 3,
        winner: 0,
        claimed: 0,
        revenue: 300,
      },
      revenuePreview: 300,
    });

    const result = await boardService.bulkAction(
      makeReq({
        expectedVersion: 10,
        body: { action: 'SELL', cardNumbers: [1, 2, 3] },
      })
    );

    assert.equal(result.processedCount, 2);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.version, 11);
  });
});

test('resetBoard rejects closed sessions', async () => {
  await withMockedBoard(async () => {
    boardRepository.findSession = async () => ({
      id: 'session-1',
      companyId: 'co-1',
      status: 'COMPLETED',
      version: 2,
    });

    await assert.rejects(
      () => boardService.resetBoard(makeReq({ expectedVersion: 2 })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'SESSION_INVALID_STATE');
        return true;
      }
    );
  });
});
