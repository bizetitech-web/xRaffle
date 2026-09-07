import { test, expect } from '@playwright/test';
import { getE2ECredentials } from './helpers/env';
import { apiLogin } from './helpers/auth';

test('login smoke (fast)', async ({ page, request }) => {
  const creds = getE2ECredentials();
  test.skip(!creds.isConfigured, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  const login = await apiLogin(request);
  if (login.skipped) test.skip(login.reason);
  const token = login.token;
  await page.addInitScript((t) => localStorage.setItem('token', t), token);

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 4, name: /User Management|Users/i })).toBeVisible();
});
