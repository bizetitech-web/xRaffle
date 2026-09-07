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

async function ensureRolePermissions(connection, roleId) {
  const requiredPermissions = [
    {
      id: '89a386a1-207b-11f1-89b6-a4e078b831cc',
      name: 'MANAGE_USERS',
      module: 'admin',
      description: 'Create, update, and deactivate users',
    },
    {
      id: '89a386a2-207b-11f1-89b6-a4e078b831cc',
      name: 'MANAGE_ROLES',
      module: 'admin',
      description: 'Create and manage roles and role permissions',
    },
    {
      id: '89a386a3-207b-11f1-89b6-a4e078b831cc',
      name: 'MANAGE_HOTELS',
      module: 'admin',
      description: 'Create and update hotels',
    },
    {
      id: '89a386af-207b-11f1-89b6-a4e078b831cc',
      name: 'MANAGE_FEE_TEMPLATES',
      module: 'admin',
      description: 'Manage hotel fee templates',
    },
    {
      id: '89a386b0-207b-11f1-89b6-a4e078b831cc',
      name: 'MANAGE_HOTEL',
      module: 'admin',
      description: 'Manage own hotel scope resources',
    },
    {
      id: '89a386b1-207b-11f1-89b6-a4e078b831cc',
      name: 'VIEW_DAILY_REPORTS',
      module: 'reports',
      description: 'View daily branch and company reports by role scope',
    },
    {
      id: '89a386a4-207b-11f1-89b6-a4e078b831cc',
      name: 'VIEW_AUDIT_LOGS',
      module: 'admin',
      description: 'View audit log entries',
    },
    {
      id: '89a386a5-207b-11f1-89b6-a4e078b831cc',
      name: 'VIEW_WALLET',
      module: 'wallet',
      description: 'View wallet balances and transactions',
    },
    {
      id: '89a386a6-207b-11f1-89b6-a4e078b831cc',
      name: 'TOPUP_WALLET',
      module: 'wallet',
      description: 'Top up company wallet balances',
    },
    {
      id: '89a386a7-207b-11f1-89b6-a4e078b831cc',
      name: 'MANAGE_GAMES',
      module: 'games',
      description: 'Create and configure games',
    },
    {
      id: '89a386a8-207b-11f1-89b6-a4e078b831cc',
      name: 'VIEW_GAMES',
      module: 'games',
      description: 'View games and game details',
    },
    {
      id: '89a386a9-207b-11f1-89b6-a4e078b831cc',
      name: 'SELL_CARDS',
      module: 'games',
      description: 'Sell game cards during active games',
    },
    {
      id: '89a386aa-207b-11f1-89b6-a4e078b831cc',
      name: 'RUN_DRAWS',
      module: 'games',
      description: 'Start and execute game draws',
    },
    {
      id: '89a386ab-207b-11f1-89b6-a4e078b831cc',
      name: 'VIEW_WINNERS',
      module: 'games',
      description: 'View winners for game draws',
    },
    {
      id: '89a386ac-207b-11f1-89b6-a4e078b831cc',
      name: 'CLAIM_PRIZES',
      module: 'games',
      description: 'Claim winner prizes',
    },
    {
      id: '89a386ad-207b-11f1-89b6-a4e078b831cc',
      name: 'VIEW_REPORTS',
      module: 'reports',
      description: 'View branch and company operational reports',
    },
    {
      id: '89a386ae-207b-11f1-89b6-a4e078b831cc',
      name: 'VIEW_GLOBAL_REPORTS',
      module: 'reports',
      description: 'View global cross-company reports',
    },
  ];

  for (const permission of requiredPermissions) {
    const [existingPermission] = await connection.query(
      'SELECT id FROM permissions WHERE name = ? LIMIT 1',
      [permission.name]
    );

    const permissionId = existingPermission.length > 0 ? existingPermission[0].id : permission.id;
    if (existingPermission.length === 0) {
      await connection.query(
        'INSERT INTO permissions (id, name, module, description, created_at) VALUES (?, ?, ?, ?, NOW())',
        [permissionId, permission.name, permission.module, permission.description]
      );
    }

    await connection.query(
      'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
      [roleId, permissionId]
    );
  }
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
    await ensureRolePermissions(connection, roleId);
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