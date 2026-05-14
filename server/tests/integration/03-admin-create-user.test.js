import test from 'node:test';
import assert from 'node:assert/strict';
import { loginAsAdmin, createOrganization, getRoleIdByName, createUser } from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('admin can create user in organization', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { organizationId } = await createOrganization(token);
  const roleId = await getRoleIdByName(token, 'viewer');

  const created = await createUser(token, { organizationId, roleId, firstName: 'API', lastName: 'CreatedUser' });

  assert.ok(created.userId, 'Expected created userId');
  assert.ok(created.email.includes('@example.com'), 'Expected test user email');
});
