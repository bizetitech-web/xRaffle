import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
  topupWallet,
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

async function createBranch(token, hotelCompanyId, prefix = 'PC') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Playground Context Branch ${uniqueSuffix()}`,
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

async function createGame(token, branchId, title = 'Playground Context DB Flow') {
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
      description: 'Fee before playground context flow',
    },
  });

  assert.equal(
    chargeRes.response.status,
    200,
    `Expected 200 charge, got ${chargeRes.response.status} body=${JSON.stringify(chargeRes.json)}`
  );
}

async function generateCards(token, gameId, seed) {
  const generateRes = await apiRequest(`/games/${gameId}/cards/generate`, {
    method: 'POST',
    token,
    body: { seed },
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

  assert.equal(
    saleRes.response.status,
    201,
    `Expected 201 sale, got ${saleRes.response.status} body=${JSON.stringify(saleRes.json)}`
  );
}

async function startDraw(token, gameId) {
  const drawStartRes = await apiRequest(`/games/${gameId}/draw/start`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(
    drawStartRes.response.status,
    200,
    `Expected 200 draw start, got ${drawStartRes.response.status} body=${JSON.stringify(drawStartRes.json)}`
  );
}

test('DB-backed context playground flow: pool -> draw-next -> winners -> claim', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, {
    amount: 100,
    paymentMethod: 'CASH',
    referenceNumber: `PGCTX-${uniqueSuffix()}`,
  });

  const branchId = await createBranch(token, hotelCompanyId, 'PC1');
  const gameId = await createGame(token, branchId, 'Playground Context Flow');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);

  const seed = 'phase1-playground-context-seed-001';
  await generateCards(token, gameId, seed);
  await activateGame(token, gameId);
  await sellCard(token, gameId, 1);
  await startDraw(token, gameId);

  const rng = createSeededRng(seed);
  const cardOneNumbers = generateUniqueCardNumbers(4, 100, rng);
  const forceNumber = cardOneNumbers[0];

  const poolBeforeRes = await apiRequest(`/game-sessions/${gameId}/playground/pool`, { token });
  assert.equal(
    poolBeforeRes.response.status,
    200,
    `Expected 200 pool before draw, got ${poolBeforeRes.response.status} body=${JSON.stringify(poolBeforeRes.json)}`
  );
  assert.equal(poolBeforeRes.json?.currentRound, 0);

  const drawNextRes = await apiRequest(`/game-sessions/${gameId}/playground/draw/next`, {
    method: 'POST',
    token,
    body: { forceNumber },
  });

  assert.equal(
    drawNextRes.response.status,
    201,
    `Expected 201 context draw next, got ${drawNextRes.response.status} body=${JSON.stringify(drawNextRes.json)}`
  );
  assert.equal(drawNextRes.json?.drawPosition, 1);
  assert.equal(drawNextRes.json?.calledNumber, forceNumber);
  assert.ok(Array.isArray(drawNextRes.json?.winners), 'Expected winners array in context draw response');
  assert.equal(drawNextRes.json?.winners?.length, 1, `Expected one winner, got ${JSON.stringify(drawNextRes.json)}`);

  const poolAfterRes = await apiRequest(`/game-sessions/${gameId}/playground/pool`, { token });
  assert.equal(
    poolAfterRes.response.status,
    200,
    `Expected 200 pool after draw, got ${poolAfterRes.response.status} body=${JSON.stringify(poolAfterRes.json)}`
  );
  assert.equal(poolAfterRes.json?.currentRound, 1);
  assert.ok(poolAfterRes.json?.calledNumbers?.includes(forceNumber), 'Expected called number to appear in pool state');

  const winnersRes = await apiRequest(`/game-sessions/${gameId}/playground/winners?claimed=false`, { token });
  assert.equal(
    winnersRes.response.status,
    200,
    `Expected 200 context winners list, got ${winnersRes.response.status} body=${JSON.stringify(winnersRes.json)}`
  );
  assert.equal(winnersRes.json?.total, 1, `Expected one unclaimed winner, got ${JSON.stringify(winnersRes.json)}`);

  const winnerId = winnersRes.json?.items?.[0]?.winnerId;
  assert.ok(winnerId, 'Expected winnerId in context winners list');

  const claimRes = await apiRequest(`/game-winners/${winnerId}/claim`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(
    claimRes.response.status,
    200,
    `Expected 200 context claim, got ${claimRes.response.status} body=${JSON.stringify(claimRes.json)}`
  );
  assert.equal(claimRes.json?.winnerId, winnerId);
  assert.equal(claimRes.json?.claimed, true);

  const claimedRes = await apiRequest(`/game-sessions/${gameId}/playground/winners?claimed=true`, { token });
  assert.equal(
    claimedRes.response.status,
    200,
    `Expected 200 claimed winners list, got ${claimedRes.response.status} body=${JSON.stringify(claimedRes.json)}`
  );
  assert.equal(claimedRes.json?.total, 1, `Expected one claimed winner, got ${JSON.stringify(claimedRes.json)}`);
  assert.equal(claimedRes.json?.items?.[0]?.isClaimed, true);
});
