import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function normalizeName(value) {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function normalizeOptional(value) {
  const normalized = (value || '').trim();
  return normalized || null;
}

function validateInputs({ name, email }) {
  if (!name) {
    throw new Error('Hotel name is required. Provide --name or HOTEL_NAME (or legacy ORGANIZATION_NAME).');
  }

  if (name.length < 3) {
    throw new Error('Hotel name must be at least 3 characters.');
  }

  if (email && !EMAIL_REGEX.test(email)) {
    throw new Error('Hotel email is invalid. Provide a valid email or omit --email.');
  }
}

export async function run() {
  const args = parseArgs(process.argv.slice(2));

  const name = normalizeName(args.name || process.env.HOTEL_NAME || process.env.ORGANIZATION_NAME || '');
  const email = normalizeOptional(args.email || process.env.HOTEL_EMAIL || process.env.ORGANIZATION_EMAIL || '');
  const phone = normalizeOptional(args.phone || process.env.HOTEL_PHONE || process.env.ORGANIZATION_PHONE || '');

  validateInputs({ name, email });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT id FROM hotel_companies WHERE name = ? LIMIT 1',
      [name]
    );

    let hotelCompanyId;
    let action;

    if (existing.length > 0) {
      hotelCompanyId = existing[0].id;
      action = 'updated';

      await connection.query(
        `UPDATE hotel_companies
         SET name = ?, email = ?, phone = ?, is_active = 1, updated_at = NOW()
         WHERE id = ?`,
        [name, email, phone, hotelCompanyId]
      );
    } else {
      hotelCompanyId = crypto.randomUUID();
      action = 'created';

      await connection.query(
        `INSERT INTO hotel_companies
         (id, name, email, phone, is_active, created_at)
         VALUES (?, ?, ?, ?, 1, NOW())`,
        [hotelCompanyId, name, email, phone]
      );
    }

    await connection.commit();

    console.log('Hotel bootstrap completed successfully.');
    console.log(`- Action: ${action}`);
    console.log(`- Hotel ID: ${hotelCompanyId}`);
    console.log(`- Name: ${name}`);
    if (email) {
      console.log(`- Email: ${email}`);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Failed to bootstrap hotel:', error.message);
      process.exit(1);
    });
}
