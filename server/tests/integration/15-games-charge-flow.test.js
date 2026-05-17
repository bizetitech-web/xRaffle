import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

async function createBranchGameAndPrizes(token, hotelCompanyId, gameName = 'Charge Test Game') {
  const branchCode = `CH-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Charge Branch ${uniqueSuffix()}`,
      branchCode,
      status: 'ACTIVE',
    },
  });

  assert.equal(branchRes.response.status, 201, `Expected 201 branch, got ${branchRes.response.status}`);
  const branchId = branchRes.json?.branchId;

  const gameRes = await apiRequest('/games', {
    method: 'POST',
    token,
    body: {
      branchId,
      title: gameName,
      cardPrice: 50,
      totalCards: 25,
      numbersPerCard: 4,
      totalPrizeBeers: 10,
      totalNumbersPool: 100,
    },
  });

  assert.equal(gameRes.response.status, 201, `Expected 201 game, got ${gameRes.response.status}`);
  const gameId = gameRes.json?.id;

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
  return { gameId, branchId };
}

test('game fee charge writes ledger and blocks duplicate charge', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const topupRes = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    body: {
      amount: 100,
      paymentMethod: 'CASH',
      referenceNumber: `CHARGE-TOPUP-${Date.now()}`,
    },
  });
  assert.equal(topupRes.response.status, 201, `Expected 201 topup, got ${topupRes.response.status}`);

  const { gameId } = await createBranchGameAndPrizes(token, hotelCompanyId, 'Charge Happy Path Game');

  const chargeRes = await apiRequest(`/games/${gameId}/charge`, {
    method: 'POST',
    token,
    body: {
      feeAmount: 50,
      description: 'Platform game fee',
    },
  });

  assert.equal(chargeRes.response.status, 200, `Expected 200 charge, got ${chargeRes.response.status} body=${JSON.stringify(chargeRes.json)}`);
  assert.ok(chargeRes.json?.gameChargeId, 'Expected gameChargeId');
  assert.ok(chargeRes.json?.walletTransactionId, 'Expected walletTransactionId');
  assert.equal(chargeRes.json?.balanceBefore, 100);
  assert.equal(chargeRes.json?.balanceAfter, 50);

  const duplicateChargeRes = await apiRequest(`/games/${gameId}/charge`, {
    method: 'POST',
    token,
    body: { feeAmount: 50 },
  });

  assert.equal(duplicateChargeRes.response.status, 409, `Expected 409 duplicate charge, got ${duplicateChargeRes.response.status}`);
  assert.equal(duplicateChargeRes.json?.code, 'GAME_ALREADY_CHARGED');
});

test('game fee charge fails with insufficient wallet balance', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const { gameId } = await createBranchGameAndPrizes(token, hotelCompanyId, 'Charge Insufficient Wallet Game');

  const chargeRes = await apiRequest(`/games/${gameId}/charge`, {
    method: 'POST',
    token,
    body: {
      feeAmount: 50,
      description: 'Should fail insufficient funds',
    },
  });

  assert.equal(chargeRes.response.status, 400, `Expected 400 insufficient funds, got ${chargeRes.response.status}`);
  assert.equal(chargeRes.json?.code, 'INSUFFICIENT_WALLET_BALANCE');
});
