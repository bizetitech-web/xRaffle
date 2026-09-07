import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, apiRequestWithIdempotency, buildIdempotencyKey, loginAsAdmin } from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('integration: audit log for issued token', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const log = await fetchAuditLog();
  const audit = log.find(e => e.eventType === 'issue');
  assert.ok(audit, 'Expected audit log for issued token');
  assert.equal(audit.status, 200);
  assert.ok(audit.userId, 'Expected userId in audit log');
  assert.ok(audit.correlationId, 'Expected correlationId in audit log');
});

test('integration: audit log for replay', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const idempotencyKey = buildIdempotencyKey('audit-integ-replay');
  // First request
  await apiRequestWithIdempotency('/realtime/token', {
    method: 'POST',
    token,
    idempotencyKey,
    body: {},
  });
  // Replay
  await apiRequestWithIdempotency('/realtime/token', {
    method: 'POST',
    token,
    idempotencyKey,
    body: {},
  });
  const log = await fetchAuditLog();
  const audit = log.find(e => e.eventType === 'replay');
  assert.ok(audit, 'Expected audit log for replay');
  assert.equal(audit.status, 200);
  assert.ok(audit.userId, 'Expected userId in audit log');
  assert.ok(audit.correlationId, 'Expected correlationId in audit log');
});

test('integration: audit log for error (malformed key)', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const response = await apiRequest('/realtime/token', {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': 'bad key with spaces' },
    body: {},
  });
  assert.equal(response.response.status, 400);
  const log = await fetchAuditLog();
  const audit = log.find(e => e.eventType === 'error');
  assert.ok(audit, 'Expected audit log for error');
  assert.equal(audit.status, 400);
  assert.ok(audit.userId, 'Expected userId in audit log');
  assert.ok(audit.correlationId, 'Expected correlationId in audit log');
});

async function fetchAuditLog() {
  const { json } = await apiRequest('/realtime/auditlog', { method: 'GET' });
  return json.log || [];
}