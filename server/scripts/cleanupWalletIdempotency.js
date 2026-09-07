import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const retentionHours = parsePositiveInt(process.env.WALLET_IDEMPOTENCY_RETENTION_HOURS, 24 * 7);
const pendingRetentionHours = parsePositiveInt(process.env.WALLET_IDEMPOTENCY_PENDING_RETENTION_HOURS, 24);

const toMySqlDateTime = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

export async function cleanupWalletIdempotency({
  retentionHoursOverride,
  pendingRetentionHoursOverride,
  logger = console,
  dbPool = pool,
} = {}) {
  const effectiveRetentionHours = parsePositiveInt(retentionHoursOverride, retentionHours);
  const effectivePendingRetentionHours = parsePositiveInt(pendingRetentionHoursOverride, pendingRetentionHours);
  const effectiveCompletedCutoff = toMySqlDateTime(new Date(Date.now() - effectiveRetentionHours * 60 * 60 * 1000));
  const effectivePendingCutoff = toMySqlDateTime(new Date(Date.now() - effectivePendingRetentionHours * 60 * 60 * 1000));

  logger.log(
    `[wallet-idempotency-cleanup] start retentionHours=${effectiveRetentionHours} pendingRetentionHours=${effectivePendingRetentionHours}`
  );

  const [completedResult] = await dbPool.query(
    `DELETE FROM wallet_idempotency_requests
     WHERE status IN ('COMPLETED', 'FAILED')
       AND COALESCE(completed_at, created_at) < ?`,
    [effectiveCompletedCutoff]
  );

  const [pendingResult] = await dbPool.query(
    `DELETE FROM wallet_idempotency_requests
     WHERE status = 'PENDING'
       AND created_at < ?`,
    [effectivePendingCutoff]
  );

  const summary = {
    deletedCompletedOrFailed: Number(completedResult?.affectedRows || 0),
    deletedPending: Number(pendingResult?.affectedRows || 0),
    completedCutoff: effectiveCompletedCutoff,
    pendingCutoff: effectivePendingCutoff,
  };

  logger.log('[wallet-idempotency-cleanup] done', summary);
  return summary;
}

async function runCli() {
  try {
    await cleanupWalletIdempotency();
  } catch (error) {
    console.error('[wallet-idempotency-cleanup] failed', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runCli();
}
