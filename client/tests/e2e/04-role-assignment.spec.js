import { test, expect } from '@playwright/test';
import { apiLogin, loginUi } from './helpers/auth';
import {
  createUser,
  getOrganizations,
  getRoles,
  updateUserRole,
} from './helpers/adminApi';
import { uniqueSuffix } from './helpers/env';

test('role assignment update appears in user management', async ({ page, request }) => {
  const auth = await apiLogin(request);
  test.skip(auth.skipped, auth.reason);

  const roles = await getRoles(request, auth.token);
  const organizations = await getOrganizations(request, auth.token);

  const viewerRole = roles.find((r) => String(r.name || '').toLowerCase().includes('viewer')) || roles[0];
  const managerRole = roles.find((r) => String(r.name || '').toLowerCase().includes('manager')) || roles.find((r) => r.id !== viewerRole?.id);
  const organization = organizations[0];

  test.skip(!viewerRole, 'No base role found');
  test.skip(!managerRole, 'No target role found');
  test.skip(!organization, 'No organizations found');

  const suffix = uniqueSuffix('role-assign');
  const email = `${suffix}@example.com`;

  const created = await createUser(request, auth.token, {
    email,
    password: 'Passw0rd!',
    firstName: 'Role',
    lastName: 'Switch',
    roleId: viewerRole.id,
    organizationId: organization.id,
    isActive: true,
  });

  const userId = created?.id || created?.user?.id;
  test.skip(!userId, 'Create user response missing id');

  await updateUserRole(request, auth.token, userId, managerRole.id);

  const login = await loginUi(page);
  test.skip(login.skipped, login.reason);

  await page.goto('/admin/users');
  await page.getByTestId('user-search-input').fill(email);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(new RegExp(managerRole.name, 'i'))).toBeVisible();
});
