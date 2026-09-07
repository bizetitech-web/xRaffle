import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from '../config/database.js';
import { drainRealtimeOutboxBatch } from '../src/contexts/realtime/realtime.outbox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export async function drainRealtimeOutboxOnce({
  limit = parsePositiveInt(process.env.REALTIME_OUTBOX_BATCH_SIZE, 100),
  retryBaseSeconds = parsePositiveInt(process.env.REALTIME_OUTBOX_RETRY_BASE_SECONDS, 10),
  retryMaxSeconds = parsePositiveInt(process.env.REALTIME_OUTBOX_RETRY_MAX_SECONDS, 300),
  deadLetterAttempts = parsePositiveInt(process.env.REALTIME_OUTBOX_DEAD_LETTER_ATTEMPTS, 10),
  logger = console,
} = {}) {
  const summary = await drainRealtimeOutboxBatch({
    limit,
    retryBaseSeconds,
    retryMaxSeconds,
    deadLetterAttempts,
    logger,
    dbPool: pool,
  });

  logger.log('[realtime-outbox] drain summary', summary);
  return summary;
}

async function runCli() {
  try {
    await drainRealtimeOutboxOnce();
  } catch (error) {
    console.error('[realtime-outbox] drain failed', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runCli();
}
