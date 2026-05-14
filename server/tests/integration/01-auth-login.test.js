import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('auth login returns token and user payload', { skip: !hasCreds }, async () => {
  const { response, json } = await apiRequest('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    },
  });

  assert.equal(response.status, 200, `Expected 200, got ${response.status} with body ${JSON.stringify(json)}`);
  assert.ok(json?.token, 'Expected login token in response');
  assert.ok(json?.user?.id, 'Expected user payload in response');
});
