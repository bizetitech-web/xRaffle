import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginAsAdmin,
  createOrganization,
  topupWallet,
  apiRequest,
} from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('audit logs capture TOPUP_WALLET action with wallet_topups record', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);

  const topup = await topupWallet(token, hotelCompanyId, {
    amount: 250,
    paymentMethod: 'CASH',
    referenceNumber: `AUDIT-TOPUP-${Date.now()}`,
  });

  const logsResponse = await apiRequest('/admin/audit-logs?limit=200', { token });
  assert.equal(logsResponse.response.status, 200, `Expected 200, got ${logsResponse.response.status}`);

  const logs = logsResponse.json?.logs || [];
  const topupAudit = logs.find(
    (log) =>
      log.action === 'TOPUP_WALLET' &&
      log.table_name === 'wallet_topups' &&
      log.record_id === topup.topupId
  );

  assert.ok(topupAudit, 'Expected TOPUP_WALLET audit log for topup record');
  assert.equal(topupAudit.hotel_company_id, hotelCompanyId, 'Expected audit log to be scoped to target hotel');
});
