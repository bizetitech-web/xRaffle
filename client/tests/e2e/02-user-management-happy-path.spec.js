import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers/auth';
import {
  createUser,
  getOrganizations,
  getRoles,
  getUsers,
} from './helpers/adminApi';
import { loginUi } from './helpers/auth';
import { uniqueSuffix } from './helpers/env';

test('user management list includes newly created user', async ({ page, request }) => {
  const auth = await apiLogin(request);
  test.skip(auth.skipped, auth.reason);

  const suffix = uniqueSuffix('ui-user');
  const email = `${suffix}@example.com`;

  const roles = await getRoles(request, auth.token);
  const organizations = await getOrganizations(request, auth.token);

  const role = roles.find((r) => String(r.name || '').toLowerCase().includes('viewer')) || roles[0];
  const organization = organizations[0];

  test.skip(!role, 'No roles found');
  test.skip(!organization, 'No organizations found');

  await createUser(request, auth.token, {
    email,
    password: 'Passw0rd!',
    firstName: 'E2E',
    lastName: 'User',
    roleId: role.id,
    organizationId: organization.id,
    isActive: true,
  });

  const login = await loginUi(page);
  test.skip(login.skipped, login.reason);

  await page.goto('/admin/users');
  await page.getByTestId('user-search-input').fill(email);

  await expect(page.getByText(email)).toBeVisible();

  const users = await getUsers(request, auth.token);
  expect(users.some((u) => String(u.email).toLowerCase() === email.toLowerCase())).toBeTruthy();
});
