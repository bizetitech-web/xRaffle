import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';

export async function openIntegrationDbConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashJsonPayload(payload) {
  const stable = stableStringify(payload);
  return createHash('sha256').update(stable).digest('hex');
}

export async function assertWalletIdempotencyCompleted({
  connection,
  endpoint,
  idempotencyKey,
}) {
  const [[row]] = await connection.query(
    `SELECT id, endpoint, idempotency_key AS idempotencyKey, status, request_hash AS requestHash,
            response_code AS responseCode, response_body AS responseBody, created_at AS createdAt, completed_at AS completedAt
     FROM wallet_idempotency_requests
     WHERE endpoint = ? AND idempotency_key = ?
     LIMIT 1`,
    [endpoint, idempotencyKey]
  );

  assert.ok(row, 'Expected idempotency row to exist');
  assert.equal(row.status, 'COMPLETED', 'Expected idempotency row status to transition to COMPLETED');
  assert.equal(Number(row.responseCode || 0), 200, 'Expected completed idempotency row to store HTTP 200 response code');
  assert.ok(row.completedAt, 'Expected completed_at timestamp for completed idempotency row');

  const persistedPayload = typeof row.responseBody === 'string'
    ? JSON.parse(row.responseBody)
    : row.responseBody;

  assert.ok(persistedPayload && typeof persistedPayload === 'object', 'Expected persisted response_body JSON payload');

  return {
    row,
    persistedPayload,
    persistedPayloadHash: hashJsonPayload(persistedPayload),
  };
}

export function assertReplayMatchesPersistedPayloadHash({ persistedPayload, replayPayload }) {
  const normalizedReplayPayload = {
    ...replayPayload,
    idempotencyStatus: persistedPayload?.idempotencyStatus,
  };

  const persistedHash = hashJsonPayload(persistedPayload);
  const replayHash = hashJsonPayload(normalizedReplayPayload);

  assert.equal(
    replayHash,
    persistedHash,
    'Expected replay payload hash to match persisted response_body hash (normalized for idempotencyStatus)'
  );

  return {
    persistedHash,
    replayHash,
  };
}
