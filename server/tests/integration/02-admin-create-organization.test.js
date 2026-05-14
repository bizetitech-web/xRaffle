import test from 'node:test';
import assert from 'node:assert/strict';
import { loginAsAdmin, createOrganization } from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('admin can create organization', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const created = await createOrganization(token);

  assert.ok(created.organizationId, 'Expected organizationId');
  assert.ok(created.code.startsWith('org-'), 'Expected generated org code prefix');
});
