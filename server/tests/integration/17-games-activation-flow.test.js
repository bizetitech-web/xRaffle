import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

async function createBranch(token, hotelCompanyId, prefix = 'GA') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Activation Branch ${uniqueSuffix()}`,
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

async function createGame(token, branchId, title = 'Activation Game') {
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

async function topupWallet(token, hotelCompanyId, suffix = 'ACT') {
  const topupRes = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    body: {
      amount: 100,
      paymentMethod: 'CASH',
      referenceNumber: `${suffix}-TOPUP-${Date.now()}`,
    },
  });

  assert.equal(
    topupRes.response.status,
    201,
    `Expected 201 topup, got ${topupRes.response.status} body=${JSON.stringify(topupRes.json)}`
  );
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
      description: 'Fee before activation',
    },
  });

  assert.equal(
    chargeRes.response.status,
    200,
    `Expected 200 charge, got ${chargeRes.response.status} body=${JSON.stringify(chargeRes.json)}`
  );
}

async function generateCards(token, gameId) {
  const generateRes = await apiRequest(`/games/${gameId}/cards/generate`, {
    method: 'POST',
    token,
    body: {
      seed: 'activation-seed-001',
    },
  });

  assert.equal(
    generateRes.response.status,
    201,
    `Expected 201 cards generate, got ${generateRes.response.status} body=${JSON.stringify(generateRes.json)}`
  );
}

test('activate game succeeds after prizes + charge + cards', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, 'ACT-HAPPY');

  const branchId = await createBranch(token, hotelCompanyId, 'GA1');
  const gameId = await createGame(token, branchId, 'Activation Happy Path Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);
  await generateCards(token, gameId);

  const activateRes = await apiRequest(`/games/${gameId}/activate`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(
    activateRes.response.status,
    200,
    `Expected 200 activate, got ${activateRes.response.status} body=${JSON.stringify(activateRes.json)}`
  );
  assert.equal(activateRes.json?.status, 'ACTIVE');
  assert.equal(activateRes.json?.cardsGenerated, 25);

  const detailRes = await apiRequest(`/games/${gameId}`, { token });
  assert.equal(detailRes.response.status, 200, `Expected 200 detail, got ${detailRes.response.status}`);
  assert.equal(detailRes.json?.status, 'ACTIVE');
});

test('activate game blocked until cards are generated', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, 'ACT-NOCARDS');

  const branchId = await createBranch(token, hotelCompanyId, 'GA2');
  const gameId = await createGame(token, branchId, 'Activation Missing Cards Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);

  const activateRes = await apiRequest(`/games/${gameId}/activate`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(activateRes.response.status, 400, `Expected 400 missing cards, got ${activateRes.response.status}`);
  assert.equal(activateRes.json?.code, 'CARDS_NOT_GENERATED');
});

test('activate game blocked until game fee is charged', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const branchId = await createBranch(token, hotelCompanyId, 'GA3');
  const gameId = await createGame(token, branchId, 'Activation Missing Charge Game');

  await configurePrizes(token, gameId);

  const activateRes = await apiRequest(`/games/${gameId}/activate`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(activateRes.response.status, 400, `Expected 400 missing charge, got ${activateRes.response.status}`);
  assert.equal(activateRes.json?.code, 'GAME_NOT_CHARGED');
});

test('activate game blocked until prizes are configured', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, 'ACT-NOPRIZE');

  const branchId = await createBranch(token, hotelCompanyId, 'GA4');
  const gameId = await createGame(token, branchId, 'Activation Missing Prizes Game');

  await chargeGame(token, gameId);

  const activateRes = await apiRequest(`/games/${gameId}/activate`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(activateRes.response.status, 400, `Expected 400 missing prizes, got ${activateRes.response.status}`);
  assert.equal(activateRes.json?.code, 'PRIZES_NOT_CONFIGURED');
});
