// Script: run-migrations.js
// Usage: node scripts/run-migrations.js
// Runs all SQL files in scripts/migrations against the configured DB

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

// Update these with your DB config or use env vars
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS ?? process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || 'xraffle_db',
  multipleStatements: true,
};

async function runMigrations() {
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const connection = await mysql.createConnection(dbConfig);
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`\n--- Running migration: ${file} ---`);
      await connection.query(sql);
      console.log(`Migration ${file} completed.`);
    }
    console.log('\nAll migrations completed successfully.');
  } finally {
    await connection.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
