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

test('non-super admin cannot list users from another organization', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();

  const orgA = await createOrganization(token);
  const orgB = await createOrganization(token);

  const orgAdminRoleId = await getRoleIdByName(token, 'org_admin');
  const viewerRoleId = await getRoleIdByName(token, 'viewer');

  const orgAdmin = await createUser(token, {
    organizationId: orgA.organizationId,
    roleId: orgAdminRoleId,
    firstName: 'Boundary',
    lastName: 'OrgAdmin',
    password: 'Boundary123!',
  });

  const otherOrgUser = await createUser(token, {
    organizationId: orgB.organizationId,
    roleId: viewerRoleId,
    firstName: 'Boundary',
    lastName: 'OtherOrgUser',
  });

  const orgAdminLogin = await loginWithCredentials(orgAdmin.email, orgAdmin.password);

  const listing = await apiRequest(`/admin/users?organizationId=${orgB.organizationId}`, {
    token: orgAdminLogin.token,
  });

  assert.equal(listing.response.status, 200, `Expected 200, got ${listing.response.status}`);
  assert.ok(Array.isArray(listing.json), 'Expected user listing array');

  const hasCrossOrgUser = listing.json.some((user) => user.id === otherOrgUser.userId);
  assert.equal(hasCrossOrgUser, false, 'Expected listing to exclude users from other organizations');

  const allFromOwnOrg = listing.json.every((user) => user.organization_id === orgA.organizationId);
  assert.equal(allFromOwnOrg, true, 'Expected listing rows to be restricted to requester organization');
});
