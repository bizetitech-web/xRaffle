import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  getRoleIdByName,
  createUser,
  updateUserStatus,
  apiRequest,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('admin can deactivate and reactivate user', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const roleId = await getRoleIdByName(token, 'viewer');
  const created = await createUser(token, { hotelCompanyId, roleId });

  await updateUserStatus(token, created.userId, false);
  let detail = await apiRequest(`/admin/users/${created.userId}`, { token });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.json?.is_active, 0, 'Expected user to be deactivated');

  await updateUserStatus(token, created.userId, true);
  detail = await apiRequest(`/admin/users/${created.userId}`, { token });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.json?.is_active, 1, 'Expected user to be reactivated');
});
