import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from '../config/database.js';
import { cleanupWalletIdempotency } from '../scripts/cleanupWalletIdempotency.js';
import { reconcileWalletBalances } from '../scripts/reconcileWalletBalances.js';
import { drainRealtimeOutboxBatch } from './contexts/realtime/realtime.outbox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const CLEANUP_INTERVAL_MINUTES = parsePositiveInt(process.env.WALLET_IDEMPOTENCY_CLEANUP_INTERVAL_MINUTES, 30);
const CLEANUP_INTERVAL_MS = CLEANUP_INTERVAL_MINUTES * 60 * 1000;
const RECONCILIATION_INTERVAL_MINUTES = parsePositiveInt(process.env.WALLET_RECONCILIATION_INTERVAL_MINUTES, 60);
const RECONCILIATION_INTERVAL_MS = RECONCILIATION_INTERVAL_MINUTES * 60 * 1000;
const REALTIME_OUTBOX_INTERVAL_SECONDS = parsePositiveInt(process.env.REALTIME_OUTBOX_DRAIN_INTERVAL_SECONDS, 5);
const REALTIME_OUTBOX_INTERVAL_MS = REALTIME_OUTBOX_INTERVAL_SECONDS * 1000;
const REALTIME_OUTBOX_BATCH_SIZE = parsePositiveInt(process.env.REALTIME_OUTBOX_BATCH_SIZE, 100);
const REALTIME_OUTBOX_RETRY_BASE_SECONDS = parsePositiveInt(process.env.REALTIME_OUTBOX_RETRY_BASE_SECONDS, 10);
const REALTIME_OUTBOX_RETRY_MAX_SECONDS = parsePositiveInt(process.env.REALTIME_OUTBOX_RETRY_MAX_SECONDS, 300);
const REALTIME_OUTBOX_DEAD_LETTER_ATTEMPTS = parsePositiveInt(process.env.REALTIME_OUTBOX_DEAD_LETTER_ATTEMPTS, 10);

let cleanupTimer = null;
let reconciliationTimer = null;
let outboxTimer = null;
let cleanupInFlight = false;
let reconciliationInFlight = false;
let outboxInFlight = false;

async function runCleanupTick() {
  if (cleanupInFlight) {
    console.log('[worker] wallet idempotency cleanup skipped (previous tick still running)');
    return;
  }

  cleanupInFlight = true;
  try {
    await cleanupWalletIdempotency();
  } catch (error) {
    console.error('[worker] wallet idempotency cleanup failed', error?.message || error);
  } finally {
    cleanupInFlight = false;
  }
}

async function runReconciliationTick() {
  if (reconciliationInFlight) {
    console.log('[worker] wallet reconciliation skipped (previous tick still running)');
    return;
  }

  reconciliationInFlight = true;
  try {
    await reconcileWalletBalances();
  } catch (error) {
    console.error('[worker] wallet reconciliation failed', error?.message || error);
  } finally {
    reconciliationInFlight = false;
  }
}

async function runRealtimeOutboxTick() {
  if (outboxInFlight) {
    return;
  }

  outboxInFlight = true;
  try {
    await drainRealtimeOutboxBatch({
      limit: REALTIME_OUTBOX_BATCH_SIZE,
      retryBaseSeconds: REALTIME_OUTBOX_RETRY_BASE_SECONDS,
      retryMaxSeconds: REALTIME_OUTBOX_RETRY_MAX_SECONDS,
      deadLetterAttempts: REALTIME_OUTBOX_DEAD_LETTER_ATTEMPTS,
      dbPool: pool,
      logger: console,
    });
  } catch (error) {
    console.error('[worker] realtime outbox drain failed', error?.message || error);
  } finally {
    outboxInFlight = false;
  }
}

function startWorker() {
  console.log(
    `[worker] started maintenance cleanupInterval=${CLEANUP_INTERVAL_MINUTES}m reconciliationInterval=${RECONCILIATION_INTERVAL_MINUTES}m realtimeOutboxInterval=${REALTIME_OUTBOX_INTERVAL_SECONDS}s`
  );
  runCleanupTick();
  runReconciliationTick();
  runRealtimeOutboxTick();
  cleanupTimer = setInterval(runCleanupTick, CLEANUP_INTERVAL_MS);
  reconciliationTimer = setInterval(runReconciliationTick, RECONCILIATION_INTERVAL_MS);
  outboxTimer = setInterval(runRealtimeOutboxTick, REALTIME_OUTBOX_INTERVAL_MS);
}

async function shutdown(signal) {
  console.log(`[worker] received ${signal}, shutting down`);
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
    reconciliationTimer = null;
  }
  if (outboxTimer) {
    clearInterval(outboxTimer);
    outboxTimer = null;
  }
  try {
    await pool.end();
  } catch (error) {
    console.error('[worker] error closing DB pool', error?.message || error);
  }
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

startWorker();
