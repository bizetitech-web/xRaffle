import { spawn } from 'child_process';
import pool from '../config/database.js';

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

async function truncateAllTables(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS tableName
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ?
       AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME ASC`,
    [process.env.DB_NAME]
  );

  const tableNames = rows.map((row) => row.tableName).filter(Boolean);
  if (tableNames.length === 0) {
    console.log('⚠️ No base tables found for truncation.');
    return;
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const tableName of tableNames) {
      await connection.query(`TRUNCATE TABLE ${tableName}`);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  console.log(`✅ Truncated ${tableNames.length} table(s).`);
}

async function resetAndSeed() {
  const args = parseArgs(process.argv.slice(2));
  const confirmValue = (args.confirm || process.env.RESET_AND_SEED_CONFIRM || '').trim().toUpperCase();
  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase();

  if (nodeEnv !== 'development') {
    throw new Error(`Refusing reset-and-seed: NODE_ENV must be development, received "${process.env.NODE_ENV || ''}".`);
  }

  if (confirmValue !== 'RESET_AND_SEED') {
    throw new Error('Refusing reset-and-seed: pass --confirm RESET_AND_SEED (or set RESET_AND_SEED_CONFIRM=RESET_AND_SEED).');
  }

  console.log('⚠️  Development reset-and-seed in progress...');

  const connection = await pool.getConnection();
  try {
    await truncateAllTables(connection);
  } finally {
    connection.release();
    await pool.end();
  }

  console.log('🔄 Re-running migrations and canonical seed data...');
  await runMigrateCommand();
  console.log('✅ Reset-and-seed completed.');
}

resetAndSeed().catch((error) => {
  console.error('Failed to reset and seed database:', error.message);
  process.exit(1);
});
