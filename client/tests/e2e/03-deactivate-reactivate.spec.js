import { test, expect } from '@playwright/test';
import { apiLogin, loginUi } from './helpers/auth';
import { createUser, getOrganizations, getRoles, updateUserStatus } from './helpers/adminApi';
import { uniqueSuffix } from './helpers/env';

test('deactivate and reactivate user reflected in UI', async ({ page, request }) => {
  const auth = await apiLogin(request);
  test.skip(auth.skipped, auth.reason);

  const roles = await getRoles(request, auth.token);
  const organizations = await getOrganizations(request, auth.token);

  const role = roles.find((r) => String(r.name || '').toLowerCase().includes('viewer')) || roles[0];
  const organization = organizations[0];

  test.skip(!role, 'No roles found');
  test.skip(!organization, 'No organizations found');

  const suffix = uniqueSuffix('toggle');
  const email = `${suffix}@example.com`;

  const created = await createUser(request, auth.token, {
    email,
    password: 'Passw0rd!',
    firstName: 'Toggle',
    lastName: 'Target',
    roleId: role.id,
    organizationId: organization.id,
    isActive: true,
  });

  const userId = created?.id || created?.user?.id;
  test.skip(!userId, 'Create user response missing id');

  await updateUserStatus(request, auth.token, userId, false);

  const login = await loginUi(page);
  test.skip(login.skipped, login.reason);

  await page.goto('/admin/users');
  await page.getByTestId('user-search-input').fill(email);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('Inactive')).toBeVisible();

  await updateUserStatus(request, auth.token, userId, true);

  await page.reload();
  await page.getByTestId('user-search-input').fill(email);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('Active')).toBeVisible();
});
