import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../config/database.js';

async function seed() {
  // Hotel company details
  const hotelName = 'X-Raffle Hotel';
  const hotelEmail = 'info@xrafflehotel.com';
  const hotelPhone = '0977307747';

  // Super admin details
  const adminName = 'Super Admin';
  const adminEmail = 'xraffle_admin@bizex.dev';
  const adminPassword = '_Biz.4321';
  const adminPhone = '0977307747';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Create or update hotel company
    let [rows] = await connection.query(
      'SELECT id FROM hotel_companies WHERE name = ? LIMIT 1',
      [hotelName]
    );
    let hotelCompanyId;
    if (rows.length > 0) {
      hotelCompanyId = rows[0].id;
      await connection.query(
        `UPDATE hotel_companies SET name = ?, email = ?, phone = ?, is_active = 1, updated_at = NOW() WHERE id = ?`,
        [hotelName, hotelEmail, hotelPhone, hotelCompanyId]
      );
      console.log('Hotel company updated:', hotelCompanyId);
    } else {
      hotelCompanyId = crypto.randomUUID();
      await connection.query(
        `INSERT INTO hotel_companies (id, name, email, phone, is_active, created_at) VALUES (?, ?, ?, ?, 1, NOW())`,
        [hotelCompanyId, hotelName, hotelEmail, hotelPhone]
      );
      console.log('Hotel company created:', hotelCompanyId);
    }

    // 2. Ensure super_admin role exists
    let [roleRows] = await connection.query(
      `SELECT id FROM roles WHERE LOWER(REPLACE(REPLACE(REPLACE(name, '_', ''), '-', ''), ' ', '')) = ? LIMIT 1`,
      ['superadmin']
    );
    let superAdminRoleId;
    if (roleRows.length > 0) {
      superAdminRoleId = roleRows[0].id;
    } else {
      superAdminRoleId = crypto.randomUUID();
      await connection.query(
        'INSERT INTO roles (id, name, level) VALUES (?, ?, 1)',
        [superAdminRoleId, 'super_admin']
      );
    }

    // 3. Create or update super admin user
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    let [userRows] = await connection.query(
      'SELECT id FROM users WHERE hotel_company_id = ? AND email = ? LIMIT 1',
      [hotelCompanyId, adminEmail]
    );
    let userId;
    if (userRows.length > 0) {
      userId = userRows[0].id;
      await connection.query(
        `UPDATE users SET name = ?, password_hash = ?, phone = ?, is_active = 1 WHERE id = ?`,
        [adminName, passwordHash, adminPhone, userId]
      );
      console.log('Super admin user updated:', userId);
    } else {
      userId = crypto.randomUUID();
      await connection.query(
        `INSERT INTO users (id, hotel_company_id, name, email, password_hash, phone, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
        [userId, hotelCompanyId, adminName, adminEmail, passwordHash, adminPhone]
      );
      console.log('Super admin user created:', userId);
    }

    // 4. Assign super_admin role to user
    await connection.query(
      'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, superAdminRoleId]
    );

    // 5. Ensure canonical permissions exist and are assigned to super_admin.
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
      const [permRows] = await connection.query(
        'SELECT id FROM permissions WHERE name = ? LIMIT 1',
        [permission.name]
      );

      const permissionId = permRows.length > 0 ? permRows[0].id : permission.id;
      if (permRows.length === 0) {
        await connection.query(
          `INSERT INTO permissions (id, name, module, description, created_at) VALUES (?, ?, ?, ?, NOW())`,
          [permissionId, permission.name, permission.module, permission.description]
        );
        console.log('Permission created:', permission.name);
      }

      await connection.query(
        'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [superAdminRoleId, permissionId]
      );
    }

    await connection.commit();
    console.log('Seeding completed successfully!');
    console.log(`Hotel: ${hotelName} (${hotelCompanyId})`);
    console.log(`Super Admin: ${adminEmail} (${userId})`);
  } catch (err) {
    await connection.rollback();
    console.error('Seeding failed:', err.message);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('seedAll.js')) {
  seed();
}
