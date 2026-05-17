import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

import pool from '../../../config/database.js';
import boardRoutes from '../../../src/contexts/board/board.routes.js';
import { boardService } from '../../../src/contexts/board/board.service.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

const TOKEN_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const SESSION_ID = '9d1b8f5c-7e34-4b92-9f13-92aaab6c3d10';

const makeToken = (sub = 'user-1') => jwt.sign({ sub }, TOKEN_SECRET, { expiresIn: '1h' });

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(boardRoutes);
  app.use(errorHandler);
  return app;
};

const installQueryMock = (grantedPermissions = []) => {
  const originalQuery = pool.query;

  pool.query = async (sql) => {
    if (sql.includes('FROM users WHERE id = ?')) {
      return [[{ id: 'user-1', hotel_company_id: 'co-1', is_active: 1 }]];
    }

    if (sql.includes('FROM users u') && sql.includes('JOIN user_roles')) {
      return [[{ hotel_company_id: 'co-1', role_name: 'COMPANY_ADMIN', role_level: 2 }]];
    }

    if (sql.includes('FROM permissions p')) {
      return [grantedPermissions.map((name) => ({ name }))];
    }

    return [[]];
  };

  return () => {
    pool.query = originalQuery;
  };
};

const withServiceMocks = async (run, overrides = {}) => {
  const original = {
    listCards: boardService.listCards,
    sellCard: boardService.sellCard,
    unsellCard: boardService.unsellCard,
    bulkAction: boardService.bulkAction,
    resetBoard: boardService.resetBoard,
  };

  boardService.listCards = overrides.listCards || (async () => ({ total: 0, items: [], totals: {}, version: 1 }));
  boardService.sellCard = overrides.sellCard || (async () => ({ cardState: 'SOLD', version: 2 }));
  boardService.unsellCard = overrides.unsellCard || (async () => ({ cardState: 'AVAILABLE', version: 2 }));
  boardService.bulkAction = overrides.bulkAction || (async () => ({ processedCount: 0, skippedCount: 0, version: 2 }));
  boardService.resetBoard = overrides.resetBoard || (async () => ({ totals: {}, version: 2 }));

  try {
    await run();
  } finally {
    boardService.listCards = original.listCards;
    boardService.sellCard = original.sellCard;
    boardService.unsellCard = original.unsellCard;
    boardService.bulkAction = original.bulkAction;
    boardService.resetBoard = original.resetBoard;
  }
};

test('board list route returns service payload on success', async () => {
  const restoreQuery = installQueryMock(['VIEW_GAMES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/board/cards`, {
          headers: {
            Authorization: `Bearer ${makeToken()}`,
          },
        });

        const body = await response.json();
        assert.equal(response.status, 200);
        assert.ok(Array.isArray(body.items));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      listCards: async () => ({
        total: 1,
        items: [{ cardId: 'c1', cardNumber: 1, status: 'AVAILABLE' }],
        totals: { available: 1, sold: 0, winner: 0, claimed: 0, revenue: 0 },
        version: 5,
      }),
    });
  } finally {
    restoreQuery();
  }
});

test('board sell route enforces request validation', async () => {
  const restoreQuery = installQueryMock(['SELL_CARDS']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/not-a-uuid/board/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ cardNumber: 1 }),
        });

        const body = await response.json();
        assert.equal(response.status, 400);
        assert.equal(body.code, 'VALIDATION_ERROR');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  } finally {
    restoreQuery();
  }
});

test('board reset route enforces permission middleware', async () => {
  const restoreQuery = installQueryMock(['SELL_CARDS']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/board/reset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ expectedVersion: 3 }),
        });

        const body = await response.json();
        assert.equal(response.status, 403);
        assert.match(body.error, /Access denied/i);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  } finally {
    restoreQuery();
  }
});

test('board happy path flow: list then sell then unsell then bulk then reset', async () => {
  const restoreQuery = installQueryMock(['VIEW_GAMES', 'SELL_CARDS', 'MANAGE_GAMES']);

  const flowState = {
    version: 10,
    cards: [
      { cardId: 'de428fe5-664f-47eb-a510-f593f713be81', cardNumber: 1, status: 'AVAILABLE' },
      { cardId: '0db9f11c-5982-4d35-b6c3-f143fa4f8f14', cardNumber: 2, status: 'AVAILABLE' },
      { cardId: '30f73860-495d-4dc2-aa9a-4311fa79956f', cardNumber: 3, status: 'AVAILABLE' },
      { cardId: 'a0e32918-49e5-4189-b95d-f1f4f30539de', cardNumber: 4, status: 'AVAILABLE' },
      { cardId: '85bbaf3d-5296-47be-9ad4-c56f32be00c5', cardNumber: 5, status: 'AVAILABLE' },
    ],
  };

  const computeTotals = () => ({
    available: flowState.cards.filter((c) => c.status === 'AVAILABLE').length,
    sold: flowState.cards.filter((c) => c.status === 'SOLD').length,
    winner: flowState.cards.filter((c) => c.status === 'WINNER').length,
    claimed: flowState.cards.filter((c) => c.status === 'CLAIMED').length,
    revenue: flowState.cards.filter((c) => c.status === 'SOLD').length * 100,
  });

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();

        const listBefore = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/board/cards`, {
          headers: {
            Authorization: `Bearer ${makeToken()}`,
          },
        });
        const listBeforeBody = await listBefore.json();
        assert.equal(listBefore.status, 200);
        assert.equal(listBeforeBody.total, 5);
        assert.equal(listBeforeBody.totals.available, 5);

        const sellResponse = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/board/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ cardNumber: 5, expectedVersion: 10 }),
        });
        const sellBody = await sellResponse.json();
        assert.equal(sellResponse.status, 201);
        assert.equal(sellBody.cardState, 'SOLD');
        assert.equal(sellBody.version, 11);

        const unsellResponse = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/board/unsell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ cardNumber: 5, expectedVersion: 11 }),
        });
        const unsellBody = await unsellResponse.json();
        assert.equal(unsellResponse.status, 200);
        assert.equal(unsellBody.cardState, 'AVAILABLE');
        assert.equal(unsellBody.version, 12);

        const bulkResponse = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/board/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ action: 'SELL', cardNumbers: [1, 2, 3], expectedVersion: 12 }),
        });
        const bulkBody = await bulkResponse.json();
        assert.equal(bulkResponse.status, 200);
        assert.equal(bulkBody.processedCount, 3);
        assert.equal(bulkBody.version, 13);

        const resetResponse = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/board/reset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ expectedVersion: 13 }),
        });
        const resetBody = await resetResponse.json();
        assert.equal(resetResponse.status, 200);
        assert.equal(resetBody.totals.available, 5);
        assert.equal(resetBody.totals.sold, 0);
        assert.equal(resetBody.version, 14);

        const listSoldAfterReset = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/board/cards?status=SOLD`, {
          headers: {
            Authorization: `Bearer ${makeToken()}`,
          },
        });
        const listSoldAfterResetBody = await listSoldAfterReset.json();
        assert.equal(listSoldAfterReset.status, 200);
        assert.equal(listSoldAfterResetBody.total, 0);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      listCards: async (req) => {
        const statusFilter = req.query.status;
        const items = statusFilter
          ? flowState.cards.filter((item) => item.status === statusFilter)
          : flowState.cards;

        return {
          total: items.length,
          items,
          totals: computeTotals(),
          version: flowState.version,
        };
      },
      sellCard: async (req) => {
        const target = flowState.cards.find((item) => item.cardNumber === Number(req.body.cardNumber));
        target.status = 'SOLD';
        flowState.version += 1;

        return {
          cardState: 'SOLD',
          cardId: target.cardId,
          cardNumber: target.cardNumber,
          totals: computeTotals(),
          version: flowState.version,
        };
      },
      unsellCard: async (req) => {
        const target = flowState.cards.find((item) => item.cardNumber === Number(req.body.cardNumber));
        target.status = 'AVAILABLE';
        flowState.version += 1;

        return {
          cardState: 'AVAILABLE',
          cardId: target.cardId,
          cardNumber: target.cardNumber,
          totals: computeTotals(),
          version: flowState.version,
        };
      },
      bulkAction: async (req) => {
        let processedCount = 0;
        for (const cardNumber of req.body.cardNumbers || []) {
          const target = flowState.cards.find((item) => item.cardNumber === Number(cardNumber));
          if (target && target.status !== 'SOLD') {
            target.status = 'SOLD';
            processedCount += 1;
          }
        }

        flowState.version += 1;
        return {
          processedCount,
          skippedCount: (req.body.cardNumbers || []).length - processedCount,
          totals: computeTotals(),
          revenuePreview: computeTotals().revenue,
          version: flowState.version,
        };
      },
      resetBoard: async () => {
        flowState.cards = flowState.cards.map((item) => ({ ...item, status: 'AVAILABLE' }));
        flowState.version += 1;

        return {
          totals: computeTotals(),
          revenuePreview: computeTotals().revenue,
          version: flowState.version,
        };
      },
    });
  } finally {
    restoreQuery();
  }
});
