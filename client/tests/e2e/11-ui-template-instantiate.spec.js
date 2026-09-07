import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers/auth';
import { getE2ECredentials, getApiBaseUrl } from './helpers/env';

// UI-level test: open templates list, click instantiate, interact with dialog
test('UI: instantiate template via dialog and navigate to games', async ({ page, request }) => {
  test.skip(true, 'Game module removed — UI test disabled');

  const login = await apiLogin(request);
  if (login.skipped) test.skip(login.reason);
  const token = login.token;

  // seed localStorage token before app loads
  await page.addInitScript((t) => localStorage.setItem('token', t), token);

  // Go to templates page (direct route)
  await page.goto('/admin/game-templates');

  // Wait for grid to load
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 10000 });

  // If no templates exist, create one via API
  const apiBase = getApiBaseUrl();
  const rows = await page.locator('.MuiDataGrid-row').count();
  let templateId = null;
  if (rows === 0) {
    const payload = {
      title: `E2E UI Template ${Date.now()}`,
      cardPrice: 5,
      totalCards: 6,
      numbersPerCard: 4,
      totalPrizeBeers: 3,
      totalNumbersPool: 100,
      secondsPerCall: 10,
      generationMode: 'SEQUENTIAL',
      prizes: [
        { drawPosition: 1, beerQuantity: 1 },
        { drawPosition: 2, beerQuantity: 2 },
      ],
    };
    const create = await request.post(`${apiBase}/game-templates`, { headers: { Authorization: `Bearer ${token}` }, data: payload });
    const created = await create.json();
    templateId = created.id;
    templateTitle = payload.title;
    await page.reload();
  }

  // Click the first row's instantiate (PlayArrow) button
  const playBtn = page.locator('button[title="Create Game from Template"]').first();
  await playBtn.click();

  // Dialog should appear
  await expect(page.getByRole('dialog', { name: /Instantiate Game from Template/i })).toBeVisible();

  // Choose branch if dropdown present
  const branchSelect = page.getByLabel('Branch (optional)');
  if (await branchSelect.count() > 0) {
    await branchSelect.click();
    // select first option after the placeholder
    const option = page.locator('li[role="option"]').nth(1);
    if (await option.count() > 0) await option.click();
  }

  // Click create
  await page.getByRole('button', { name: /Create Game/i }).click();

  // Expect navigation to /admin/games
  await expect(page).toHaveURL(/\/admin\/games/);

  // Expect snackbar success to appear
  await expect(page.locator('text=Game instantiated')).toBeVisible({ timeout: 10000 });
  // small assertion: the created game should appear in the games list
  if (templateTitle) {
    await expect(page.locator(`text=${templateTitle}`)).toBeVisible({ timeout: 10000 });
  }
});
