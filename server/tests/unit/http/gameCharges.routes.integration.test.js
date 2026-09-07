import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

import pool from '../../../config/database.js';
import gameChargesRoutes from '../../../src/contexts/gameCharges/gameCharges.routes.js';
import { gameChargesService } from '../../../src/contexts/gameCharges/gameCharges.service.js';
import { errorHandler } from '../../../middleware/errorHandler.js';

const TOKEN_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const GAME_ID = '9d1b8f5c-7e34-4b92-9f13-92aaab6c3d10';

const makeToken = (sub = 'user-1') => jwt.sign({ sub }, TOKEN_SECRET, { expiresIn: '1h' });

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(gameChargesRoutes);
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

const withServiceMock = async (run, override) => {
  const original = gameChargesService.upsertCharge;
  gameChargesService.upsertCharge = override;

  try {
    await run();
  } finally {
    gameChargesService.upsertCharge = original;
  }
};

test('game charge route sets idempotency headers when key is provided', async () => {
  const restoreQuery = installQueryMock(['MANAGE_GAMES']);

  try {
    await withServiceMock(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/games/${GAME_ID}/charge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
            'Idempotency-Key': 'charge-idem-key-001',
          },
          body: JSON.stringify({ feeAmount: 50 }),
        });

        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-idempotency-status'), 'replay');
        assert.equal(response.headers.get('x-idempotency-replayed'), 'true');
        assert.equal(response.headers.get('x-idempotency-key'), 'charge-idem-key-001');
        assert.equal(body.idempotencyStatus, 'replay');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, async (req) => {
      assert.equal(req.body.chargeAmount, 50);
      return {
        id: 'charge-1',
        game_id: GAME_ID,
        charge_amount: 50,
        charge_percentage: null,
        idempotencyStatus: 'replay',
      };
    });
  } finally {
    restoreQuery();
  }
});

test('game charge route rejects malformed Idempotency-Key', async () => {
  const restoreQuery = installQueryMock(['MANAGE_GAMES']);

  try {
    await withServiceMock(async () => {
      const app = makeApp();
      const server = app.listen(0);

      try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/games/${GAME_ID}/charge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${makeToken()}`,
            'Idempotency-Key': 'bad key with spaces',
          },
          body: JSON.stringify({ feeAmount: 50 }),
        });

        const body = await response.json();
        assert.equal(response.status, 400);
        assert.equal(body.code, 'VALIDATION_ERROR');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }, async () => ({ id: 'should-not-run' }));
  } finally {
    restoreQuery();
  }
});
