import { spawn } from 'child_process';
import pool from '../config/database.js';

const MANAGED_TABLES = [
  'audit_logs',
  'role_permissions',
  'user_roles',
  'users',
  'hotel_branches',
  'permissions',
  'roles',
  'hotel_companies',
];

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

function runMigrateCommand() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/migrate.js'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Migration command exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function resetDatabase() {
  const args = parseArgs(process.argv.slice(2));
  const confirmValue = (args.confirm || process.env.RESET_DB_CONFIRM || '').trim().toUpperCase();
  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase();

  if (nodeEnv !== 'development') {
    throw new Error(`Refusing reset: NODE_ENV must be development, received "${process.env.NODE_ENV || ''}".`);
  }

  if (confirmValue !== 'RESET') {
    throw new Error('Refusing reset: pass --confirm RESET (or set RESET_DB_CONFIRM=RESET).');
  }

  console.log('⚠️  Development reset in progress...');

  const connection = await pool.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of MANAGED_TABLES) {
      await connection.query(`TRUNCATE TABLE ${table}`);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Managed tables truncated successfully.');
  } finally {
    connection.release();
    await pool.end();
  }

  console.log('🔄 Re-running migrations and seed...');
  await runMigrateCommand();
  console.log('✅ Development reset completed.');
}

resetDatabase().catch((error) => {
  console.error('Failed to reset development database:', error.message);
  process.exit(1);
});
