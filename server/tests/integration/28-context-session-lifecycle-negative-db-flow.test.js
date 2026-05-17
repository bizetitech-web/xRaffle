import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

async function createBranch(token, hotelCompanyId, prefix = 'SN') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Session Negative Branch ${uniqueSuffix()}`,
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

async function createGame(token, branchId, title) {
  const gameRes = await apiRequest('/games', {
    method: 'POST',
    token,
    body: {
      branchId,
      title,
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

test('DB-backed context session start returns VERSION_CONFLICT when expectedVersion is stale', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const branchId = await createBranch(token, hotelCompanyId, 'SN1');
  const gameId = await createGame(token, branchId, 'Session Version Conflict Flow');

  const startRes = await apiRequest(`/game-sessions/${gameId}/start`, {
    method: 'POST',
    token,
    body: { expectedVersion: 1 },
  });

  assert.equal(
    startRes.response.status,
    409,
    `Expected 409 conflict, got ${startRes.response.status} body=${JSON.stringify(startRes.json)}`
  );
  assert.equal(startRes.json?.code, 'VERSION_CONFLICT');
});

test('DB-backed context session pause returns SESSION_INVALID_STATE from PENDING', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const branchId = await createBranch(token, hotelCompanyId, 'SN2');
  const gameId = await createGame(token, branchId, 'Session Invalid State Flow');

  const pauseRes = await apiRequest(`/game-sessions/${gameId}/pause`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(
    pauseRes.response.status,
    409,
    `Expected 409 invalid state, got ${pauseRes.response.status} body=${JSON.stringify(pauseRes.json)}`
  );
  assert.equal(pauseRes.json?.code, 'SESSION_INVALID_STATE');
});
