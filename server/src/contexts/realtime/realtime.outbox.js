import crypto from 'node:crypto';
import pool from '../../../config/database.js';
import { realtimeGateway } from './realtime.gateway.js';
import { registerAfterCommit } from '../../core/db/transaction.js';

const EVENT_GROUPS = new Set(['session', 'board', 'draw', 'winner']);

const normalizeEventGroup = (eventGroup) => {
  const value = String(eventGroup || 'session').toLowerCase();
  return EVENT_GROUPS.has(value) ? value : 'session';
};

const clampNumber = (value, min, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
};

const computeBackoffSeconds = ({ attempt, retryBaseSeconds, retryMaxSeconds }) => {
  const safeAttempt = Math.max(1, Number(attempt || 1));
  const base = clampNumber(retryBaseSeconds, 1, 10);
  const cap = clampNumber(retryMaxSeconds, base, 300);
  const delay = base * (2 ** Math.max(safeAttempt - 1, 0));
  return Math.min(delay, cap);
};

const emitOutboxRow = (gateway, row) => {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {});
  const envelope = {
    event: row.eventName,
    sessionId: row.sessionId || null,
    companyId: row.companyId || null,
    payload,
  };

  switch (row.eventGroup) {
    case 'board':
      return gateway.emitBoardEvent(envelope);
    case 'draw':
      return gateway.emitDrawEvent(envelope);
    case 'winner':
      return gateway.emitWinnerEvent(envelope);
    default:
      return gateway.emitSessionEvent(envelope);
  }
};

export async function enqueueRealtimeOutboxEvent(connection, {
  eventGroup = 'session',
  event,
  sessionId = null,
  companyId = null,
  payload = {},
}) {
  if (!connection || typeof connection.query !== 'function' || !event) {
    return null;
  }

  const id = crypto.randomUUID();
  await connection.query(
    `INSERT INTO realtime_event_outbox
      (id, event_group, event_name, session_id, company_id, payload, status, attempts, available_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, NOW(), NOW(), NOW())`,
    [
      id,
      normalizeEventGroup(eventGroup),
      String(event),
      sessionId || null,
      companyId || null,
      JSON.stringify(payload || {}),
    ]
  );

  return id;
}

export async function emitRealtimeEventWithOutbox({
  connection,
  eventGroup = 'session',
  event,
  sessionId = null,
  companyId = null,
  payload = {},
  emit,
}) {
  await enqueueRealtimeOutboxEvent(connection, {
    eventGroup,
    event,
    sessionId,
    companyId,
    payload,
  });

  if (typeof emit === 'function') {
    const emitNow = () => emit();
    if (connection && Array.isArray(connection.__afterCommitHooks)) {
      registerAfterCommit(connection, emitNow);
      return true;
    }
    return emitNow();
  }

  const fallbackEmit = () => realtimeGateway.emitSessionEvent({
    event,
    payload,
    sessionId,
    companyId,
  });

  if (connection && Array.isArray(connection.__afterCommitHooks)) {
    registerAfterCommit(connection, fallbackEmit);
    return true;
  }

  return fallbackEmit();
}

export async function drainRealtimeOutboxBatch({
  limit = 50,
  retryBaseSeconds = 10,
  retryMaxSeconds = 300,
  deadLetterAttempts = 10,
  logger = console,
  dbPool = pool,
  gateway = realtimeGateway,
} = {}) {
  const connection = await dbPool.getConnection();
  let rows = [];

  try {
    await connection.beginTransaction();

    const [selectedRows] = await connection.query(
      `SELECT id,
              event_group AS eventGroup,
              event_name AS eventName,
              session_id AS sessionId,
              company_id AS companyId,
              payload,
              attempts
       FROM realtime_event_outbox
       WHERE status IN ('PENDING', 'FAILED')
         AND available_at <= NOW()
       ORDER BY created_at ASC
       LIMIT ?
       FOR UPDATE SKIP LOCKED`,
      [Number(limit)]
    );

    rows = selectedRows || [];

    if (rows.length === 0) {
      await connection.commit();
      return {
        selected: 0,
        published: 0,
        failed: 0,
      };
    }

    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(', ');
    await connection.query(
      `UPDATE realtime_event_outbox
       SET status = 'PROCESSING', attempts = attempts + 1, updated_at = NOW(), last_error = NULL
       WHERE id IN (${placeholders})`,
      ids
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  let published = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const row of rows) {
    try {
      const emitted = emitOutboxRow(gateway, row);
      if (!emitted) {
        throw new Error('Realtime gateway not attached');
      }

      await dbPool.query(
        `UPDATE realtime_event_outbox
         SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW(), last_error = NULL
         WHERE id = ?`,
        [row.id]
      );
      published += 1;
    } catch (error) {
      const errorMessage = String(error?.message || error || 'emit failed').slice(0, 255);
      const attemptNumber = Number(row.attempts || 0) + 1;
      const deadLetterThreshold = clampNumber(deadLetterAttempts, 1, 10);

      if (attemptNumber >= deadLetterThreshold) {
        deadLettered += 1;
        await dbPool.query(
          `UPDATE realtime_event_outbox
           SET status = 'DEAD_LETTER',
               last_error = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [errorMessage, row.id]
        );
        logger.error('[realtime-outbox] moved to dead-letter', {
          id: row.id,
          attemptNumber,
          deadLetterThreshold,
          error: errorMessage,
        });
      } else {
        failed += 1;
        const backoffSeconds = computeBackoffSeconds({
          attempt: attemptNumber,
          retryBaseSeconds,
          retryMaxSeconds,
        });

        await dbPool.query(
          `UPDATE realtime_event_outbox
           SET status = 'FAILED',
               last_error = ?,
               available_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
               updated_at = NOW()
           WHERE id = ?`,
          [errorMessage, backoffSeconds, row.id]
        );
        logger.error('[realtime-outbox] publish failed', {
          id: row.id,
          attemptNumber,
          backoffSeconds,
          error: errorMessage,
        });
      }
    }
  }

  return {
    selected: rows.length,
    published,
    failed,
    deadLettered,
  };
}

export async function readRealtimeOutboxOperationalMetrics({
  dbPool = pool,
  lookbackHours = 1,
} = {}) {
  const safeLookbackHours = clampNumber(lookbackHours, 1, 1);

  const [[queueCountsRow]] = await dbPool.query(
    `SELECT
       SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pendingCount,
       SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failedCount,
       SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END) AS deadLetterCount
     FROM realtime_event_outbox`
  );

  const [[latencyRow]] = await dbPool.query(
    `SELECT AVG(TIMESTAMPDIFF(MICROSECOND, created_at, published_at) / 1000000.0) AS avgPublishLatencySeconds
     FROM realtime_event_outbox
     WHERE status = 'PUBLISHED'
       AND published_at IS NOT NULL
       AND published_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [safeLookbackHours]
  );

  const [[failureRateRow]] = await dbPool.query(
    `SELECT
       SUM(CASE WHEN status = 'PUBLISHED' AND updated_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) THEN 1 ELSE 0 END) AS publishedRecent,
       SUM(CASE WHEN status IN ('FAILED', 'DEAD_LETTER') AND updated_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) THEN 1 ELSE 0 END) AS failedRecent
     FROM realtime_event_outbox`,
    [safeLookbackHours, safeLookbackHours]
  );

  const pendingCount = Number(queueCountsRow?.pendingCount || 0);
  const failedCount = Number(queueCountsRow?.failedCount || 0);
  const deadLetterCount = Number(queueCountsRow?.deadLetterCount || 0);
  const avgPublishLatencySeconds = Number(latencyRow?.avgPublishLatencySeconds || 0);
  const publishedRecent = Number(failureRateRow?.publishedRecent || 0);
  const failedRecent = Number(failureRateRow?.failedRecent || 0);
  const processedRecent = publishedRecent + failedRecent;
  const failureRate = processedRecent > 0 ? failedRecent / processedRecent : 0;

  return {
    pendingCount,
    failedCount,
    deadLetterCount,
    avgPublishLatencySeconds,
    failureRate,
    publishedRecent,
    failedRecent,
    processedRecent,
    lookbackHours: safeLookbackHours,
  };
}
