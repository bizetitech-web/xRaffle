import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

function createSeededRng(seedInput) {
  let h = 2166136261;
  const text = String(seedInput || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateUniqueCardNumbers(numbersPerCard, totalNumbersPool, rng) {
  const picked = new Set();
  while (picked.size < numbersPerCard) {
    picked.add(1 + Math.floor(rng() * totalNumbersPool));
  }
  return Array.from(picked).sort((a, b) => a - b);
}

async function createBranch(token, hotelCompanyId, prefix = 'GD') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Draw Branch ${uniqueSuffix()}`,
      branchCode,
      status: 'ACTIVE',
    },
  });

  assert.equal(branchRes.response.status, 201, `Expected 201 branch, got ${branchRes.response.status}`);
  return branchRes.json?.branchId;
}

async function topupWallet(token, hotelCompanyId, suffix = 'DRAW') {
  const topupRes = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    body: {
      amount: 100,
      paymentMethod: 'CASH',
      referenceNumber: `${suffix}-TOPUP-${Date.now()}`,
    },
  });

  assert.equal(topupRes.response.status, 201, `Expected 201 topup, got ${topupRes.response.status}`);
}

async function createGame(token, branchId, title = 'Draw Flow Game') {
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

  assert.equal(gameRes.response.status, 201, `Expected 201 game, got ${gameRes.response.status}`);
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

  assert.equal(prizesRes.response.status, 201, `Expected 201 prizes, got ${prizesRes.response.status}`);
}

async function chargeGame(token, gameId) {
  const chargeRes = await apiRequest(`/games/${gameId}/charge`, {
    method: 'POST',
    token,
    body: {
      feeAmount: 50,
      description: 'Fee before draw flow',
    },
  });

  assert.equal(chargeRes.response.status, 200, `Expected 200 charge, got ${chargeRes.response.status}`);
}

async function generateCards(token, gameId, seed) {
  const generateRes = await apiRequest(`/games/${gameId}/cards/generate`, {
    method: 'POST',
    token,
    body: { seed },
  });

  assert.equal(generateRes.response.status, 201, `Expected 201 generate, got ${generateRes.response.status}`);
}

async function activateGame(token, gameId) {
  const activateRes = await apiRequest(`/games/${gameId}/activate`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(activateRes.response.status, 200, `Expected 200 activate, got ${activateRes.response.status}`);
}

async function sellCard(token, gameId, cardNumber) {
  const saleRes = await apiRequest(`/games/${gameId}/sales`, {
    method: 'POST',
    token,
    body: {
      cardNumber,
      amount: 50,
      paymentMethod: 'CASH',
    },
  });

  assert.equal(saleRes.response.status, 201, `Expected 201 sale, got ${saleRes.response.status}`);
}

test('draw start and next enforce unique number and detect winners from card_numbers', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, 'DRAW-HAPPY');

  const branchId = await createBranch(token, hotelCompanyId, 'GD1');
  const gameId = await createGame(token, branchId, 'Draw Happy Path Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);

  const seed = 'draw-seed-001';
  await generateCards(token, gameId, seed);
  await activateGame(token, gameId);
  await sellCard(token, gameId, 1);

  const rng = createSeededRng(seed);
  const cardOneNumbers = generateUniqueCardNumbers(4, 100, rng);
  const winningNumber = cardOneNumbers[0];

  const drawStartRes = await apiRequest(`/games/${gameId}/draw/start`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(drawStartRes.response.status, 200, `Expected 200 draw start, got ${drawStartRes.response.status}`);
  assert.equal(drawStartRes.json?.status, 'DRAWING');

  const drawNextRes = await apiRequest(`/games/${gameId}/draw/next`, {
    method: 'POST',
    token,
    body: { forceNumber: winningNumber },
  });

  assert.equal(drawNextRes.response.status, 201, `Expected 201 draw next, got ${drawNextRes.response.status}`);
  assert.equal(drawNextRes.json?.winningNumber, winningNumber);
  assert.equal(drawNextRes.json?.drawPosition, 1);
  assert.equal(drawNextRes.json?.winnerCount, 1);
  assert.deepEqual(drawNextRes.json?.winnerCardNumbers, [1]);

  const duplicateNumberRes = await apiRequest(`/games/${gameId}/draw/next`, {
    method: 'POST',
    token,
    body: { forceNumber: winningNumber },
  });

  assert.equal(duplicateNumberRes.response.status, 409, `Expected 409 duplicate number, got ${duplicateNumberRes.response.status}`);
  assert.equal(duplicateNumberRes.json?.code, 'DRAW_NUMBER_ALREADY_USED');
});

test('draw next is blocked unless game is DRAWING', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, 'DRAW-NOTDRAWING');

  const branchId = await createBranch(token, hotelCompanyId, 'GD2');
  const gameId = await createGame(token, branchId, 'Draw Not Drawing Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);
  await generateCards(token, gameId, 'draw-seed-002');
  await activateGame(token, gameId);

  const drawNextRes = await apiRequest(`/games/${gameId}/draw/next`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(drawNextRes.response.status, 400, `Expected 400 not drawing, got ${drawNextRes.response.status}`);
  assert.equal(drawNextRes.json?.code, 'GAME_NOT_DRAWING');
});
