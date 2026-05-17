import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../../config/database.js';
import { ensureBranchScope } from '../../../src/core/policy/scopePolicy.js';

function makeReq({ roleLevel = 2, hotelCompanyId = 'co-1' } = {}) {
  return {
    user: {
      role_level: roleLevel,
      sub: 'user-1',
    },
    hotelCompanyId,
  };
}

test('ensureBranchScope allows super admin to access any branch', async () => {
  const originalQuery = pool.query;
  pool.query = async () => [[{ id: 'br-1', company_id: 'co-2' }]];

  try {
    const branch = await ensureBranchScope(makeReq({ roleLevel: 1, hotelCompanyId: 'co-1' }), 'br-1');
    assert.equal(branch.id, 'br-1');
    assert.equal(branch.company_id, 'co-2');
  } finally {
    pool.query = originalQuery;
  }
});

test('ensureBranchScope blocks non-super-admin crossing organization boundary', async () => {
  const originalQuery = pool.query;
  pool.query = async () => [[{ id: 'br-2', company_id: 'co-2' }]];

  try {
    await assert.rejects(
      () => ensureBranchScope(makeReq({ roleLevel: 2, hotelCompanyId: 'co-1' }), 'br-2'),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.code, 'BRANCH_SCOPE_VIOLATION');
        return true;
      }
    );
  } finally {
    pool.query = originalQuery;
  }
});

test('ensureBranchScope returns not-found when branch does not exist', async () => {
  const originalQuery = pool.query;
  pool.query = async () => [[]];

  try {
    await assert.rejects(
      () => ensureBranchScope(makeReq({ roleLevel: 2, hotelCompanyId: 'co-1' }), 'br-missing'),
      (error) => {
        assert.equal(error.status, 404);
        assert.equal(error.code, 'BRANCH_SCOPE_VIOLATION');
        return true;
      }
    );
  } finally {
    pool.query = originalQuery;
  }
});
