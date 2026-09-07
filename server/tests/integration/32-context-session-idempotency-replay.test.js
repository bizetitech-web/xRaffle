import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  apiRequestWithIdempotency,
  buildIdempotencyKey,
  uniqueSuffix,
  topupWallet,
} from './helpers/apiClient.js';
import {
  openIntegrationDbConnection,
  assertWalletIdempotencyCompleted,
  assertReplayMatchesPersistedPayloadHash,
} from './helpers/idempotencyAssertions.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);
const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
const START_SESSION_IDEMPOTENCY_ENDPOINT = 'POST:/api/game-sessions/:sessionId/start';

async function createBranch(token, hotelCompanyId, prefix = 'IDEM') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Idempotency Branch ${uniqueSuffix()}`,
      branchCode,
      status: 'ACTIVE',
    },
  });

  assert.equal(
    branchRes.response.status,
    201,
    `Expected 201 branch, got ${branchRes.response.status} body=${JSON.stringify(branchRes.json)}`
  );

  return branchRes.json?.branchId;
}

async function createGame(token, branchId) {
  const gameRes = await apiRequest('/games', {
    method: 'POST',
    token,
    body: {
      branchId,
      title: `Idempotency Start ${uniqueSuffix()}`,
      cardPrice: 50,
      totalCards: 25,
      numbersPerCard: 4,
      totalPrizeBeers: 10,
      totalNumbersPool: 100,
    },
  });

  assert.equal(
    gameRes.response.status,
    201,
    `Expected 201 game, got ${gameRes.response.status} body=${JSON.stringify(gameRes.json)}`
  );

  return gameRes.json?.id;
}

test('start session replays same payload for duplicate Idempotency-Key', { skip: !hasCreds }, async () => {
  const { token, user } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const branchId = await createBranch(token, hotelCompanyId, 'IDEM1');
  const gameId = await createGame(token, branchId);

  const idempotencyKey = buildIdempotencyKey('start-replay');

  const first = await apiRequestWithIdempotency(`/game-sessions/${gameId}/start`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: {},
  });

  assert.equal(first.response.status, 200, `Expected 200 on first start, got ${first.response.status} body=${JSON.stringify(first.json)}`);
  assert.equal(first.response.headers.get('x-idempotency-status'), 'new');
  assert.equal(first.response.headers.get('x-idempotency-replayed'), 'false');
  assert.equal(first.response.headers.get('x-idempotency-key'), idempotencyKey);
  assert.equal(first.json?.status, 'ACTIVE');
  assert.equal(first.json?.idempotencyStatus, 'new');

  const second = await apiRequestWithIdempotency(`/game-sessions/${gameId}/start`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: {},
  });

  assert.equal(second.response.status, 200, `Expected 200 on replay start, got ${second.response.status} body=${JSON.stringify(second.json)}`);
  assert.equal(second.response.headers.get('x-idempotency-status'), 'replay');
  assert.equal(second.response.headers.get('x-idempotency-replayed'), 'true');
  assert.equal(second.response.headers.get('x-idempotency-key'), idempotencyKey);
  assert.equal(second.json?.idempotencyStatus, 'replay');

  const expectedReplay = {
    ...first.json,
    idempotencyStatus: 'replay',
  };
  assert.deepEqual(second.json, expectedReplay, 'Expected replay payload to match first response (except idempotencyStatus)');

  if (hasDbConfig) {
    const db = await openIntegrationDbConnection();
    try {
      const { persistedPayload } = await assertWalletIdempotencyCompleted({
        connection: db,
        endpoint: `${START_SESSION_IDEMPOTENCY_ENDPOINT}:${gameId}:${user?.id || 'anonymous'}`,
        idempotencyKey,
      });

      assertReplayMatchesPersistedPayloadHash({
        persistedPayload,
        replayPayload: second.json,
      });
    } finally {
      await db.end();
    }
  }
});

test('duplicate start with same key creates only one wallet transaction', { skip: !hasCreds || !hasDbConfig }, async () => {
  const db = await openIntegrationDbConnection();

  try {
    const { token, user } = await loginAsAdmin();
    const { hotelCompanyId } = await createOrganization(token);
    const branchId = await createBranch(token, hotelCompanyId, 'IDEM3');
    const gameId = await createGame(token, branchId);

    await topupWallet(token, hotelCompanyId, {
      amount: 200,
      referenceNumber: `IDEM-TOPUP-${uniqueSuffix()}`,
    });

    await db.query(
      `INSERT INTO game_charges (id, game_id, charge_amount, charge_percentage, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [randomUUID(), gameId, 75, 0]
    );

    const idempotencyKey = buildIdempotencyKey('start-wallet');

    const first = await apiRequestWithIdempotency(`/game-sessions/${gameId}/start`, {
      method: 'POST',
      token,
      idempotencyKey,
      body: {},
    });
    assert.equal(first.response.status, 200, `Expected 200 first start, got ${first.response.status} body=${JSON.stringify(first.json)}`);

    const second = await apiRequestWithIdempotency(`/game-sessions/${gameId}/start`, {
      method: 'POST',
      token,
      idempotencyKey,
      body: {},
    });
    assert.equal(second.response.status, 200, `Expected 200 replay start, got ${second.response.status} body=${JSON.stringify(second.json)}`);
    assert.equal(second.response.headers.get('x-idempotency-replayed'), 'true');

    const { persistedPayload } = await assertWalletIdempotencyCompleted({
      connection: db,
      endpoint: `${START_SESSION_IDEMPOTENCY_ENDPOINT}:${gameId}:${user?.id || 'anonymous'}`,
      idempotencyKey,
    });

    assertReplayMatchesPersistedPayloadHash({
      persistedPayload,
      replayPayload: second.json,
    });

    const [[txCountRow]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM wallet_transactions
       WHERE reference_type = 'GAME_CHARGE' AND reference_id = ?`,
      [gameId]
    );

    assert.equal(Number(txCountRow?.total || 0), 1, 'Expected exactly one wallet transaction for duplicate start requests with same key');
  } finally {
    await db.end();
  }
});

test('start session auto-generates Idempotency-Key header when missing', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const branchId = await createBranch(token, hotelCompanyId, 'IDEM2');
  const gameId = await createGame(token, branchId);

  const response = await apiRequest(`/game-sessions/${gameId}/start`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(response.response.status, 200, `Expected 200 missing key with auto-generation, got ${response.response.status} body=${JSON.stringify(response.json)}`);
  const generatedKey = response.response.headers.get('x-idempotency-key');
  assert.ok(generatedKey, 'Expected X-Idempotency-Key header for auto-generated value');
  assert.match(generatedKey, /^[A-Za-z0-9._:-]{8,128}$/);
  assert.equal(response.response.headers.get('x-idempotency-status'), 'new');
  assert.equal(response.response.headers.get('x-idempotency-replayed'), 'false');
  assert.equal(response.json?.idempotencyStatus, 'new');
});
