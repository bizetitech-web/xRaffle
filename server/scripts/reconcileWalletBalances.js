import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import pool from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const EPSILON = 0.01;

const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;

const severityForDelta = (delta) => {
  const abs = Math.abs(delta);
  if (abs >= 100) return 'CRITICAL';
  if (abs >= 1) return 'WARN';
  return 'INFO';
};

export async function reconcileWalletBalances({ logger = console, dbPool = pool, createdBy = null } = {}) {
  const runId = randomUUID();
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO wallet_reconciliation_runs
        (id, started_at, status, checked_wallets, mismatch_count, created_by, created_at)
       VALUES (?, NOW(), 'RUNNING', 0, 0, ?, NOW())`,
      [runId, createdBy]
    );

    const [rows] = await connection.query(
      `SELECT
         wa.id AS walletId,
         wa.balance AS cachedBalance,
         COALESCE(SUM(
           CASE
             WHEN COALESCE(wt.status, 'POSTED') NOT IN ('POSTED', 'REVERSED') THEN 0
             WHEN wt.direction = 'CREDIT' THEN wt.amount
             WHEN wt.direction = 'DEBIT' THEN -wt.amount
             WHEN wt.transaction_type IN ('TOPUP','REFUND','BONUS','REVERSAL') THEN wt.amount
             ELSE -wt.amount
           END
         ), 0) AS ledgerBalance
       FROM wallet_accounts wa
       LEFT JOIN wallet_transactions wt ON wt.wallet_id = wa.id
       GROUP BY wa.id, wa.balance`
    );

    let mismatchCount = 0;
    let checkedWallets = 0;
    let totalCached = 0;
    let totalLedger = 0;

    for (const row of rows) {
      checkedWallets += 1;
      const cachedBalance = roundMoney(row.cachedBalance);
      const ledgerBalance = roundMoney(row.ledgerBalance);
      const delta = roundMoney(cachedBalance - ledgerBalance);

      totalCached = roundMoney(totalCached + cachedBalance);
      totalLedger = roundMoney(totalLedger + ledgerBalance);

      if (Math.abs(delta) >= EPSILON) {
        mismatchCount += 1;
        await connection.query(
          `INSERT INTO wallet_reconciliation_items
            (id, run_id, wallet_id, cached_balance, ledger_balance, delta, severity, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            randomUUID(),
            runId,
            row.walletId,
            cachedBalance,
            ledgerBalance,
            delta,
            severityForDelta(delta),
            JSON.stringify({ epsilon: EPSILON, source: 'reconcileWalletBalances' }),
          ]
        );
      }
    }

    const finalStatus = mismatchCount === 0 ? 'PASS' : 'FAIL';

    await connection.query(
      `UPDATE wallet_reconciliation_runs
       SET status = ?,
           finished_at = NOW(),
           checked_wallets = ?,
           mismatch_count = ?,
           total_cached_balance = ?,
           total_ledger_balance = ?,
           notes = ?
       WHERE id = ?`,
      [
        finalStatus,
        checkedWallets,
        mismatchCount,
        totalCached,
        totalLedger,
        mismatchCount === 0 ? 'No mismatches detected.' : 'Mismatches detected. Review wallet_reconciliation_items.',
        runId,
      ]
    );

    await connection.commit();

    const summary = {
      runId,
      status: finalStatus,
      checkedWallets,
      mismatchCount,
      totalCachedBalance: totalCached,
      totalLedgerBalance: totalLedger,
    };

    logger.log('[wallet-reconcile] completed', summary);
    return summary;
  } catch (error) {
    await connection.rollback();
    logger.error('[wallet-reconcile] failed', error?.message || error);
    throw error;
  } finally {
    connection.release();
  }
}

async function runCli() {
  try {
    await reconcileWalletBalances();
  } catch (error) {
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runCli();
}
