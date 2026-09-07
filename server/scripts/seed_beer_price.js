// Usage (PowerShell):
// $env:DB_HOST='localhost'; $env:DB_USER='root'; $env:DB_PASS='password'; $env:DB_NAME='xraffle_db'; node scripts/seed_beer_price.js <branchId> <price>

import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

const branchId = process.argv[2];
const priceArg = process.argv[3];

if (!branchId || !priceArg) {
  console.error('Usage: node scripts/seed_beer_price.js <branchId> <price>');
  process.exit(1);
}

const price = Number(priceArg);
if (!Number.isFinite(price) || price <= 0) {
  console.error('Invalid price');
  process.exit(1);
}

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS ?? process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || 'xraffle_db',
};

async function seed() {
  const conn = await mysql.createConnection(dbConfig);
  try {
    const id = uuidv4();
    const res = await conn.query(
      `INSERT INTO branch_beer_prices (id, branch_id, price, effective_from, created_by, created_at)
       VALUES (?, ?, ?, NOW(), ?, NOW())`,
      [id, branchId, price, null]
    );
    console.log('Inserted branch_beer_price id=', id);
  } finally {
    await conn.end();
  }
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
