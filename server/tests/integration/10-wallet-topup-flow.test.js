import test from 'node:test';
import assert from 'node:assert/strict';
import { loginAsAdmin, createOrganization, apiRequest } from './helpers/apiClient.js';

const hasCreds = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test('wallet topup creates ledger entries and updates balance', { skip: !hasCreds }, async () => {
  const { token } = await loginAsAdmin();
  const { hotelCompanyId } = await createOrganization(token);
  const referenceNumber = `INT-TOPUP-${Date.now()}`;

  const walletBefore = await apiRequest(`/admin/wallets/company/${hotelCompanyId}`, { token });
  assert.equal(walletBefore.response.status, 200, `Expected 200, got ${walletBefore.response.status}`);
  assert.equal(walletBefore.json?.balance, 0, `Expected initial balance 0, got ${walletBefore.json?.balance}`);

  const topup = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/topups`, {
    method: 'POST',
    token,
    body: {
      amount: 5000,
      paymentMethod: 'CASH',
      referenceNumber,
    },
  });

  assert.equal(topup.response.status, 201, `Expected 201, got ${topup.response.status} with body ${JSON.stringify(topup.json)}`);
  assert.ok(topup.json?.topupId, 'Expected topupId');
  assert.ok(topup.json?.walletTransactionId, 'Expected walletTransactionId');
  assert.equal(topup.json?.newBalance, 5000, `Expected new balance 5000, got ${topup.json?.newBalance}`);

  const walletAfter = await apiRequest(`/admin/wallets/company/${hotelCompanyId}`, { token });
  assert.equal(walletAfter.response.status, 200, `Expected 200, got ${walletAfter.response.status}`);
  assert.equal(walletAfter.json?.balance, 5000, `Expected final balance 5000, got ${walletAfter.json?.balance}`);

  const transactions = await apiRequest(`/admin/wallets/company/${hotelCompanyId}/transactions?page=1&pageSize=20`, { token });
  assert.equal(transactions.response.status, 200, `Expected 200, got ${transactions.response.status}`);

  const topupTxn = (transactions.json?.items || []).find((item) => item.referenceId === topup.json.topupId);
  assert.ok(topupTxn, 'Expected TOPUP wallet transaction linked to topupId');
  assert.equal(topupTxn.transactionType, 'TOPUP');
  assert.equal(topupTxn.amount, 5000);
  assert.equal(topupTxn.balanceBefore, 0);
  assert.equal(topupTxn.balanceAfter, 5000);
  assert.equal(topupTxn.referenceNumber, referenceNumber);
});
