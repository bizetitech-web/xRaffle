import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  getRoleIdByName,
  createUser,
  loginWithCredentials,
  apiRequest,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('org admin cannot create a new organization (super-admin only)', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const orgAdminRoleId = await getRoleIdByName(token, 'org_admin');

  const orgAdmin = await createUser(token, {
    hotelCompanyId,
    roleId: orgAdminRoleId,
    firstName: 'Org',
    lastName: 'AdminDenied',
    password: 'OrgAdmin123!',
  });

  const orgAdminLogin = await loginWithCredentials(orgAdmin.email, orgAdmin.password);

  const attempt = await apiRequest('/admin/hotel_companies', {
    method: 'POST',
    token: orgAdminLogin.token,
    body: {
      name: `Blocked Org ${Date.now()}`,
      code: `blocked-org-${Date.now()}`,
      email: `blocked-${Date.now()}@example.com`,
      status: 'active',
    },
  });

  assert.equal(attempt.response.status, 403, `Expected 403, got ${attempt.response.status} with body ${JSON.stringify(attempt.json)}`);
  assert.ok(attempt.json?.error, 'Expected error payload for denied request');
});
