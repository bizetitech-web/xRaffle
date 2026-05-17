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

test('org admin cannot top up wallet for another hotel company', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();

  const orgA = await createOrganization(token);
  const orgB = await createOrganization(token);

  const orgAdminRoleId = await getRoleIdByName(token, 'org_admin');
  const orgAdmin = await createUser(token, {
    hotelCompanyId: orgA.hotelCompanyId,
    roleId: orgAdminRoleId,
    firstName: 'Wallet',
    lastName: 'BoundaryOrgAdmin',
    password: 'Boundary123!',
  });

  const orgAdminLogin = await loginWithCredentials(orgAdmin.email, orgAdmin.password);

  const deniedTopup = await apiRequest(`/admin/wallets/company/${orgB.hotelCompanyId}/topups`, {
    method: 'POST',
    token: orgAdminLogin.token,
    body: {
      amount: 100,
      paymentMethod: 'CASH',
      referenceNumber: `BOUNDARY-${Date.now()}`,
    },
  });

  assert.equal(
    deniedTopup.response.status,
    403,
    `Expected 403, got ${deniedTopup.response.status} with body ${JSON.stringify(deniedTopup.json)}`
  );
  assert.ok(deniedTopup.json?.error, 'Expected error payload for denied topup');
});
