import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../config/database.js';
import { withTransaction } from '../../src/core/db/transaction.js';
import { emitRealtimeEventWithOutbox } from '../../src/contexts/realtime/realtime.outbox.js';

test('realtime event emit callback executes once after successful transaction commit', async () => {
  const originalGetConnection = pool.getConnection;

  let committed = false;
  let rolledBack = false;
  const queries = [];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
    query: async (sql, params = []) => {
      queries.push({ sql: String(sql), params });
      return [{}];
    },
  };

  pool.getConnection = async () => connection;

  let emitted = 0;

  try {
    await withTransaction(async (tx) => {
      await emitRealtimeEventWithOutbox({
        connection: tx,
        eventGroup: 'session',
        event: 'session:status-changed',
        sessionId: 'session-commit-1',
        companyId: 'company-commit-1',
        payload: { action: 'start', version: 2 },
        emit: () => {
          emitted += 1;
          return true;
        },
      });
    });
  } finally {
    pool.getConnection = originalGetConnection;
  }

  assert.equal(committed, true);
  assert.equal(rolledBack, false);
  assert.equal(emitted, 1);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO realtime_event_outbox/i);
});

test('realtime event emit callback is not executed when transaction rolls back', async () => {
  const originalGetConnection = pool.getConnection;

  let committed = false;
  let rolledBack = false;
  const queries = [];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
    query: async (sql, params = []) => {
      queries.push({ sql: String(sql), params });
      return [{}];
    },
  };

  pool.getConnection = async () => connection;

  let emitted = 0;

  try {
    await assert.rejects(
      () => withTransaction(async (tx) => {
        await emitRealtimeEventWithOutbox({
          connection: tx,
          eventGroup: 'session',
          event: 'session:status-changed',
          sessionId: 'session-rollback-1',
          companyId: 'company-rollback-1',
          payload: { action: 'start', version: 2 },
          emit: () => {
            emitted += 1;
            return true;
          },
        });

        throw new Error('force rollback');
      }),
      /force rollback/
    );
  } finally {
    pool.getConnection = originalGetConnection;
  }

  assert.equal(committed, false);
  assert.equal(rolledBack, true);
  assert.equal(emitted, 0);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO realtime_event_outbox/i);
});
