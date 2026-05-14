import { test, expect } from '@playwright/test';
import { getE2ECredentials } from './helpers/env';

test('login smoke', async ({ page }) => {
  const creds = getE2ECredentials();
  test.skip(!creds.isConfigured, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  await page.goto('/login');
  await page.getByLabel('Email Address').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/admin\/users/);
  await expect(page.getByRole('heading', { name: /User Management|Users/i })).toBeVisible();
});
