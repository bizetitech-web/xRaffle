import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { apiRequest, loginAsAdmin } from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('realtime token endpoint rejects unauthenticated requests', { skip: !hasCreds }, async () => {
  const { response, json } = await apiRequest('/realtime/token', {
    method: 'POST',
    body: {},
  });

  assert.equal(response.status, 401, `Expected 401, got ${response.status} body=${JSON.stringify(json)}`);
});

test('realtime token endpoint returns socket token for authenticated user', { skip: !hasCreds }, async () => {
  const { token, user } = await loginAsAdmin();

  const { response, json } = await apiRequest('/realtime/token', {
    method: 'POST',
    token,
    body: {},
  });

  assert.equal(response.status, 200, `Expected 200, got ${response.status} body=${JSON.stringify(json)}`);
  assert.ok(json?.socketToken, 'Expected socketToken in response payload');
  assert.equal(typeof json?.expiresIn, 'number');
  assert.ok(json.expiresIn > 0, `Expected positive expiresIn, got ${json.expiresIn}`);

  const decoded = jwt.decode(json.socketToken);
  assert.ok(decoded && typeof decoded === 'object', 'Expected decodable JWT payload');
  assert.equal(decoded.sub, user.id);
  assert.equal(decoded.email, user.email);
  assert.equal(decoded.tokenType, 'realtime');
  assert.ok(decoded.roleLevel, 'Expected roleLevel in realtime token claims');
});
