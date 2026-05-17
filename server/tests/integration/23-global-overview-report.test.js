import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
  createUser,
  loginWithCredentials,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);
const MANAGER_ROLE_ID = '79a386a7-207b-11f1-89b6-a4e078b831cc';

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

async function createBranch(token, hotelCompanyId, prefix = 'GR') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Global Report Branch ${uniqueSuffix()}`,
      branchCode,
      status: 'ACTIVE',
    },
  });

  assert.equal(branchRes.response.status, 201, `Expected 201 branch, got ${branchRes.response.status}`);
  return branchRes.json?.branchId;
}

async function createGame(token, branchId, title = 'Global Report Game') {
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

async function topupWallet(token, hotelCompanyId, amount, suffix = 'GLOBAL') {
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
      description: 'Fee for global report test',
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

test('global overview report returns KPI deltas and daily trend window for super admin', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const today = todayDateString();

  const baselineRes = await apiRequest(`/reports/global/overview?from=${today}&to=${today}`, { token });
  assert.equal(baselineRes.response.status, 200, `Expected 200 baseline report, got ${baselineRes.response.status}`);

  const baseline = baselineRes.json;
  const baselinePoint = baseline?.trend?.points?.find((p) => p.date === today) || {
    cardsSold: 0,
    salesRevenue: 0,
    topups: 0,
    gameFees: 0,
    completedGames: 0,
  };

  const { hotelCompanyId } = await createOrganization(token);
  await topupWallet(token, hotelCompanyId, 200, 'GLOBAL-REPORT');
  const branchId = await createBranch(token, hotelCompanyId, 'GR1');
  const gameId = await createGame(token, branchId, 'Global KPI Game');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);

  const seed = 'global-seed-001';
  await generateCards(token, gameId, seed);
  await activateGame(token, gameId);
  await sellCard(token, gameId, 1);
  await startDraw(token, gameId);

  const rng = createSeededRng(seed);
  const cardOneNumbers = generateUniqueCardNumbers(4, 100, rng);
  const drawNumbers = [cardOneNumbers[0], 97, 98, 99];
  for (const drawNumber of drawNumbers) {
    const drawRes = await apiRequest(`/games/${gameId}/draw/next`, {
      method: 'POST',
      token,
      body: { forceNumber: drawNumber },
    });
    assert.equal(drawRes.response.status, 201, `Expected 201 draw for number ${drawNumber}, got ${drawRes.response.status}`);
  }

  const completeRes = await apiRequest(`/games/${gameId}/complete`, {
    method: 'POST',
    token,
    body: {},
  });
  assert.equal(completeRes.response.status, 200, `Expected 200 complete, got ${completeRes.response.status}`);

  const reportRes = await apiRequest(`/reports/global/overview?from=${today}&to=${today}`, { token });
  assert.equal(reportRes.response.status, 200, `Expected 200 global report, got ${reportRes.response.status}`);

  const report = reportRes.json;
  assert.equal(report.from, today);
  assert.equal(report.to, today);
  assert.ok(report.kpis, 'Expected kpis object');
  assert.ok(Array.isArray(report?.trend?.points), 'Expected trend points array');
  assert.equal(report.trend?.granularity, 'day');

  assert.ok(report.kpis.totalCompanies >= baseline.kpis.totalCompanies + 1);
  assert.ok(report.kpis.salesRevenue >= baseline.kpis.salesRevenue + 50);
  assert.ok(report.kpis.walletTopups >= baseline.kpis.walletTopups + 200);
  assert.ok(report.kpis.walletGameFees >= baseline.kpis.walletGameFees + 50);
  assert.ok(report.kpis.completedGames >= baseline.kpis.completedGames + 1);

  const todayPoint = report.trend.points.find((p) => p.date === today);
  assert.ok(todayPoint, 'Expected trend point for current day');
  assert.ok(todayPoint.cardsSold >= baselinePoint.cardsSold + 1);
  assert.ok(todayPoint.salesRevenue >= baselinePoint.salesRevenue + 50);
  assert.ok(todayPoint.topups >= baselinePoint.topups + 200);
  assert.ok(todayPoint.gameFees >= baselinePoint.gameFees + 50);
  assert.ok(todayPoint.completedGames >= baselinePoint.completedGames + 1);
});

test('global overview report is denied for non-super-admin role', { skip: !hasCreds }, async () => {
  const { token: superToken } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(superToken);

  const managerUser = await createUser(superToken, {
    hotelCompanyId,
    roleId: MANAGER_ROLE_ID,
    firstName: 'Manager',
    lastName: 'Reporter',
  });

  const { token: managerToken } = await loginWithCredentials(managerUser.email, managerUser.password);
  const today = todayDateString();

  const reportRes = await apiRequest(`/reports/global/overview?from=${today}&to=${today}`, {
    token: managerToken,
  });

  assert.equal(reportRes.response.status, 403, `Expected 403 for non-super-admin, got ${reportRes.response.status}`);
});
