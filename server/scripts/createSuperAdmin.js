import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const BCRYPT_ROUNDS = 12;
const SUPER_ADMIN_ROLE_NAME = 'super_admin';

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

function normalizeName(name) {
  return (name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

async function getHotelCompanyId(connection, requestedHotelCompanyId) {
  if (requestedHotelCompanyId) {
    const [rows] = await connection.query(
      'SELECT id FROM hotel_companies WHERE id = ? LIMIT 1',
      [requestedHotelCompanyId]
    );

    if (rows.length === 0) {
      throw new Error(`Hotel company not found: ${requestedHotelCompanyId}`);
    }

    return rows[0].id;
  }

  const [rows] = await connection.query(
    'SELECT id FROM hotel_companies ORDER BY created_at ASC, id ASC LIMIT 1'
  );

  if (rows.length === 0) {
    throw new Error('No hotels found. Create a hotel first or pass --hotelCompanyId.');
  }

  return rows[0].id;
}

async function ensureSuperAdminRole(connection) {
  const [existingRole] = await connection.query(
    `SELECT id, name
     FROM roles
     WHERE LOWER(REPLACE(REPLACE(REPLACE(name, '_', ''), '-', ''), ' ', '')) = ?
     ORDER BY CASE WHEN LOWER(name) = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    ['superadmin', SUPER_ADMIN_ROLE_NAME]
  );

  if (existingRole.length > 0) {
    if (existingRole[0].name !== SUPER_ADMIN_ROLE_NAME) {
      await connection.query(
        'UPDATE roles SET name = ? WHERE id = ?',
        [SUPER_ADMIN_ROLE_NAME, existingRole[0].id]
      );
    }

    return existingRole[0].id;
  }

  const roleId = crypto.randomUUID();
  await connection.query(
    'INSERT INTO roles (id, name) VALUES (?, ?)',
    [roleId, SUPER_ADMIN_ROLE_NAME]
  );

  return roleId;
}

export async function run() {
  const args = parseArgs(process.argv.slice(2));

  const email = (args.email || process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = args.password || process.env.SUPER_ADMIN_PASSWORD;
  const requestedName = args.name || process.env.SUPER_ADMIN_NAME || 'Super Admin';
  const phone = args.phone || process.env.SUPER_ADMIN_PHONE || null;
  const requestedHotelCompanyId =
    args.hotelCompanyId || process.env.SUPER_ADMIN_HOTEL_COMPANY_ID || process.env.SUPER_ADMIN_ORG_ID || null;

  if (!email) {
    throw new Error('Missing email. Provide --email or SUPER_ADMIN_EMAIL.');
  }

  if (!password) {
    throw new Error('Missing password. Provide --password or SUPER_ADMIN_PASSWORD.');
  }

  const name = normalizeName(requestedName);
  if (!name) {
    throw new Error('Name cannot be empty. Provide --name or SUPER_ADMIN_NAME.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const hotelCompanyId = await getHotelCompanyId(connection, requestedHotelCompanyId);
    const roleId = await ensureSuperAdminRole(connection);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE hotel_company_id = ? AND email = ? LIMIT 1',
      [hotelCompanyId, email]
    );

    let userId;
    let action;

    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      action = 'updated';

      await connection.query(
        `UPDATE users
         SET name = ?,
             password_hash = ?,
             phone = ?,
             is_active = 1
         WHERE id = ?`,
        [name, passwordHash, phone, userId]
      );
    } else {
      userId = crypto.randomUUID();
      action = 'created';

      await connection.query(
        `INSERT INTO users (
          id,
          hotel_company_id,
          name,
          email,
          password_hash,
          phone,
          is_active,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
        [userId, hotelCompanyId, name, email, passwordHash, phone]
      );
    }

    await connection.query(
      'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, roleId]
    );

    await connection.commit();

    console.log('Super admin user synced successfully.');
    console.log(`- Action: ${action}`);
    console.log(`- User ID: ${userId}`);
    console.log(`- Email: ${email}`);
    console.log(`- Hotel ID: ${hotelCompanyId}`);
    console.log(`- Role: ${SUPER_ADMIN_ROLE_NAME} (${roleId})`);
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
      console.error('Failed to sync super admin user:', error.message);
      process.exit(1);
    });
}