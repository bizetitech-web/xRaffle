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

async function createBranch(token, hotelCompanyId, prefix = 'BC') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Board Context Branch ${uniqueSuffix()}`,
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

async function createGame(token, branchId, title = 'Board Context DB Flow') {
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
      description: 'Fee before board context flow',
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

test('DB-backed context board flow: list -> sell -> unsell -> bulk -> reset', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  await topupWallet(token, hotelCompanyId, {
    amount: 100,
    paymentMethod: 'CASH',
    referenceNumber: `BDCTX-${uniqueSuffix()}`,
  });

  const branchId = await createBranch(token, hotelCompanyId, 'BC1');
  const gameId = await createGame(token, branchId, 'Board Context Flow');

  await configurePrizes(token, gameId);
  await chargeGame(token, gameId);
  await generateCards(token, gameId, 'phase1-board-context-seed-001');
  await activateGame(token, gameId);

  const listBeforeRes = await apiRequest(`/game-sessions/${gameId}/board/cards`, { token });
  assert.equal(
    listBeforeRes.response.status,
    200,
    `Expected 200 board list before, got ${listBeforeRes.response.status} body=${JSON.stringify(listBeforeRes.json)}`
  );
  assert.equal(listBeforeRes.json?.total, 25, `Expected 25 cards, got ${JSON.stringify(listBeforeRes.json)}`);
  assert.equal(listBeforeRes.json?.totals?.available, 25);
  assert.equal(listBeforeRes.json?.totals?.sold, 0);

  const sellRes = await apiRequest(`/game-sessions/${gameId}/board/sell`, {
    method: 'POST',
    token,
    body: {
      cardNumber: 5,
      amount: 50,
      paymentMethod: 'CASH',
      customerName: 'Board Buyer',
      customerPhone: '+251900000099',
    },
  });

  assert.equal(
    sellRes.response.status,
    201,
    `Expected 201 board sell, got ${sellRes.response.status} body=${JSON.stringify(sellRes.json)}`
  );
  assert.equal(sellRes.json?.cardState, 'SOLD');
  assert.equal(sellRes.json?.cardNumber, 5);
  assert.equal(sellRes.json?.totals?.sold, 1);

  const unsellRes = await apiRequest(`/game-sessions/${gameId}/board/unsell`, {
    method: 'POST',
    token,
    body: {
      cardNumber: 5,
    },
  });

  assert.equal(
    unsellRes.response.status,
    200,
    `Expected 200 board unsell, got ${unsellRes.response.status} body=${JSON.stringify(unsellRes.json)}`
  );
  assert.equal(unsellRes.json?.cardState, 'AVAILABLE');
  assert.equal(unsellRes.json?.cardNumber, 5);
  assert.equal(unsellRes.json?.totals?.sold, 0);

  const bulkRes = await apiRequest(`/game-sessions/${gameId}/board/bulk`, {
    method: 'POST',
    token,
    body: {
      action: 'SELL',
      cardNumbers: [1, 2, 3],
      amount: 50,
      paymentMethod: 'CASH',
    },
  });

  assert.equal(
    bulkRes.response.status,
    200,
    `Expected 200 board bulk, got ${bulkRes.response.status} body=${JSON.stringify(bulkRes.json)}`
  );
  assert.equal(bulkRes.json?.processedCount, 3);
  assert.equal(bulkRes.json?.skippedCount, 0);
  assert.equal(bulkRes.json?.totals?.sold, 3);

  const soldListRes = await apiRequest(`/game-sessions/${gameId}/board/cards?status=SOLD`, { token });
  assert.equal(
    soldListRes.response.status,
    200,
    `Expected 200 sold list, got ${soldListRes.response.status} body=${JSON.stringify(soldListRes.json)}`
  );
  assert.equal(soldListRes.json?.total, 3, `Expected 3 sold cards, got ${JSON.stringify(soldListRes.json)}`);

  const resetRes = await apiRequest(`/game-sessions/${gameId}/board/reset`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(
    resetRes.response.status,
    200,
    `Expected 200 board reset, got ${resetRes.response.status} body=${JSON.stringify(resetRes.json)}`
  );
  assert.equal(resetRes.json?.totals?.available, 25);
  assert.equal(resetRes.json?.totals?.sold, 0);

  const soldListAfterResetRes = await apiRequest(`/game-sessions/${gameId}/board/cards?status=SOLD`, { token });
  assert.equal(
    soldListAfterResetRes.response.status,
    200,
    `Expected 200 sold list after reset, got ${soldListAfterResetRes.response.status} body=${JSON.stringify(soldListAfterResetRes.json)}`
  );
  assert.equal(soldListAfterResetRes.json?.total, 0, `Expected 0 sold after reset, got ${JSON.stringify(soldListAfterResetRes.json)}`);
});
