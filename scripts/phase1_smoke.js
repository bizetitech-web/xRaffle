/*
Phase 1 smoke script
Usage:
  API_BASE=http://localhost:5000/api AUTH_TOKEN="Bearer ..." node scripts/phase1_smoke.js

Performs: create company -> verify wallet -> topup -> verify transaction -> create branch -> create user

This script uses global fetch (Node 18+). It prints JSON diffs and results.
*/

const API = process.env.API_BASE || 'http://localhost:5000/api';
const AUTH = process.env.AUTH_TOKEN || process.env.TOKEN || null;

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (AUTH) h['Authorization'] = AUTH.startsWith('Bearer') ? AUTH : `Bearer ${AUTH}`;
  return h;
}

async function req(path, opts = {}) {
  const url = `${API}${path}`;
  const init = Object.assign({ headers: authHeaders() }, opts);
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    return { status: res.status, ok: res.ok, data, raw: text };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

function stamp() { return new Date().toISOString().replace(/[:.]/g,'-'); }

(async function main(){
  console.log('Phase1 smoke test starting', { API, authProvided: !!AUTH });

  // 1. Create Company
  const companyName = `smoke-${stamp()}`;
  const companyPayload = { name: companyName, address: 'Smoke test address' };
  console.log('\n1) Creating company:', companyPayload);
  const createCompanyRes = await req('/onboarding/company', { method: 'POST', body: JSON.stringify(companyPayload) });
  console.log(' -> status', createCompanyRes.status);
  if (!createCompanyRes.ok) { console.error('Failed to create company:', createCompanyRes.data || createCompanyRes.raw || createCompanyRes.error); process.exit(2); }
  const company = createCompanyRes.data;
  console.log(' -> company created:', company);
  const companyId = company.id || companyId;
  if (!companyId) { console.error('No company id returned'); process.exit(2); }

  // 2) Get Wallet (before)
  console.log('\n2) Fetching wallet (before topup)');
  const walletBefore = await req(`/onboarding/wallet/${companyId}`);
  console.log(' -> status', walletBefore.status, 'data:', walletBefore.data);

  // 3) Fetch transactions (before)
  const txBeforeRes = await req(`/onboarding/wallet/${companyId}/transactions`);
  const txBeforeCount = (txBeforeRes.ok && txBeforeRes.data && Array.isArray(txBeforeRes.data.items)) ? txBeforeRes.data.items.length : (txBeforeRes.data?.total || 0);
  console.log(` -> transactions before: ${txBeforeCount}`);

  // 4) Topup wallet
  const amount = 100;
  const paymentMethod = 'CASH';
  const referenceNumber = `SMOKE-${stamp()}`;
  const topupPayload = { amount, paymentMethod, referenceNumber };
  console.log('\n3) Topup wallet with', topupPayload);
  const topupRes = await req(`/onboarding/wallet/${companyId}/topup`, { method: 'POST', body: JSON.stringify(topupPayload) });
  console.log(' -> status', topupRes.status, 'data:', topupRes.data || topupRes.raw || topupRes.error);
  if (!topupRes.ok) { console.error('Topup failed'); process.exit(3); }

  // 5) Get Wallet (after)
  const walletAfter = await req(`/onboarding/wallet/${companyId}`);
  console.log('\n4) Fetching wallet (after topup):', walletAfter.data);
  try {
    const beforeBal = Number(walletBefore.data?.balance || 0);
    const afterBal = Number(walletAfter.data?.balance || 0);
    console.log(` -> balance: ${beforeBal} -> ${afterBal}`);
  } catch(e){}

  // 6) Fetch transactions (after)
  const txAfterRes = await req(`/onboarding/wallet/${companyId}/transactions`);
  console.log(`\n5) Transactions fetch status ${txAfterRes.status}`);
  if (txAfterRes.ok && txAfterRes.data) {
    console.log(' -> total:', txAfterRes.data.total, 'items on page:', (txAfterRes.data.items||[]).length);
    // find the topup by reference number or transaction id
    const items = txAfterRes.data.items || [];
    const found = items.find(i => (i.reference_number === referenceNumber) || (i.referenceNumber === referenceNumber) || (i.id === topupRes.data?.transactionId) || (i.id === topupRes.data?.transaction_id));
    console.log(' -> topup found in transactions:', !!found);
    if (!found) console.log(' -> latest transactions sample:', items.slice(0,5));
  } else {
    console.warn(' -> failed to fetch transactions:', txAfterRes.data || txAfterRes.raw || txAfterRes.error);
  }

  // 7) Create Branch
  console.log('\n6) Creating branch');
  const branchPayload = { company_id: companyId, name: 'Main Branch', address: 'Headquarter' };
  const branchRes = await req('/onboarding/branch', { method: 'POST', body: JSON.stringify(branchPayload) });
  console.log(' -> status', branchRes.status, 'data:', branchRes.data || branchRes.raw || branchRes.error);
  if (!branchRes.ok) { console.error('Failed to create branch'); process.exit(4); }
  const branch = branchRes.data;

  // 8) Find a role id
  console.log('\n7) Attempting to fetch roles to assign to new user (GET /admin/roles)');
  const rolesRes = await req('/admin/roles');
  let roleId = null;
  if (rolesRes.ok && Array.isArray(rolesRes.data) && rolesRes.data.length>0) {
    roleId = rolesRes.data[0].id;
    console.log(' -> selected role id', roleId);
  } else {
    console.warn(' -> could not fetch roles; status', rolesRes.status, 'data:', rolesRes.data || rolesRes.raw || rolesRes.error);
    console.warn(' -> skipping user creation because roleId is required. You can supply a role id with env ROLE_ID to force creation.');
    if (!process.env.ROLE_ID) {
      console.log('\nSMOKE TEST COMPLETE (branch created). To create a user, re-run with AUTH_TOKEN that can call /admin/roles or set ROLE_ID env var.');
      process.exit(0);
    }
    roleId = process.env.ROLE_ID;
  }

  // 9) Create User
  console.log('\n8) Creating user');
  const email = `smoke.${stamp()}@example.com`;
  const userPayload = {
    hotelCompanyId: companyId,
    branchId: branch.id || branchId,
    email,
    password: 'Passw0rd!',
    roleId,
  };
  const userRes = await req('/onboarding/user', { method: 'POST', body: JSON.stringify(userPayload) });
  console.log(' -> status', userRes.status, 'data:', userRes.data || userRes.raw || userRes.error);
  if (!userRes.ok) { console.error('User creation failed'); process.exit(5); }

  // 10) List users for company
  const usersListRes = await req(`/onboarding/user?company_id=${companyId}`);
  console.log('\n9) Users in company:', usersListRes.status, 'count:', Array.isArray(usersListRes.data) ? usersListRes.data.length : (usersListRes.data?.length || 0));
  if (usersListRes.ok && Array.isArray(usersListRes.data)) {
    const foundUser = usersListRes.data.find(u => u.email === email);
    console.log(' -> created user present:', !!foundUser, foundUser || 'not found');
  }

  console.log('\nPhase1 smoke completed successfully');
  process.exit(0);
})();
