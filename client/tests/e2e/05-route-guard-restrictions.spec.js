import { test, expect } from '@playwright/test';
import { apiLogin, loginUi } from './helpers/auth';
import { createUser, getOrganizations, getRoles } from './helpers/adminApi';
import { uniqueSuffix } from './helpers/env';

async function loginAs(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test('viewer cannot access protected admin pages', async ({ page, request }) => {
  const auth = await apiLogin(request);
  test.skip(auth.skipped, auth.reason);

  const roles = await getRoles(request, auth.token);
  const organizations = await getOrganizations(request, auth.token);

  const viewerRole = roles.find((r) => String(r.name || '').toLowerCase().includes('viewer')) || roles[0];
  const organization = organizations[0];

  test.skip(!viewerRole, 'No viewer role found');
  test.skip(!organization, 'No organizations found');

  const suffix = uniqueSuffix('guard');
  const email = `${suffix}@example.com`;
  const password = 'Passw0rd!';

  await createUser(request, auth.token, {
    email,
    password,
    firstName: 'Guard',
    lastName: 'Viewer',
    roleId: viewerRole.id,
    organizationId: organization.id,
    isActive: true,
  });

  await loginAs(page, email, password);

  await page.goto('/admin/roles');
  await expect(page.getByText('Permission Denied')).toBeVisible();

  await page.goto('/admin/organization');
  await expect(page.getByText('Permission Denied')).toBeVisible();

  const adminLogin = await loginUi(page);
  test.skip(adminLogin.skipped, adminLogin.reason);

  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: /Role Management|Roles/i })).toBeVisible();
});
