import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apiRequestWithIdempotency,
  buildIdempotencyKey,
  createOrganization,
  getWallet,
  loginAsAdmin,
  apiRequest,
} from './helpers/apiClient.js';
import { openIntegrationDbConnection } from './helpers/idempotencyAssertions.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);
const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

test('wallet topup replays same response for duplicate Idempotency-Key', { skip: !hasCreds }, async () => {
  const { token, user } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const idempotencyKey = buildIdempotencyKey('wallet-topup');
  const requestBody = {
    amount: 123,
    paymentMethod: 'CASH',
    referenceNumber: `TOPUP-IDEM-${Date.now()}`,
  };

  const first = await apiRequestWithIdempotency(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: requestBody,
  });

  assert.equal(first.response.status, 201, `Expected 201 first topup, got ${first.response.status} body=${JSON.stringify(first.json)}`);
  assert.equal(first.response.headers.get('x-idempotency-status'), 'new');
  assert.equal(first.response.headers.get('x-idempotency-replayed'), 'false');
  assert.equal(first.response.headers.get('x-idempotency-key'), idempotencyKey);
  assert.equal(first.json?.idempotencyStatus, 'new');

  const second = await apiRequestWithIdempotency(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: requestBody,
  });

  assert.equal(second.response.status, 201, `Expected 201 replay topup, got ${second.response.status} body=${JSON.stringify(second.json)}`);
  assert.equal(second.response.headers.get('x-idempotency-status'), 'replay');
  assert.equal(second.response.headers.get('x-idempotency-replayed'), 'true');
  assert.equal(second.response.headers.get('x-idempotency-key'), idempotencyKey);
  assert.equal(second.json?.idempotencyStatus, 'replay');

  const expectedReplay = {
    ...first.json,
    idempotencyStatus: 'replay',
  };
  assert.deepEqual(second.json, expectedReplay, 'Expected replay response payload to match first response payload');

  const wallet = await getWallet(token, hotelCompanyId);
  assert.equal(Number(wallet?.balance || 0), 123, 'Expected wallet balance to be incremented exactly once');

  if (hasDbConfig) {
    const db = await openIntegrationDbConnection();
    try {
      const endpoint = `POST:/api/admin/wallets/company/:companyId/topups:${hotelCompanyId}:${user?.id || 'anonymous'}`;
      const [[idempotencyRow]] = await db.query(
        `SELECT status, response_code AS responseCode
         FROM wallet_idempotency_requests
         WHERE endpoint = ? AND idempotency_key = ?
         LIMIT 1`,
        [endpoint, idempotencyKey]
      );

      assert.ok(idempotencyRow, 'Expected idempotency row for wallet topup');
      assert.equal(idempotencyRow.status, 'COMPLETED');
      assert.equal(Number(idempotencyRow.responseCode || 0), 201);

      const [[txnCountRow]] = await db.query(
        `SELECT COUNT(*) AS total
         FROM wallet_transactions
         WHERE reference_type = 'WALLET_TOPUP' AND reference_id = ?`,
        [first.json.topupId]
      );

      assert.equal(Number(txnCountRow?.total || 0), 1, 'Expected exactly one wallet transaction for idempotent replay');
    } finally {
      await db.end();
    }
  }
});

test('wallet topup rejects duplicate Idempotency-Key when payload differs', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const idempotencyKey = buildIdempotencyKey('wallet-topup-conflict');

  const first = await apiRequestWithIdempotency(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: {
      amount: 50,
      paymentMethod: 'CASH',
      referenceNumber: `TOPUP-CONFLICT-A-${Date.now()}`,
    },
  });

  assert.equal(first.response.status, 201, `Expected first topup 201, got ${first.response.status} body=${JSON.stringify(first.json)}`);

  const conflict = await apiRequestWithIdempotency(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    idempotencyKey,
    body: {
      amount: 75,
      paymentMethod: 'CASH',
      referenceNumber: `TOPUP-CONFLICT-B-${Date.now()}`,
    },
  });

  assert.equal(conflict.response.status, 409, `Expected 409 conflict, got ${conflict.response.status} body=${JSON.stringify(conflict.json)}`);
  assert.equal(conflict.json?.code, 'IDEMPOTENCY_KEY_CONFLICT');
});

test('wallet topup rejects malformed Idempotency-Key', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const response = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    headers: {
      'Idempotency-Key': 'bad key with spaces',
    },
    body: {
      amount: 10,
      paymentMethod: 'CASH',
      referenceNumber: `TOPUP-BAD-KEY-${Date.now()}`,
    },
  });

  assert.equal(response.response.status, 400, `Expected 400 malformed key, got ${response.response.status} body=${JSON.stringify(response.json)}`);
  assert.equal(response.json?.code, 'IDEMPOTENCY_KEY_INVALID');
});
