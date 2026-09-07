import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../../config/database.js';
import { gameChargesService } from '../../../src/contexts/gameCharges/gameCharges.service.js';

const makeReq = ({
  gameId = '11111111-1111-1111-1111-111111111111',
  chargeAmount = 50,
  chargePercentage = null,
  userId = 'user-1',
  idempotencyKey = null,
} = {}) => ({
  params: { gameId },
  body: {
    chargeAmount,
    ...(chargePercentage === null ? {} : { chargePercentage }),
  },
  user: {
    sub: userId,
  },
  idempotencyKey,
});

const withMockedConnection = async (run) => {
  const originalGetConnection = pool.getConnection;

  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async () => [[]],
  };

  pool.getConnection = async () => connection;

  try {
    await run({ connection });
  } finally {
    pool.getConnection = originalGetConnection;
  }
};

test('upsertCharge idempotency replay returns persisted payload', async () => {
  await withMockedConnection(async ({ connection }) => {
    let reservedRequestHash = null;

    connection.query = async (sql, params = []) => {
      const normalized = String(sql || '').toUpperCase().replace(/\s+/g, ' ').trim();

      if (normalized.includes('FROM GAMES WHERE ID = ?')) {
        return [[{ id: 'game-1', branch_id: 'branch-1' }]];
      }

      if (normalized.startsWith('INSERT INTO WALLET_IDEMPOTENCY_REQUESTS')) {
        reservedRequestHash = params[3];
        return [{}];
      }

      if (normalized.includes('FROM WALLET_IDEMPOTENCY_REQUESTS') && normalized.includes('FOR UPDATE')) {
        return [[{
          id: 'idem-row-1',
          requestHash: reservedRequestHash,
          responseCode: 200,
          responseBody: JSON.stringify({
            id: 'charge-1',
            game_id: 'game-1',
            charge_amount: 50,
            charge_percentage: null,
            idempotencyStatus: 'new',
          }),
          status: 'COMPLETED',
        }]];
      }

      if (normalized.includes('FROM GAME_CHARGES WHERE GAME_ID = ? LIMIT 1')) {
        throw new Error('game_charges query should not run for idempotency replay');
      }

      return [[]];
    };

    const result = await gameChargesService.upsertCharge(makeReq({
      gameId: 'game-1',
      chargeAmount: 50,
      idempotencyKey: 'charge-replay-key-001',
    }));

    assert.equal(result.id, 'charge-1');
    assert.equal(result.game_id, 'game-1');
    assert.equal(result.charge_amount, 50);
    assert.equal(result.idempotencyStatus, 'replay');
  });
});

test('upsertCharge idempotency rejects payload conflict for same key', async () => {
  await withMockedConnection(async ({ connection }) => {
    let reservedRequestHash = null;

    connection.query = async (sql, params = []) => {
      const normalized = String(sql || '').toUpperCase().replace(/\s+/g, ' ').trim();

      if (normalized.includes('FROM GAMES WHERE ID = ?')) {
        return [[{ id: 'game-1', branch_id: 'branch-1' }]];
      }

      if (normalized.startsWith('INSERT INTO WALLET_IDEMPOTENCY_REQUESTS')) {
        reservedRequestHash = params[3];
        return [{}];
      }

      if (normalized.includes('FROM WALLET_IDEMPOTENCY_REQUESTS') && normalized.includes('FOR UPDATE')) {
        return [[{
          id: 'idem-row-1',
          requestHash: `${reservedRequestHash}-mismatch`,
          responseCode: null,
          responseBody: null,
          status: 'PENDING',
        }]];
      }

      return [[]];
    };

    await assert.rejects(
      () => gameChargesService.upsertCharge(makeReq({
        gameId: 'game-1',
        chargeAmount: 50,
        idempotencyKey: 'charge-conflict-key-001',
      })),
      (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, 'IDEMPOTENCY_KEY_CONFLICT');
        return true;
      }
    );
  });
});
