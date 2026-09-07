import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import pool from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

try {
  const [rows] = await pool.query(
    `SELECT COLUMN_DEFAULT, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'games'
       AND COLUMN_NAME = 'beer_price'`
  );

  console.log(JSON.stringify(rows[0] || null));
} finally {
  await pool.end();
}
