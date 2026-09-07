import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node scripts/applyMigrationFile.js <migration-file>');
  process.exit(1);
}

const resolved = path.isAbsolute(migrationFile)
  ? migrationFile
  : path.join(process.cwd(), migrationFile);

if (!fs.existsSync(resolved)) {
  console.error(`Migration file not found: ${resolved}`);
  process.exit(1);
}

const sql = fs.readFileSync(resolved, 'utf8');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'xraffle',
  multipleStatements: true,
});

try {
  await conn.query(sql);
  console.log(`Applied migration file: ${resolved}`);
} finally {
  await conn.end();
}
