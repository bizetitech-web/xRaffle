import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

async function createBranch(token, hotelCompanyId, prefix = 'CG') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Cards Branch ${uniqueSuffix()}`,
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

async function createGame(token, branchId, title = 'Cards Generate Game') {
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

async function configurePrizes(token, gameId) {
  const prizesRes = await apiRequest(`/games/${gameId}/prizes`, {
    method: 'POST',
    token,
    body: {
      prizes: [
        { drawPosition: 1, beerQuantity: 3 },
        { drawPosition: 2, beerQuantity: 2 },
        { drawPosition: 3, beerQuantity: 2 },
        { drawPosition: 4, beerQuantity: 3 },
      ],
    },
  });

  assert.equal(
    prizesRes.response.status,
    201,
    `Expected 201 prizes, got ${prizesRes.response.status} body=${JSON.stringify(prizesRes.json)}`
  );
}

async function chargeGame(token, gameId) {
  const chargeRes = await apiRequest(`/games/${gameId}/charge`, {
    method: 'POST',
    token,
    body: {
      feeAmount: 50,
      description: 'Fee before card generation',
    },
  });

  assert.equal(
    chargeRes.response.status,
    200,
    `Expected 200 charge, got ${chargeRes.response.status} body=${JSON.stringify(chargeRes.json)}`
  );
}

test('generate cards succeeds after prerequisites and blocks duplicate generation', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const topupRes = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    body: {
      amount: 100,
      paymentMethod: 'CASH',
      referenceNumber: `CARDS-TOPUP-${Date.now()}`,
    },
  });
  assert.equal(topupRes.response.status, 201, `Expected 201 topup, got ${topupRes.response.status}`);

  const branchId = await createBranch(token, hotelCompanyId, 'CGA');
  const gameId = await createGame(token, branchId, 'Cards Happy Path Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);

  const generateRes = await apiRequest(`/games/${gameId}/cards/generate`, {
    method: 'POST',
    token,
    body: { seed: 'cards-seed-001' },
  });

  assert.equal(
    generateRes.response.status,
    201,
    `Expected 201 generate, got ${generateRes.response.status} body=${JSON.stringify(generateRes.json)}`
  );
  assert.equal(generateRes.json?.cardsGenerated, 25);
  assert.equal(generateRes.json?.numbersPerCard, 4);
  assert.equal(generateRes.json?.status, 'PENDING');

  const gameDetailRes = await apiRequest(`/games/${gameId}`, { token });
  assert.equal(gameDetailRes.response.status, 200, `Expected 200 detail, got ${gameDetailRes.response.status}`);
  assert.equal(gameDetailRes.json?.status, 'PENDING');

  const secondGenerateRes = await apiRequest(`/games/${gameId}/cards/generate`, {
    method: 'POST',
    token,
    body: { seed: 'cards-seed-001' },
  });

  assert.equal(secondGenerateRes.response.status, 409, `Expected 409 duplicate generation, got ${secondGenerateRes.response.status}`);
  assert.equal(secondGenerateRes.json?.code, 'CARDS_ALREADY_GENERATED');
});

test('generate cards is blocked until fee is charged', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const branchId = await createBranch(token, hotelCompanyId, 'CGB');
  const gameId = await createGame(token, branchId, 'Cards Missing Charge Game');

  await configurePrizes(token, gameId);

  const generateRes = await apiRequest(`/games/${gameId}/cards/generate`, {
    method: 'POST',
    token,
    body: { seed: 'cards-seed-002' },
  });

  assert.equal(generateRes.response.status, 400, `Expected 400 missing charge, got ${generateRes.response.status}`);
  assert.equal(generateRes.json?.code, 'GAME_NOT_CHARGED');
});

test('generate cards is blocked until prize matrix is configured', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const topupRes = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    body: {
      amount: 100,
      paymentMethod: 'CASH',
      referenceNumber: `CARDS-TOPUP-PRIZE-${Date.now()}`,
    },
  });
  assert.equal(topupRes.response.status, 201, `Expected 201 topup, got ${topupRes.response.status}`);

  const branchId = await createBranch(token, hotelCompanyId, 'CGC');
  const gameId = await createGame(token, branchId, 'Cards Missing Prize Game');

  await chargeGame(token, gameId);

  const generateRes = await apiRequest(`/games/${gameId}/cards/generate`, {
    method: 'POST',
    token,
    body: { seed: 'cards-seed-003' },
  });

  assert.equal(generateRes.response.status, 400, `Expected 400 missing prizes, got ${generateRes.response.status}`);
  assert.equal(generateRes.json?.code, 'PRIZES_NOT_CONFIGURED');
});
