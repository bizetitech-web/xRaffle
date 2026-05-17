import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  apiRequest,
  uniqueSuffix,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

async function createBranch(token, hotelCompanyId, prefix = 'SC') {
  const branchCode = `${prefix}-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
  const branchRes = await apiRequest('/admin/hotel_branches', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      name: `Session Context Branch ${uniqueSuffix()}`,
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

async function createGame(token, branchId, title) {
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

async function createTemplate(token, branchId, hotelCompanyId, title) {
  const templateRes = await apiRequest('/game-templates', {
    method: 'POST',
    token,
    body: {
      companyId: hotelCompanyId,
      branchId,
      templateCode: `TPL-${uniqueSuffix().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
      title,
      cardPrice: 50,
      totalCards: 25,
      totalNumbersPool: 100,
      numbersPerCard: 4,
      totalPrizeBeers: 10,
      secondsPerCall: 10,
      generationMode: 'SEQUENTIAL',
      prizes: [
        { drawPosition: 1, beerQuantity: 5 },
        { drawPosition: 2, beerQuantity: 3 },
        { drawPosition: 3, beerQuantity: 2 },
      ],
    },
  });

  assert.equal(
    templateRes.response.status,
    201,
    `Expected 201 template, got ${templateRes.response.status} body=${JSON.stringify(templateRes.json)}`
  );

  return templateRes.json?.id;
}

test('DB-backed context session create flow: create session from template', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const branchId = await createBranch(token, hotelCompanyId, 'SC0');
  const templateId = await createTemplate(token, branchId, hotelCompanyId, 'Session Create From Template');

  const createRes = await apiRequest('/game-sessions', {
    method: 'POST',
    token,
    body: {
      templateId,
    },
  });

  assert.equal(
    createRes.response.status,
    201,
    `Expected 201 session create, got ${createRes.response.status} body=${JSON.stringify(createRes.json)}`
  );
  assert.equal(createRes.json?.status, 'PENDING');
  assert.ok(createRes.json?.sessionId, 'Expected sessionId in create response');
  assert.match(createRes.json?.sessionCode || '', /^GAME-/);

  const snapshotRes = await apiRequest(`/game-sessions/${createRes.json.sessionId}`, { token });
  assert.equal(
    snapshotRes.response.status,
    200,
    `Expected 200 snapshot, got ${snapshotRes.response.status} body=${JSON.stringify(snapshotRes.json)}`
  );
  assert.equal(snapshotRes.json?.status, 'PENDING');
  assert.equal(snapshotRes.json?.branchId, branchId);
  assert.equal(Number(snapshotRes.json?.cardPrice), 50);
  assert.equal(Number(snapshotRes.json?.totalCards), 25);
  assert.equal(Number(snapshotRes.json?.numbersPerCard), 4);
  assert.equal(Number(snapshotRes.json?.totalNumbersPool), 100);
  assert.equal(Number(snapshotRes.json?.totalPrizeBeers), 10);
});

test('DB-backed context session lifecycle flow: start -> resume -> pause -> end -> reset', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const branchId = await createBranch(token, hotelCompanyId, 'SC1');
  const gameId = await createGame(token, branchId, 'Session Lifecycle Reset Flow');

  const startRes = await apiRequest(`/game-sessions/${gameId}/start`, {
    method: 'POST',
    token,
    body: {},
  });
  assert.equal(startRes.response.status, 200, `Expected 200 start, got ${startRes.response.status} body=${JSON.stringify(startRes.json)}`);
  assert.equal(startRes.json?.status, 'ACTIVE');

  const resumeRes = await apiRequest(`/game-sessions/${gameId}/resume`, {
    method: 'POST',
    token,
    body: {},
  });
  assert.equal(resumeRes.response.status, 200, `Expected 200 resume, got ${resumeRes.response.status} body=${JSON.stringify(resumeRes.json)}`);
  assert.equal(resumeRes.json?.status, 'DRAWING');

  const pauseRes = await apiRequest(`/game-sessions/${gameId}/pause`, {
    method: 'POST',
    token,
    body: {},
  });
  assert.equal(pauseRes.response.status, 200, `Expected 200 pause, got ${pauseRes.response.status} body=${JSON.stringify(pauseRes.json)}`);
  assert.equal(pauseRes.json?.status, 'ACTIVE');

  const endRes = await apiRequest(`/game-sessions/${gameId}/end`, {
    method: 'POST',
    token,
    body: {},
  });
  assert.equal(endRes.response.status, 200, `Expected 200 end, got ${endRes.response.status} body=${JSON.stringify(endRes.json)}`);
  assert.equal(endRes.json?.status, 'CANCELLED');

  const resetRes = await apiRequest(`/game-sessions/${gameId}/reset`, {
    method: 'POST',
    token,
    body: {},
  });
  assert.equal(resetRes.response.status, 200, `Expected 200 reset, got ${resetRes.response.status} body=${JSON.stringify(resetRes.json)}`);
  assert.equal(resetRes.json?.status, 'PENDING');

  const snapshotRes = await apiRequest(`/game-sessions/${gameId}`, { token });
  assert.equal(snapshotRes.response.status, 200, `Expected 200 snapshot, got ${snapshotRes.response.status} body=${JSON.stringify(snapshotRes.json)}`);
  assert.equal(snapshotRes.json?.status, 'PENDING');
});

test('DB-backed context session lifecycle flow: start -> complete', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const branchId = await createBranch(token, hotelCompanyId, 'SC2');
  const gameId = await createGame(token, branchId, 'Session Lifecycle Complete Flow');

  const startRes = await apiRequest(`/game-sessions/${gameId}/start`, {
    method: 'POST',
    token,
    body: {},
  });
  assert.equal(startRes.response.status, 200, `Expected 200 start, got ${startRes.response.status} body=${JSON.stringify(startRes.json)}`);
  assert.equal(startRes.json?.status, 'ACTIVE');

  const completeRes = await apiRequest(`/game-sessions/${gameId}/complete`, {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(
    completeRes.response.status,
    200,
    `Expected 200 complete, got ${completeRes.response.status} body=${JSON.stringify(completeRes.json)}`
  );
  assert.equal(completeRes.json?.status, 'COMPLETED');
  assert.ok(completeRes.json?.summary, 'Expected completion summary payload');

  const snapshotRes = await apiRequest(`/game-sessions/${gameId}`, { token });
  assert.equal(snapshotRes.response.status, 200, `Expected 200 snapshot, got ${snapshotRes.response.status} body=${JSON.stringify(snapshotRes.json)}`);
  assert.equal(snapshotRes.json?.status, 'COMPLETED');
});
