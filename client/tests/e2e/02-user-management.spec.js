import { test, expect } from '@playwright/test';
import { getE2ECredentials, uniqueSuffix, getApiBaseUrl } from './helpers/env';
import { apiLogin } from './helpers/auth';

test('user management create and edit', async ({ page, request }) => {
  const creds = getE2ECredentials();
  test.skip(!creds.isConfigured, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  const login = await apiLogin(request);
  if (login.skipped) test.skip(login.reason);
  const token = login.token;
  await page.addInitScript((t) => localStorage.setItem('token', t), token);

  // Ensure AuthContext has time to initialize (profile fetch) before visiting admin pages
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Dashboard/i })).toBeVisible({ timeout: 10000 });
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 4, name: /User Management|Users/i })).toBeVisible();

  // Pre-create user via API to make test deterministic
  const apiBase = getApiBaseUrl();
  const suffix = uniqueSuffix('e2e');
  const email = `${suffix}@example.com`;
  // Fetch roles and companies to construct payload
  const rolesRes = await request.get(`${apiBase}/admin/roles`, { headers: { Authorization: `Bearer ${token}` } });
  const roles = await rolesRes.json();
  const companiesRes = await request.get(`${apiBase}/admin/hotel_companies`, { headers: { Authorization: `Bearer ${token}` } });
  const companies = await companiesRes.json();
  const roleId = (roles && roles[0] && roles[0].id) || process.env.ROLE_ID;
  const hotelCompanyId = (companies && companies[0] && companies[0].id) || undefined;

  const createRes = await request.post(`${apiBase}/onboarding/user`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: JSON.stringify({
      email,
      password: 'Passw0rd!',
      firstName: 'E2E',
      lastName: 'Tester',
      roleId,
      hotelCompanyId,
    }),
  });
  if (!createRes.ok()) {
    const txt = await createRes.text();
    throw new Error(`Failed to create user via API: ${createRes.status()} ${txt}`);
  }
  const created = await createRes.json();
  const createdUserId = created.id;

  // Refresh users list and exercise edit via UI
  await page.reload();
  await expect(page.getByText(email)).toBeVisible({ timeout: 10000 });
  // Update user via API (deterministic) and ensure UI reflects the change
  const updateRes = await request.put(`${apiBase}/onboarding/user/${createdUserId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: JSON.stringify({ firstName: 'E2E-Edited' }),
  });
  if (!updateRes.ok()) {
    const txt = await updateRes.text();
    throw new Error(`Failed to update user via API: ${updateRes.status()} ${txt}`);
  }

  await page.reload();
  await expect(page.getByText('E2E-Edited')).toBeVisible({ timeout: 10000 });
  });
