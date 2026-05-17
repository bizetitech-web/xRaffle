import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

import pool from '../../../config/database.js';
import playgroundRoutes from '../../../src/contexts/playground/playground.routes.js';
import { playgroundService } from '../../../src/contexts/playground/playground.service.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

const TOKEN_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const SESSION_ID = '9d1b8f5c-7e34-4b92-9f13-92aaab6c3d10';
const WINNER_ID = '281f931b-3a4a-4cfc-9ba9-494598f3a49d';

const makeToken = (sub = 'user-1') => jwt.sign({ sub }, TOKEN_SECRET, { expiresIn: '1h' });

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(playgroundRoutes);
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
    getPoolState: playgroundService.getPoolState,
    drawNext: playgroundService.drawNext,
    setAutoDraw: playgroundService.setAutoDraw,
    drawHistory: playgroundService.drawHistory,
    listWinners: playgroundService.listWinners,
    claimWinner: playgroundService.claimWinner,
  };

  playgroundService.getPoolState = overrides.getPoolState || (async () => ({ totalNumbersPool: 100, calledNumbers: [] }));
  playgroundService.drawNext = overrides.drawNext || (async () => ({ drawId: 'd1', drawPosition: 1, calledNumber: 7 }));
  playgroundService.setAutoDraw = overrides.setAutoDraw || (async () => ({ enabled: false, nextTickAt: null, version: 1 }));
  playgroundService.drawHistory = overrides.drawHistory || (async () => ({ total: 0, items: [] }));
  playgroundService.listWinners = overrides.listWinners || (async () => ({ total: 0, items: [] }));
  playgroundService.claimWinner = overrides.claimWinner || (async () => ({ winnerId: WINNER_ID, claimed: true, version: 2 }));

  try {
    await run();
  } finally {
    playgroundService.getPoolState = original.getPoolState;
    playgroundService.drawNext = original.drawNext;
    playgroundService.setAutoDraw = original.setAutoDraw;
    playgroundService.drawHistory = original.drawHistory;
    playgroundService.listWinners = original.listWinners;
    playgroundService.claimWinner = original.claimWinner;
  }
};

test('playground draw-next route returns 201 with service payload', async () => {
  const restoreQuery = installQueryMock(['RUN_DRAWS']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/playground/draw/next`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ expectedVersion: 4 }),
        });

        const body = await response.json();
        assert.equal(response.status, 201);
        assert.equal(body.drawPosition, 1);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      drawNext: async () => ({ drawId: 'draw-1', drawPosition: 1, calledNumber: 10, winners: [], version: 5 }),
    });
  } finally {
    restoreQuery();
  }
});

test('playground claim route validates winnerId', async () => {
  const restoreQuery = installQueryMock(['CLAIM_PRIZES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-winners/not-a-uuid/claim`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
          },
          body: JSON.stringify({ expectedVersion: 1 }),
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

test('playground winners route enforces VIEW_WINNERS permission', async () => {
  const restoreQuery = installQueryMock(['VIEW_GAMES']);

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/playground/winners`, {
          headers: {
            Authorization: `Bearer ${makeToken()}`,
          },
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

test('playground happy path flow: draw-next then winners then claim', async () => {
  const restoreQuery = installQueryMock(['RUN_DRAWS', 'VIEW_WINNERS', 'CLAIM_PRIZES']);

  const flowState = {
    winners: [],
    version: 10,
  };

  try {
    await withServiceMocks(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();

        const drawResponse = await fetch(
          `http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/playground/draw/next`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${makeToken()}`,
            },
            body: JSON.stringify({ expectedVersion: 10 }),
          }
        );
        const drawBody = await drawResponse.json();

        assert.equal(drawResponse.status, 201);
        assert.equal(drawBody.drawPosition, 1);
        assert.equal(drawBody.winners.length, 1);

        const winnersResponse = await fetch(
          `http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/playground/winners`,
          {
            headers: {
              Authorization: `Bearer ${makeToken()}`,
            },
          }
        );
        const winnersBody = await winnersResponse.json();

        assert.equal(winnersResponse.status, 200);
        assert.equal(winnersBody.total, 1);
        assert.equal(winnersBody.items[0].isClaimed, false);

        const claimResponse = await fetch(
          `http://127.0.0.1:${port}/game-winners/${flowState.winners[0].winnerId}/claim`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${makeToken()}`,
            },
            body: JSON.stringify({ expectedVersion: flowState.version }),
          }
        );
        const claimBody = await claimResponse.json();

        assert.equal(claimResponse.status, 200);
        assert.equal(claimBody.claimed, true);

        const winnersAfterClaimResponse = await fetch(
          `http://127.0.0.1:${port}/game-sessions/${SESSION_ID}/playground/winners?claimed=true`,
          {
            headers: {
              Authorization: `Bearer ${makeToken()}`,
            },
          }
        );
        const winnersAfterClaimBody = await winnersAfterClaimResponse.json();

        assert.equal(winnersAfterClaimResponse.status, 200);
        assert.equal(winnersAfterClaimBody.total, 1);
        assert.equal(winnersAfterClaimBody.items[0].isClaimed, true);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, {
      drawNext: async () => {
        const winner = {
          winnerId: WINNER_ID,
          sessionId: SESSION_ID,
          cardId: 'b86d56d7-0f86-4180-b95a-5891a1e31f95',
          cardNumber: 7,
          beerQuantity: 2,
          isClaimed: false,
        };
        flowState.winners = [winner];
        flowState.version = 11;

        return {
          drawId: 'f0ab6e31-8657-4ae7-b090-501ed4f63acf',
          drawPosition: 1,
          calledNumber: 33,
          winners: [winner],
          version: flowState.version,
        };
      },
      listWinners: async (req) => {
        const claimedFilter = req.query.claimed;

        let items = flowState.winners;
        if (claimedFilter === 'true') {
          items = items.filter((item) => item.isClaimed === true);
        }
        if (claimedFilter === 'false') {
          items = items.filter((item) => item.isClaimed === false);
        }

        return {
          total: items.length,
          items,
        };
      },
      claimWinner: async () => {
        flowState.winners = flowState.winners.map((item) => ({
          ...item,
          isClaimed: true,
        }));
        flowState.version += 1;

        return {
          winnerId: WINNER_ID,
          sessionId: SESSION_ID,
          claimed: true,
          claimedAt: '2026-01-01T12:00:00.000Z',
          version: flowState.version,
        };
      },
    });
  } finally {
    restoreQuery();
  }
});
