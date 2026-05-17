import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('create game and configure prize positions', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const branchCode = `BR-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Branch ${uniqueSuffix()}`,
      branchCode,
      status: 'ACTIVE',
    },
  });

  assert.equal(branchRes.response.status, 201, `Expected 201, got ${branchRes.response.status} with body ${JSON.stringify(branchRes.json)}`);
  const branchId = branchRes.json?.branchId;
  assert.ok(branchId, 'Expected branchId');

  const gameRes = await apiRequest('/games', {
    method: 'POST',
    token,
    body: {
      branchId,
      title: 'Friday Beer Game',
      cardPrice: 50,
      totalCards: 25,
      numbersPerCard: 4,
      totalPrizeBeers: 10,
      totalNumbersPool: 100,
    },
  });

  assert.equal(gameRes.response.status, 201, `Expected 201, got ${gameRes.response.status} with body ${JSON.stringify(gameRes.json)}`);
  const gameId = gameRes.json?.id;
  assert.ok(gameId, 'Expected game id');
  assert.equal(gameRes.json?.status, 'PENDING');

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

  assert.equal(prizesRes.response.status, 201, `Expected 201, got ${prizesRes.response.status} with body ${JSON.stringify(prizesRes.json)}`);
  assert.equal(prizesRes.json?.totalPositions, 4);
  assert.equal(prizesRes.json?.totalPrizeBeers, 10);

  const gameDetailRes = await apiRequest(`/games/${gameId}`, { token });
  assert.equal(gameDetailRes.response.status, 200, `Expected 200, got ${gameDetailRes.response.status}`);
  assert.equal(gameDetailRes.json?.configuredPrizePositions, 4);
  assert.equal(gameDetailRes.json?.configuredPrizeBeers, 10);
});
