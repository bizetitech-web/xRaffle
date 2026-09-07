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

const allowedPolicies = new Set(['ledger_to_cached', 'cached_to_ledger']);

function getArg(name, fallback = null) {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function resolveRunId(connection, requestedRunId = null) {
  if (requestedRunId) return requestedRunId;
  const [[row]] = await connection.query(
    `SELECT id
     FROM wallet_reconciliation_runs
     ORDER BY started_at DESC
     LIMIT 1`
  );
  return row?.id || null;
}

async function run() {
  const policy = String(getArg('policy', 'ledger_to_cached')).trim().toLowerCase();
  const mode = hasFlag('apply') ? 'apply' : 'dry-run';
  const runIdArg = getArg('run-id', null);

  if (!allowedPolicies.has(policy)) {
    console.error(`[wallet-repair] invalid --policy. Expected one of: ${Array.from(allowedPolicies).join(', ')}`);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const connection = await pool.getConnection();

  try {
    const runId = await resolveRunId(connection, runIdArg);
    if (!runId) {
      console.log('[wallet-repair] no reconciliation run found; nothing to repair');
      return;
    }

    const [items] = await connection.query(
      `SELECT
         wri.wallet_id AS walletId,
         wri.cached_balance AS cachedBalance,
         wri.ledger_balance AS ledgerBalance,
         wri.delta,
         wa.balance AS walletBalance
       FROM wallet_reconciliation_items wri
       JOIN wallet_accounts wa ON wa.id = wri.wallet_id
       WHERE wri.run_id = ?
       ORDER BY ABS(wri.delta) DESC`,
      [runId]
    );

    const actionable = items.filter((row) => Math.abs(Number(row.delta || 0)) >= EPSILON);

    const preview = actionable.map((row) => {
      const cachedBalance = roundMoney(row.cachedBalance);
      const ledgerBalance = roundMoney(row.ledgerBalance);
      const delta = roundMoney(row.delta);
      return {
        walletId: row.walletId,
        cachedBalance,
        ledgerBalance,
        delta,
        action:
          policy === 'ledger_to_cached'
            ? `UPDATE wallet_accounts.balance -> ${ledgerBalance}`
            : `INSERT ADJUSTMENT txn ${delta > 0 ? 'DEBIT' : 'CREDIT'} amount=${Math.abs(delta)}`,
      };
    });

    if (mode === 'dry-run') {
      console.log(
        JSON.stringify(
          {
            mode,
            policy,
            runId,
            mismatchCount: actionable.length,
            preview,
            note: 'Re-run with --apply to execute repairs.',
          },
          null,
          2
        )
      );
      return;
    }

    await connection.beginTransaction();

    let updatedWallets = 0;
    let insertedAdjustments = 0;

    for (const row of actionable) {
      const walletId = row.walletId;
      const cachedBalance = roundMoney(row.cachedBalance);
      const ledgerBalance = roundMoney(row.ledgerBalance);
      const delta = roundMoney(cachedBalance - ledgerBalance);

      if (policy === 'ledger_to_cached') {
        await connection.query('UPDATE wallet_accounts SET balance = ? WHERE id = ?', [ledgerBalance, walletId]);
        updatedWallets += 1;
      } else {
        const amount = Math.abs(delta);
        if (amount < EPSILON) continue;

        const direction = delta > 0 ? 'DEBIT' : 'CREDIT';
        const balanceBefore = ledgerBalance;
        const balanceAfter = direction === 'DEBIT'
          ? roundMoney(balanceBefore - amount)
          : roundMoney(balanceBefore + amount);

        await connection.query(
          `INSERT INTO wallet_transactions
            (id, wallet_id, transaction_type, direction, amount, balance_before, balance_after, reference_type, reference_id, idempotency_key, correlation_id, description, status, created_by, created_at)
           VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?, 'RECONCILIATION', ?, ?, ?, ?, 'POSTED', NULL, NOW())`,
          [
            randomUUID(),
            walletId,
            direction,
            amount,
            balanceBefore,
            balanceAfter,
            runId,
            `wallet-repair:${runId}:${walletId}:${policy}`,
            `wallet-repair:${runId}`,
            `Baseline repair (${policy}) for reconciliation run ${runId}`,
          ]
        );
        insertedAdjustments += 1;
      }
    }

    await connection.commit();

    console.log(
      JSON.stringify(
        {
          mode,
          policy,
          runId,
          mismatchCount: actionable.length,
          updatedWallets,
          insertedAdjustments,
          note:
            policy === 'ledger_to_cached'
              ? 'Wallet balances were updated to ledger-derived values.'
              : 'Adjustment transactions were inserted to align ledger totals to cached balances.',
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}
    console.error('[wallet-repair] failed', error?.message || error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

run();
