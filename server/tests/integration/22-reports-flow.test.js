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

function todayDateString() {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return localDate.toISOString().slice(0, 10);
}

async function createBranch(token, hotelCompanyId, prefix = 'RP') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Report Branch ${uniqueSuffix()}`,
      branchCode,
      status: 'ACTIVE',
    },
  });

  assert.equal(branchRes.response.status, 201, `Expected 201 branch, got ${branchRes.response.status}`);
  return branchRes.json?.branchId;
}

async function topupWallet(token, hotelCompanyId, amount, suffix = 'REPORT') {
  const topupRes = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    body: {
      amount,
      paymentMethod: 'CASH',
      referenceNumber: `${suffix}-TOPUP-${Date.now()}`,
    },
  });

  assert.equal(topupRes.response.status, 201, `Expected 201 topup, got ${topupRes.response.status}`);
}

async function createGame(token, branchId, title = 'Reporting Flow Game') {
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
      description: 'Fee for reporting flow',
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

async function startDraw(token, gameId) {
  const drawStartRes = await apiRequest(`/games/${gameId}/draw/start`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(drawStartRes.response.status, 200, `Expected 200 draw start, got ${drawStartRes.response.status}`);
}

test('branch daily report returns expected completed lifecycle metrics', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const reportDate = todayDateString();

  await topupWallet(token, hotelCompanyId, 200, 'REPORT-BRANCH');
  const branchId = await createBranch(token, hotelCompanyId, 'RP1');
  const gameId = await createGame(token, branchId, 'Branch Report Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);

  const seed = 'report-seed-001';
  await generateCards(token, gameId, seed);
  await activateGame(token, gameId);
  await sellCard(token, gameId, 1);
  await startDraw(token, gameId);

  const rng = createSeededRng(seed);
  const cardOneNumbers = generateUniqueCardNumbers(4, 100, rng);
  const firstWinningNumber = cardOneNumbers[0];

  const drawRes = await apiRequest(`/games/${gameId}/draw/next`, {
    method: 'POST',
    token,
    body: { forceNumber: firstWinningNumber },
  });
  assert.equal(drawRes.response.status, 201, `Expected 201 draw next, got ${drawRes.response.status}`);

  const reportRes = await apiRequest(`/reports/branches/${branchId}/daily?date=${reportDate}`, { token });
  assert.equal(reportRes.response.status, 200, `Expected 200 branch report, got ${reportRes.response.status}`);

  assert.equal(reportRes.json?.branchId, branchId);
  assert.equal(reportRes.json?.date, reportDate);
  assert.equal(reportRes.json?.gamesPlayed, 1);
  assert.equal(reportRes.json?.cardsSold, 1);
  assert.equal(reportRes.json?.salesRevenue, 50);
  assert.equal(reportRes.json?.beersDistributed, 3);
  assert.equal(reportRes.json?.walletDeductions, 50);
});

test('company wallet range report returns opening/closing and transaction totals', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const reportDate = todayDateString();

  await topupWallet(token, hotelCompanyId, 200, 'REPORT-WALLET');
  const branchId = await createBranch(token, hotelCompanyId, 'RP2');
  const gameId = await createGame(token, branchId, 'Wallet Report Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);

  const reportRes = await apiRequest(`/reports/companies/${hotelCompanyId}/wallet?from=${reportDate}&to=${reportDate}`, { token });
  assert.equal(reportRes.response.status, 200, `Expected 200 wallet report, got ${reportRes.response.status}`);

  assert.equal(reportRes.json?.companyId, hotelCompanyId);
  assert.equal(reportRes.json?.from, reportDate);
  assert.equal(reportRes.json?.to, reportDate);
  assert.equal(reportRes.json?.openingBalance, 0);
  assert.equal(reportRes.json?.topups, 200);
  assert.equal(reportRes.json?.gameFees, 50);
  assert.equal(reportRes.json?.transactions, 2);
  assert.equal(reportRes.json?.closingBalance, 150);
});
