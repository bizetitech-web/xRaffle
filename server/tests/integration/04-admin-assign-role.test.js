import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  getRoleIdByName,
  createUser,
  apiRequest,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('admin can assign role to existing user', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const viewerRoleId = await getRoleIdByName(token, 'viewer');
  const managerRoleId = await getRoleIdByName(token, 'manager');

  const created = await createUser(token, {
    hotelCompanyId,
    roleId: viewerRoleId,
    firstName: 'Role',
    lastName: 'AssignmentTarget',
  });

  const update = await apiRequest(`/admin/users/${created.userId}`, {
    method: 'PUT',
    token,
    body: {
      roleId: managerRoleId,
    },
  });

  assert.equal(
    update.response.status,
    200,
    `Expected 200 on role update, got ${update.response.status} with body ${JSON.stringify(update.json)}`
  );

  const detail = await apiRequest(`/admin/users/${created.userId}`, { token });
  assert.equal(detail.response.status, 200, `Expected 200 on user fetch, got ${detail.response.status}`);
  assert.equal(detail.json?.role_id, managerRoleId, 'Expected user role_id to match manager role id');
});
