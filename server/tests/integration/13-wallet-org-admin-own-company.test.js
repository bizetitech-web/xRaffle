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

test('org admin can top up wallet for own hotel company', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();

  const org = await createOrganization(token);
  const orgAdminRoleId = await getRoleIdByName(token, 'org_admin');
  const orgAdmin = await createUser(token, {
    hotelCompanyId: org.hotelCompanyId,
    roleId: orgAdminRoleId,
    firstName: 'OwnWallet',
    lastName: 'OrgAdmin',
    password: 'OwnWallet123!',
  });

  const orgAdminLogin = await loginWithCredentials(orgAdmin.email, orgAdmin.password);

  const topup = await apiRequest(`/admin/wallets/company/${org.hotelCompanyId}/topups`, {
    method: 'POST',
    token: orgAdminLogin.token,
    body: {
      amount: 75,
      paymentMethod: 'CASH',
      referenceNumber: `OWN-COMPANY-${Date.now()}`,
    },
  });

  assert.equal(topup.response.status, 201, `Expected 201, got ${topup.response.status} with body ${JSON.stringify(topup.json)}`);
  assert.ok(topup.json?.topupId, 'Expected topupId');
  assert.ok(topup.json?.walletTransactionId, 'Expected walletTransactionId');
  assert.equal(topup.json?.newBalance, 75, `Expected new balance 75, got ${topup.json?.newBalance}`);
});
