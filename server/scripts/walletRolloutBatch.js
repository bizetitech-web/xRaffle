import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ALLOWED_POLICIES = new Set(['ledger_to_cached', 'cached_to_ledger']);

function getArg(name, fallback = null) {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function runCommand(args) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const commandArgs = isWindows ? ['/d', '/s', '/c', 'npm', ...args] : args;

  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = `${stdout}${stderr}`;

  if (result.error) {
    throw new Error(`Failed to execute command: npm ${args.join(' ')}\n${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: npm ${args.join(' ')}\n${output}`);
  }

  return output;
}

function buildServerNpmArgs(scriptName, scriptArgs = []) {
  const cwd = process.cwd();
  const runningInsideServer = basename(cwd).toLowerCase() === 'server' && existsSync(join(cwd, 'package.json'));

  if (runningInsideServer) {
    return ['run', scriptName, ...(scriptArgs.length ? ['--', ...scriptArgs] : [])];
  }

  return ['--prefix', 'server', 'run', scriptName, ...(scriptArgs.length ? ['--', ...scriptArgs] : [])];
}

function parseReconcileSummary(output) {
  const runIdMatch = output.match(/runId:\s*'([^']+)'/);
  const mismatchMatch = output.match(/mismatchCount:\s*(\d+)/);
  const statusMatch = output.match(/status:\s*'([^']+)'/);

  if (!runIdMatch || !mismatchMatch) {
    throw new Error(`Unable to parse reconcile output:\n${output}`);
  }

  return {
    runId: runIdMatch[1],
    mismatchCount: Number.parseInt(mismatchMatch[1], 10),
    status: statusMatch ? statusMatch[1] : 'UNKNOWN',
  };
}

function parseJsonBlock(output) {
  const start = output.lastIndexOf('\n{');
  const jsonText = start >= 0 ? output.slice(start + 1).trim() : output.trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`Unable to parse JSON block from output:\n${output}`);
  }
}

function runReconcile() {
  const output = runCommand(buildServerNpmArgs('wallet:reconcile'));
  return parseReconcileSummary(output);
}

function runReport(runId) {
  const output = runCommand(buildServerNpmArgs('wallet:reconcile:report', [`--run-id=${runId}`]));
  return parseJsonBlock(output);
}

function runRepair(policy, runId, apply = false) {
  const repairArgs = [`--policy=${policy}`, `--run-id=${runId}`];

  if (apply) repairArgs.push('--apply');

  const output = runCommand(buildServerNpmArgs('wallet:repair', repairArgs));
  return parseJsonBlock(output);
}

async function main() {
  const environment = String(getArg('env', 'unknown')).trim();
  const policy = String(getArg('policy', 'ledger_to_cached')).trim().toLowerCase();
  const dryRunOnly = hasFlag('dry-run-only');

  if (!ALLOWED_POLICIES.has(policy)) {
    console.error(`[wallet-rollout] invalid --policy. Expected one of: ${Array.from(ALLOWED_POLICIES).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[wallet-rollout] environment=${environment} policy=${policy} dryRunOnly=${dryRunOnly}`);

  const baseline = runReconcile();
  const baselineReport = runReport(baseline.runId);

  console.log(
    `[wallet-rollout] baseline runId=${baseline.runId} status=${baseline.status} mismatchCount=${baseline.mismatchCount}`
  );

  const dryRunLedgerToCached = runRepair('ledger_to_cached', baseline.runId, false);
  const dryRunCachedToLedger = runRepair('cached_to_ledger', baseline.runId, false);

  if (dryRunOnly) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run-only',
          environment,
          baseline,
          baselineReport,
          dryRunLedgerToCached: {
            runId: dryRunLedgerToCached.runId,
            mismatchCount: dryRunLedgerToCached.mismatchCount,
          },
          dryRunCachedToLedger: {
            runId: dryRunCachedToLedger.runId,
            mismatchCount: dryRunCachedToLedger.mismatchCount,
          },
          note: 'No changes applied. Re-run without --dry-run-only to execute selected policy.',
        },
        null,
        2
      )
    );
    return;
  }

  if (baseline.mismatchCount === 0) {
    console.log(
      JSON.stringify(
        {
          mode: 'no-op',
          environment,
          baseline,
          baselineReport,
          note: 'No mismatches detected; skipping apply step.',
        },
        null,
        2
      )
    );
    return;
  }

  const applySummary = runRepair(policy, baseline.runId, true);
  const post = runReconcile();
  const postReport = runReport(post.runId);

  const outcome = {
    mode: 'apply',
    environment,
    selectedPolicy: policy,
    baseline,
    baselineReport: {
      runId: baselineReport.runId,
      status: baselineReport.status,
      mismatchCount: baselineReport.mismatchCount,
    },
    dryRuns: {
      ledger_to_cached: {
        runId: dryRunLedgerToCached.runId,
        mismatchCount: dryRunLedgerToCached.mismatchCount,
      },
      cached_to_ledger: {
        runId: dryRunCachedToLedger.runId,
        mismatchCount: dryRunCachedToLedger.mismatchCount,
      },
    },
    applySummary,
    post,
    postReport: {
      runId: postReport.runId,
      status: postReport.status,
      mismatchCount: postReport.mismatchCount,
    },
    gatePassed: post.mismatchCount === 0,
  };

  console.log(JSON.stringify(outcome, null, 2));

  if (!outcome.gatePassed) {
    console.error('[wallet-rollout] gate failed: post-apply mismatchCount must be 0 before proceeding.');
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('[wallet-rollout] failed', error?.message || error);
  process.exitCode = 1;
});
