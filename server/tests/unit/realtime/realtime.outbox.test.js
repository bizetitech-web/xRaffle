import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enqueueRealtimeOutboxEvent,
  emitRealtimeEventWithOutbox,
  drainRealtimeOutboxBatch,
  readRealtimeOutboxOperationalMetrics,
} from '../../../src/contexts/realtime/realtime.outbox.js';

test('enqueueRealtimeOutboxEvent returns null when connection is unavailable', async () => {
  const outboxId = await enqueueRealtimeOutboxEvent(null, {
    eventGroup: 'session',
    event: 'session:status-changed',
    payload: { action: 'start' },
  });

  assert.equal(outboxId, null);
});

test('emitRealtimeEventWithOutbox enqueues and emits through callback', async () => {
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [{}];
    },
  };

  let emitted = 0;
  const emittedResult = await emitRealtimeEventWithOutbox({
    connection,
    eventGroup: 'board',
    event: 'board:card-sold',
    sessionId: 's-1',
    companyId: 'c-1',
    payload: { cardNumber: 7 },
    emit: () => {
      emitted += 1;
      return true;
    },
  });

  assert.equal(emittedResult, true);
  assert.equal(emitted, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO realtime_event_outbox/i);
  assert.equal(calls[0].params[1], 'board');
  assert.equal(calls[0].params[2], 'board:card-sold');
});

test('drainRealtimeOutboxBatch publishes selected rows and marks as published', async () => {
  const updates = [];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql) => {
      const normalized = String(sql || '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT ID,')) {
        return [[{
          id: 'evt-1',
          eventGroup: 'session',
          eventName: 'session:status-changed',
          sessionId: 's-1',
          companyId: 'c-1',
          payload: JSON.stringify({ action: 'start', version: 2 }),
        }]];
      }
      return [{}];
    },
  };

  const dbPool = {
    getConnection: async () => connection,
    query: async (sql, params) => {
      updates.push({ sql, params });
      return [{}];
    },
  };

  const emitted = [];
  const gateway = {
    emitSessionEvent: (payload) => {
      emitted.push(payload);
      return true;
    },
    emitBoardEvent: () => false,
    emitDrawEvent: () => false,
    emitWinnerEvent: () => false,
  };

  const summary = await drainRealtimeOutboxBatch({
    limit: 10,
    dbPool,
    gateway,
    logger: { error: () => {} },
  });

  assert.equal(summary.selected, 1);
  assert.equal(summary.published, 1);
  assert.equal(summary.failed, 0);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].event, 'session:status-changed');
  assert.equal(emitted[0].payload.action, 'start');
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /SET status = 'PUBLISHED'/i);
});

test('drainRealtimeOutboxBatch applies dead-letter threshold for repeated failures', async () => {
  const dbPool = {
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      query: async (sql) => {
        const normalized = String(sql || '').toUpperCase().replace(/\s+/g, ' ').trim();
        if (normalized.startsWith('SELECT ID,')) {
          return [[{
            id: 'evt-dead-1',
            eventGroup: 'session',
            eventName: 'session:status-changed',
            sessionId: 's-1',
            companyId: 'c-1',
            payload: JSON.stringify({ action: 'start' }),
            attempts: 2,
          }]];
        }
        return [{}];
      },
    }),
    query: async (sql) => {
      return [String(sql || '').toUpperCase().includes("SET STATUS = 'DEAD_LETTER'") ? { affectedRows: 1 } : {}];
    },
  };

  const gateway = {
    emitSessionEvent: () => false,
    emitBoardEvent: () => false,
    emitDrawEvent: () => false,
    emitWinnerEvent: () => false,
  };

  const summary = await drainRealtimeOutboxBatch({
    dbPool,
    gateway,
    deadLetterAttempts: 3,
    logger: { error: () => {} },
  });

  assert.equal(summary.selected, 1);
  assert.equal(summary.published, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.deadLettered, 1);
});

test('readRealtimeOutboxOperationalMetrics returns queue and failure indicators', async () => {
  let callIndex = 0;
  const dbPool = {
    query: async () => {
      callIndex += 1;
      if (callIndex === 1) return [[{ pendingCount: 5, failedCount: 2, deadLetterCount: 1 }]];
      if (callIndex === 2) return [[{ avgPublishLatencySeconds: 0.45 }]];
      return [[{ publishedRecent: 8, failedRecent: 2 }]];
    },
  };

  const metrics = await readRealtimeOutboxOperationalMetrics({ dbPool, lookbackHours: 1 });

  assert.equal(metrics.pendingCount, 5);
  assert.equal(metrics.failedCount, 2);
  assert.equal(metrics.deadLetterCount, 1);
  assert.equal(metrics.avgPublishLatencySeconds, 0.45);
  assert.equal(metrics.failureRate, 0.2);
});
