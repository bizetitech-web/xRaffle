// --- Wallet Transactions ---
export async function getWalletTransactionsService(companyId, page = 1, pageSize = 10) {
  // Get wallet id for company
  const [walletRows] = await pool.query('SELECT id FROM wallet_accounts WHERE company_id = ?', [companyId]);
  if (walletRows.length === 0) throw new Error('Wallet not found');
  const walletId = walletRows[0].id;
  // Get total count
  const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM wallet_transactions WHERE wallet_id = ?', [walletId]);
  // Get paginated transactions
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    'SELECT * FROM wallet_transactions WHERE wallet_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [walletId, pageSize, offset]
  );
  return {
    items: rows,
    page,
    pageSize,
    total: count
  };
}
// Onboarding service layer for DB operations
import pool from '../../config/database.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// --- Company ---
export async function createCompanyService(data) {
  const { name, address } = data;
  // Prevent duplicate company names
  const [existing] = await pool.query('SELECT id FROM hotel_companies WHERE name = ?', [name]);
  if (existing.length > 0) {
    throw new Error('Company name already exists');
  }
  const id = crypto.randomUUID();
  // Insert company with name (address may not exist in older schemas)
  await pool.query(
    'INSERT INTO hotel_companies (id, name) VALUES (?, ?)',
    [id, name]
  );
  // Create wallet account for new company (explicit id)
  const walletId = crypto.randomUUID();
  await pool.query('INSERT INTO wallet_accounts (id, company_id, balance) VALUES (?, ?, 0)', [walletId, id]);
  return { id, name, address };
}

export async function listCompaniesService() {
  const [rows] = await pool.query('SELECT * FROM hotel_companies');
  return rows;
}

export async function updateCompanyService(id, data) {
  const { name, address, status } = data;
  // Optionally update status
  if (status) {
    await pool.query('UPDATE hotel_companies SET status = ? WHERE id = ?', [status, id]);
  }
  if (name || address) {
    await pool.query(
      'UPDATE hotel_companies SET name = COALESCE(?, name), address = COALESCE(?, address) WHERE id = ?',
      [name, address, id]
    );
  }
  return { id, name, address, status };
}

// Prevent company deletion if branches or users exist
export async function deleteCompanyService(id) {
  const [[{ count: branchCount }]] = await pool.query('SELECT COUNT(*) as count FROM hotel_branches WHERE company_id = ?', [id]);
  const [[{ count: userCount }]] = await pool.query('SELECT COUNT(*) as count FROM users WHERE company_id = ?', [id]);
  if (branchCount > 0 || userCount > 0) {
    throw new Error('Cannot delete company with branches or users');
  }
  await pool.query('DELETE FROM hotel_companies WHERE id = ?', [id]);
  return { id, deleted: true };
}

// --- Wallet ---
export async function getWalletService(companyId) {
  const [rows] = await pool.query('SELECT * FROM wallet_accounts WHERE company_id = ?', [companyId]);
  if (rows.length === 0) {
    // Auto-create wallet if missing (helps fix legacy data where wallet wasn't created)
    const walletId = crypto.randomUUID();
    await pool.query('INSERT INTO wallet_accounts (id, company_id, balance, created_at, updated_at) VALUES (?, ?, 0, NOW(), NOW())', [walletId, companyId]);
    const [[newRow]] = await pool.query('SELECT * FROM wallet_accounts WHERE id = ?', [walletId]);
    return newRow || null;
  }
  return rows[0] || null;
}

export async function topupWalletService(companyId, amount, paymentMethod = null, referenceNumber = null, createdBy = null) {
  // Perform topup atomically: update balance, insert transaction and topup record
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[walletRow]] = await conn.query('SELECT id, balance FROM wallet_accounts WHERE company_id = ? FOR UPDATE', [companyId]);
    if (!walletRow) {
      throw new Error('Wallet not found');
    }
    const walletId = walletRow.id;
    const balanceBefore = Number(walletRow.balance || 0);
    const balanceAfter = balanceBefore + Number(amount);

    await conn.query('UPDATE wallet_accounts SET balance = ? WHERE id = ?', [balanceAfter, walletId]);

    // Insert wallet transaction record
    const txnId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO wallet_transactions (id, wallet_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by, created_at)
       VALUES (?, ?, 'TOPUP', ?, ?, ?, 'WALLET_TOPUP', ?, ?, NULL, NOW())`,
      [txnId, walletId, amount, balanceBefore, balanceAfter, referenceNumber || null, referenceNumber || null]
    );

    // Insert topup record
    const topupId = crypto.randomUUID();
    await conn.query(
      `INSERT INTO wallet_topups (id, wallet_id, amount, payment_method, reference_number, approved_by, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NOW())`,
      [topupId, walletId, amount, paymentMethod || 'CASH', referenceNumber || null]
    );

    // Insert audit log for topup
    try {
      await conn.query(
        `INSERT INTO audit_logs (id, hotel_company_id, user_id, action, table_name, record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [crypto.randomUUID(), companyId, createdBy || null, 'TOPUP_WALLET', 'wallet_topups', topupId]
      );
    } catch (auditErr) {
      // non-fatal for topup success, but log for diagnosis
      console.error('Failed to write topup audit log', auditErr.message || auditErr);
    }

    await conn.commit();
    return { companyId, amount, walletId, transactionId: txnId, topupId, balanceBefore, balanceAfter };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// --- Branch ---
export async function createBranchService(data) {
  const { company_id, name, address, branch_code, city, phone, status } = data;
  // Enforce unique branch_code globally
  let code = branch_code;
  // If no branch_code provided, generate one and ensure uniqueness
  if (!code) {
    const base = (name || 'BR').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0,6) || 'BR';
    let tries = 0;
    while (!code && tries < 5) {
      const suffix = Math.floor(Math.random() * 9000) + 1000;
      const candidate = `${base}${suffix}`;
      const [existing] = await pool.query('SELECT id FROM hotel_branches WHERE branch_code = ? LIMIT 1', [candidate]);
      if (existing.length === 0) code = candidate;
      tries += 1;
    }
    if (!code) throw new Error('Failed to generate unique branch_code');
  } else {
    const [existing] = await pool.query('SELECT id FROM hotel_branches WHERE branch_code = ? LIMIT 1', [code]);
    if (existing.length > 0) {
      throw new Error('Branch code already exists');
    }
  }
  const id = crypto ? crypto.randomUUID() : require('crypto').randomUUID();
  const [result] = await pool.query(
    'INSERT INTO hotel_branches (id, company_id, name, branch_code, city, address, phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    [id, company_id, name, code, city || null, address || null, phone || null, status || 'ACTIVE']
  );
  return { id, company_id, name, branch_code, city, address, phone, status };
}

// Prevent branch deletion if users exist
export async function safeDeleteBranchService(id) {
  const [[{ count: userCount }]] = await pool.query('SELECT COUNT(*) as count FROM users WHERE branch_id = ?', [id]);
  if (userCount > 0) {
    throw new Error('Cannot delete branch with users');
  }
  await pool.query('DELETE FROM hotel_branches WHERE id = ?', [id]);
  return { id, deleted: true };
}

export async function listBranchesService(company_id) {
  let rows;
  if (!company_id) {
    [rows] = await pool.query('SELECT * FROM hotel_branches');
  } else {
    [rows] = await pool.query('SELECT * FROM hotel_branches WHERE company_id = ?', [company_id]);
  }
  return rows;
}

export async function updateBranchService(id, data) {
  const { name, address, branch_code, city, phone, status } = data;
  await pool.query(
    `UPDATE hotel_branches
     SET name = COALESCE(?, name),
         branch_code = COALESCE(?, branch_code),
         city = COALESCE(?, city),
         address = COALESCE(?, address),
         phone = COALESCE(?, phone),
         status = COALESCE(?, status),
         updated_at = NOW()
     WHERE id = ?`,
    [name, branch_code, city, address, phone, status, id]
  );
  return { id, name, address, branch_code, city, phone, status };
}

export async function deleteBranchService(id) {
  await pool.query('DELETE FROM hotel_branches WHERE id = ?', [id]);
  return { id };
}

// --- User ---
export async function createUserService(data) {
  // Accept multiple naming conventions from frontend/backend
  const companyId = data.company_id || data.hotelCompanyId || data.hotel_company_id;
  const branchId = data.branch_id || data.branchId || null;
  const roleId = data.role_id || data.roleId || null;
  const password = data.password;
  const email = data.email || data.username;
  const firstName = data.firstName || data.first_name || '';
  const lastName = data.lastName || data.last_name || '';

  if (!companyId) throw new Error('company_id is required');
  if (!email) throw new Error('email/username is required');
  if (!password) throw new Error('password is required');

  // Prevent duplicate email in company
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ? AND hotel_company_id = ?', [email, companyId]);
  if (existing.length > 0) {
    throw new Error('Email already exists in this company');
  }

  // Hash password
  const hashed = bcrypt.hashSync(password, 10);

  const id = crypto.randomUUID();
  const name = `${firstName} ${lastName}`.trim() || email;

  await pool.query(
    `INSERT INTO users (id, hotel_company_id, branch_id, first_name, last_name, name, email, password_hash, phone, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, companyId, branchId, firstName || null, lastName || null, name, email, hashed, data.phone || null, data.isActive ? 1 : 1]
  );

  // Assign role if provided
  if (roleId) {
    await pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleId]);
  }

  return { id, hotel_company_id: companyId, branch_id: branchId, email, first_name: firstName, last_name: lastName };
}

export async function listUsersService(company_id) {
  // Return users with joined metadata: company name, branch name, role name, permission count
  const params = [];
  let where = '';
  if (company_id) {
    where = 'WHERE u.hotel_company_id = ?';
    params.push(company_id);
  }

  const sql = `
    SELECT
      u.*, 
      hc.name AS hotel_company_name,
      hb.name AS branch_name,
      r.name AS role_name,
      COUNT(DISTINCT rp.permission_id) AS permission_count
    FROM users u
    LEFT JOIN hotel_companies hc ON u.hotel_company_id = hc.id
    LEFT JOIN hotel_branches hb ON u.branch_id = hb.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
    ${where}
    GROUP BY u.id, hc.name, hb.name, r.name
    ORDER BY u.created_at DESC
  `;

  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function updateUserService(id, data) {
  const firstName = data.firstName || data.first_name;
  const lastName = data.lastName || data.last_name;
  const phone = data.phone || null;
  const branchId = data.branchId || data.branch_id || null;
  const isActive = typeof data.isActive !== 'undefined' ? (data.isActive ? 1 : 0) : undefined;
  const roleId = data.roleId || data.role_id || null;

  const updates = [];
  const params = [];

  if (typeof firstName !== 'undefined') {
    updates.push('first_name = ?');
    params.push(firstName || null);
  }
  if (typeof lastName !== 'undefined') {
    updates.push('last_name = ?');
    params.push(lastName || null);
  }
  // compute display name if any name parts provided
  if (typeof firstName !== 'undefined' || typeof lastName !== 'undefined') {
    const name = `${firstName || ''} ${lastName || ''}`.trim() || null;
    updates.push('name = COALESCE(?, name)');
    params.push(name);
  }
  if (typeof phone !== 'undefined') {
    updates.push('phone = ?');
    params.push(phone);
  }
  if (typeof branchId !== 'undefined') {
    updates.push('branch_id = ?');
    params.push(branchId || null);
  }
  if (typeof isActive !== 'undefined') {
    updates.push('is_active = ?');
    params.push(isActive);
  }

  if (updates.length > 0) {
    params.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
  }

  // Update role assignment if provided
  if (roleId) {
    await pool.query('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleId]);
  }

  return { id, first_name: firstName, last_name: lastName, branch_id: branchId, phone, role_id: roleId };
}

export async function updateUserStatusService(id, status) {
  await pool.query(
    'UPDATE users SET status = ? WHERE id = ?',
    [status, id]
  );
  return { id, status };
}
