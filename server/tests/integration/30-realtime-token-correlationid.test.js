import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { apiRequest, apiRequestWithIdempotency, buildIdempotencyKey, loginAsAdmin } from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('realtime token endpoint includes correlationId in response and header', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { response, json } = await apiRequest('/realtime/token', {
    method: 'POST',
    token,
    body: {},
  });

  // Correlation ID should be present in both header and body
  const headerCorrelationId = response.headers.get('x-correlation-id');
  assert.ok(headerCorrelationId, 'Expected x-correlation-id header');
  assert.ok(json.correlationId, 'Expected correlationId in response body');
  assert.equal(json.correlationId, headerCorrelationId, 'Header and body correlationId should match');
});

test('realtime token endpoint propagates correlationId for idempotency replay', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const idempotencyKey = buildIdempotencyKey('slice12-corrid');

  const first = await apiRequestWithIdempotency('/realtime/token', {
    method: 'POST',
    token,
    idempotencyKey,
    body: {},
  });
  const second = await apiRequestWithIdempotency('/realtime/token', {
    method: 'POST',
    token,
    idempotencyKey,
    body: {},
  });

  assert.equal(second.response.headers.get('x-idempotency-replayed'), 'true');
  assert.ok(second.json.correlationId, 'Expected correlationId in replayed response');
  assert.equal(second.json.correlationId, second.response.headers.get('x-correlation-id'));
});

test('realtime token endpoint includes correlationId in error response for malformed key', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { response, json } = await apiRequest('/realtime/token', {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': 'bad key with spaces' },
    body: {},
  });
  assert.equal(response.status, 400);
  assert.ok(json.correlationId, 'Expected correlationId in error response');
  assert.equal(json.correlationId, response.headers.get('x-correlation-id'));
});
