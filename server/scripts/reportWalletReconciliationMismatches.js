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

async function run() {
  const limit = parsePositiveInt(process.env.WALLET_RECONCILIATION_REPORT_LIMIT, 20);
  const runIdArg = process.argv.find((arg) => arg.startsWith('--run-id='));
  const runId = runIdArg ? runIdArg.split('=')[1] : null;

  try {
    const [[latestRun]] = runId
      ? await pool.query(
          `SELECT id, status, mismatch_count AS mismatchCount, started_at AS startedAt, finished_at AS finishedAt
           FROM wallet_reconciliation_runs
           WHERE id = ?
           LIMIT 1`,
          [runId]
        )
      : await pool.query(
          `SELECT id, status, mismatch_count AS mismatchCount, started_at AS startedAt, finished_at AS finishedAt
           FROM wallet_reconciliation_runs
           ORDER BY started_at DESC
           LIMIT 1`
        );

    if (!latestRun?.id) {
      if (runId) {
        console.log(`[wallet-reconciliation-report] reconciliation run not found for run-id=${runId}`);
      } else {
        console.log('[wallet-reconciliation-report] no reconciliation runs found');
      }
      return;
    }

    const [rows] = await pool.query(
      `SELECT
         wri.wallet_id AS walletId,
         wa.company_id AS companyId,
         hc.name AS companyName,
         wri.cached_balance AS cachedBalance,
         wri.ledger_balance AS ledgerBalance,
         wri.delta,
         wri.severity,
         wri.created_at AS observedAt
       FROM wallet_reconciliation_items wri
       JOIN wallet_accounts wa ON wa.id = wri.wallet_id
       LEFT JOIN hotel_companies hc ON hc.id = wa.company_id
       WHERE wri.run_id = ?
       ORDER BY ABS(wri.delta) DESC, wri.created_at DESC
       LIMIT ?`,
      [latestRun.id, limit]
    );

    const output = {
      runId: latestRun.id,
      status: latestRun.status || null,
      mismatchCount: Number(latestRun.mismatchCount || rows.length || 0),
      startedAt: latestRun.startedAt || null,
      finishedAt: latestRun.finishedAt || null,
      topMismatches: rows.map((row) => ({
        walletId: row.walletId,
        companyId: row.companyId,
        companyName: row.companyName || null,
        cachedBalance: Number(row.cachedBalance || 0),
        ledgerBalance: Number(row.ledgerBalance || 0),
        delta: Number(row.delta || 0),
        absDelta: Math.abs(Number(row.delta || 0)),
        severity: row.severity,
        observedAt: row.observedAt,
      })),
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error('[wallet-reconciliation-report] failed', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
