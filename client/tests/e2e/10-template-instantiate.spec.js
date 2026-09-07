import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers/auth';
import { getApiBaseUrl, getE2ECredentials } from './helpers/env';

test('instantiate template -> charge -> generate cards (API-driven)', async ({ request }) => {
  test.skip(true, 'Game module removed — test disabled');
  const creds = getE2ECredentials();
  test.skip(!creds.isConfigured, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  const login = await apiLogin(request);
  if (login.skipped) test.skip(login.reason);
  const token = login.token;

  const apiBase = getApiBaseUrl();

  // pick a branch to instantiate into
  const branchesRes = await request.get(`${apiBase}/admin/hotel_branches`, { headers: { Authorization: `Bearer ${token}` } });
  const branches = await branchesRes.json();
  if (!branches || branches.length === 0) test.skip('No branches available to instantiate into');
  const branch = branches[0];

  // create a temporary template
  const templatePayload = {
    title: `E2E Template ${Date.now()}`,
    cardPrice: 10,
    totalCards: 10,
    numbersPerCard: 4,
    totalPrizeBeers: 5,
    totalNumbersPool: 100,
    secondsPerCall: 10,
    generationMode: 'SEQUENTIAL',
    prizes: [
      { drawPosition: 1, beerQuantity: 2 },
      { drawPosition: 2, beerQuantity: 3 },
    ],
  };

  const createRes = await request.post(`${apiBase}/game-templates`, {
    headers: { Authorization: `Bearer ${token}` },
    data: templatePayload,
  });
  expect(createRes.ok()).toBeTruthy();
  const createdTemplate = await createRes.json();
  expect(createdTemplate).toHaveProperty('id');

  // instantiate into chosen branch
  const instRes = await request.post(`${apiBase}/game-templates/${createdTemplate.id}/instantiate`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { branchId: branch.id },
  });
  expect(instRes.ok()).toBeTruthy();
  const instBody = await instRes.json();
  const gameId = instBody.id;
  expect(gameId).toBeTruthy();

  // topup the company's wallet to ensure charge will succeed
  const companyId = branch.company_id || branch.companyId || branch.hotel_company_id;
  test.skip(!companyId, 'Branch did not contain company id');

  const topupRes = await request.post(`${apiBase}/admin/wallets/company/${companyId}/topups`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { amount: 1000, paymentMethod: 'CASH', referenceNumber: `E2E-TOPUP-${Date.now()}` },
  });
  expect(topupRes.ok()).toBeTruthy();

  // charge a small fee for the game
  const chargeRes = await request.post(`${apiBase}/games/${gameId}/charge`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { feeAmount: 1, description: 'E2E test charge' },
  });
  expect(chargeRes.ok()).toBeTruthy();

  // generate cards
  const genRes = await request.post(`${apiBase}/games/${gameId}/cards/generate`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { seed: 'e2e-seed' },
  });
  expect(genRes.ok()).toBeTruthy();
  const genBody = await genRes.json();
  expect(genBody.cardsGenerated).toBe(Number(templatePayload.totalCards));
});
