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

test('audit logs capture user create and deactivate actions', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { organizationId } = await createOrganization(token);
  const viewerRoleId = await getRoleIdByName(token, 'viewer');

  const created = await createUser(token, {
    organizationId,
    roleId: viewerRoleId,
    firstName: 'Audit',
    lastName: 'Target',
  });

  await updateUserStatus(token, created.userId, false);

  const logsResponse = await apiRequest('/admin/audit-logs?limit=200', { token });
  assert.equal(logsResponse.response.status, 200, `Expected 200, got ${logsResponse.response.status}`);

  const logs = logsResponse.json?.logs || [];
  const createLog = logs.find((log) => log.record_id === created.userId && log.action === 'CREATE_USER');
  const deactivateLog = logs.find((log) => log.record_id === created.userId && log.action === 'DEACTIVATE_USER');

  assert.ok(createLog, 'Expected CREATE_USER audit log for created user');
  assert.ok(deactivateLog, 'Expected DEACTIVATE_USER audit log for deactivated user');
});
