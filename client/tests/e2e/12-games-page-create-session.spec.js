import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers/auth';
import { getApiBaseUrl, uniqueSuffix } from './helpers/env';

test('games route opens board-first and resolves a session from templates', async ({ page, request }) => {
  const auth = await apiLogin(request);
  test.skip(auth.skipped, auth.reason);

  const token = auth.token;
  const apiBase = getApiBaseUrl();

  const suffix = uniqueSuffix('games');
  const templateCode = `TPL-${suffix}`.slice(0, 40);
  const templateTitle = `E2E Games ${suffix}`;

  const createTemplateResponse = await request.post(`${apiBase}/game-templates`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      templateCode,
      title: templateTitle,
      cardPrice: 10,
      totalCards: 12,
      numbersPerCard: 4,
      totalPrizeBeers: 3,
      totalNumbersPool: 100,
      secondsPerCall: 5,
      generationMode: 'SEQUENTIAL',
      prizes: [
        { drawPosition: 1, beerQuantity: 2 },
        { drawPosition: 2, beerQuantity: 1 },
      ],
    },
  });

  if (!createTemplateResponse.ok()) {
    const body = await createTemplateResponse.text();
    throw new Error(`Failed to create template for e2e: ${createTemplateResponse.status()} ${body}`);
  }

  await page.addInitScript((t) => localStorage.setItem('token', t), token);
  await page.goto('/admin/games');

  await expect(page.getByRole('heading', { name: /^Game Board$/i })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/games\/.+\/board/);

  const templateSelect = page.getByLabel('Template');
  await expect(templateSelect).toBeVisible();
  await templateSelect.click();
  await expect(page.getByRole('option', { name: new RegExp(templateTitle, 'i') })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('heading', { name: /Sold Cards/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Available Cards/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Prize Lane/i })).toBeVisible();

  await expect(page.getByText(/Code:/i)).toBeVisible();
});
