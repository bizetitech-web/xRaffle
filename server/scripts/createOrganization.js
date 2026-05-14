import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const CODE_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
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

function normalizeCode(value) {
  return (value || '').trim().toLowerCase();
}

function normalizeOptional(value) {
  const normalized = (value || '').trim();
  return normalized || null;
}

function validateInputs({ name, code, email }) {
  if (!name) {
    throw new Error('Organization name is required. Provide --name or ORGANIZATION_NAME.');
  }

  if (name.length < 3) {
    throw new Error('Organization name must be at least 3 characters.');
  }

  if (!code) {
    throw new Error('Organization code is required. Provide --code or ORGANIZATION_CODE.');
  }

  if (!CODE_REGEX.test(code)) {
    throw new Error('Organization code must use lowercase letters, numbers, and hyphens (3-50 chars, no leading/trailing hyphen).');
  }

  if (email && !EMAIL_REGEX.test(email)) {
    throw new Error('Organization email is invalid. Provide a valid email or omit --email.');
  }
}

export async function run() {
  const args = parseArgs(process.argv.slice(2));

  const name = normalizeName(args.name || process.env.ORGANIZATION_NAME || '');
  const code = normalizeCode(args.code || process.env.ORGANIZATION_CODE || '');
  const email = normalizeOptional(args.email || process.env.ORGANIZATION_EMAIL || '');
  const phone = normalizeOptional(args.phone || process.env.ORGANIZATION_PHONE || '');
  const address = normalizeOptional(args.address || process.env.ORGANIZATION_ADDRESS || '');
  const city = normalizeOptional(args.city || process.env.ORGANIZATION_CITY || '');
  const state = normalizeOptional(args.state || process.env.ORGANIZATION_STATE || '');
  const country = normalizeOptional(args.country || process.env.ORGANIZATION_COUNTRY || '');
  const postalCode = normalizeOptional(args.postalCode || process.env.ORGANIZATION_POSTAL_CODE || '');

  validateInputs({ name, code, email });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT id FROM organizations WHERE code = ? LIMIT 1',
      [code]
    );

    let organizationId;
    let action;

    if (existing.length > 0) {
      organizationId = existing[0].id;
      action = 'updated';

      await connection.query(
        `UPDATE organizations
         SET name = ?, email = ?, phone = ?, address = ?, city = ?, state = ?, country = ?, postal_code = ?, is_active = 1, updated_at = NOW()
         WHERE id = ?`,
        [name, email, phone, address, city, state, country, postalCode, organizationId]
      );
    } else {
      organizationId = crypto.randomUUID();
      action = 'created';

      await connection.query(
        `INSERT INTO organizations
         (id, name, code, email, phone, address, city, state, country, postal_code, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
        [organizationId, name, code, email, phone, address, city, state, country, postalCode]
      );
    }

    await connection.commit();

    console.log('Organization bootstrap completed successfully.');
    console.log(`- Action: ${action}`);
    console.log(`- Organization ID: ${organizationId}`);
    console.log(`- Name: ${name}`);
    console.log(`- Code: ${code}`);
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
      console.error('Failed to bootstrap organization:', error.message);
      process.exit(1);
    });
}
