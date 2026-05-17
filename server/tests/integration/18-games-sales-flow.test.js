import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

async function createBranch(token, hotelCompanyId, prefix = 'GS') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Sales Branch ${uniqueSuffix()}`,
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

async function topupWallet(token, hotelCompanyId, suffix = 'SALE') {
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

async function createGame(token, branchId, title = 'Sales Flow Game') {
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
      description: 'Fee before sales',
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
    body: { seed: 'sales-seed-001' },
  });

  assert.equal(
    generateRes.response.status,
    201,
    `Expected 201 generate, got ${generateRes.response.status} body=${JSON.stringify(generateRes.json)}`
  );
}

async function activateGame(token, gameId) {
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
}

test('sell card succeeds for ACTIVE game and blocks duplicate sale of same card', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, 'SALE-HAPPY');

  const branchId = await createBranch(token, hotelCompanyId, 'GS1');
  const gameId = await createGame(token, branchId, 'Sales Happy Path Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);
  await generateCards(token, gameId);
  await activateGame(token, gameId);

  const saleRes = await apiRequest(`/games/${gameId}/sales`, {
    method: 'POST',
    token,
    body: {
      cardNumber: 1,
      amount: 50,
      paymentMethod: 'CASH',
      customerName: 'John Buyer',
      customerPhone: '+251900000001',
    },
  });

  assert.equal(
    saleRes.response.status,
    201,
    `Expected 201 sale, got ${saleRes.response.status} body=${JSON.stringify(saleRes.json)}`
  );
  assert.ok(saleRes.json?.saleId, 'Expected saleId');
  assert.equal(saleRes.json?.cardNumber, 1);
  assert.equal(saleRes.json?.cardStatus, 'SOLD');
  assert.equal(saleRes.json?.paymentMethod, 'CASH');

  const duplicateSaleRes = await apiRequest(`/games/${gameId}/sales`, {
    method: 'POST',
    token,
    body: {
      cardNumber: 1,
      amount: 50,
      paymentMethod: 'CASH',
    },
  });

  assert.equal(
    duplicateSaleRes.response.status,
    409,
    `Expected 409 duplicate sale, got ${duplicateSaleRes.response.status} body=${JSON.stringify(duplicateSaleRes.json)}`
  );
  assert.equal(duplicateSaleRes.json?.code, 'CARD_NOT_AVAILABLE');
});

test('sell card is blocked when game is not ACTIVE', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, 'SALE-NOTACTIVE');

  const branchId = await createBranch(token, hotelCompanyId, 'GS2');
  const gameId = await createGame(token, branchId, 'Sales Game Not Active');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);
  await generateCards(token, gameId);

  const saleRes = await apiRequest(`/games/${gameId}/sales`, {
    method: 'POST',
    token,
    body: {
      cardNumber: 2,
      amount: 50,
      paymentMethod: 'CASH',
    },
  });

  assert.equal(
    saleRes.response.status,
    400,
    `Expected 400 game not active, got ${saleRes.response.status} body=${JSON.stringify(saleRes.json)}`
  );
  assert.equal(saleRes.json?.code, 'GAME_NOT_ACTIVE');
});
