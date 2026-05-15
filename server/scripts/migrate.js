import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_TABLES = [
  'hotel_companies',
  'hotel_branches',
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'audit_logs',
];

const REQUIRED_ROLES = ['super_admin', 'org_admin', 'manager', 'viewer'];
const REQUIRED_PERMISSIONS = ['MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_HOTELS', 'VIEW_AUDIT_LOGS'];
const REQUIRED_ROLE_IDS = [
  '79a386a5-207b-11f1-89b6-a4e078b831cc',
  '79a386a6-207b-11f1-89b6-a4e078b831cc',
  '79a386a7-207b-11f1-89b6-a4e078b831cc',
  '79a386a8-207b-11f1-89b6-a4e078b831cc',
];
const REQUIRED_PERMISSION_IDS = [
  '89a386a1-207b-11f1-89b6-a4e078b831cc',
  '89a386a2-207b-11f1-89b6-a4e078b831cc',
  '89a386a3-207b-11f1-89b6-a4e078b831cc',
  '89a386a4-207b-11f1-89b6-a4e078b831cc',
];

function normalizeRoleName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, '');
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [process.env.DB_NAME, tableName]
  );

  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [process.env.DB_NAME, tableName, columnName]
  );

  return rows.length > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [process.env.DB_NAME, tableName, indexName]
  );

  return rows.length > 0;
}

async function foreignKeyExists(tableName, constraintName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [process.env.DB_NAME, tableName, constraintName]
  );

  return rows.length > 0;
}

async function applyLegacyOrganizationRename() {
  const hasLegacyOrganizations = await tableExists('organizations');
  const hasHotelCompanies = await tableExists('hotel_companies');

  if (hasLegacyOrganizations && !hasHotelCompanies) {
    console.log('🔁 Renaming legacy table organizations -> hotel_companies');
    await pool.query('RENAME TABLE organizations TO hotel_companies');
  }

  const hasUsersTable = await tableExists('users');
  if (hasUsersTable) {
    const hasLegacyOrgId = await columnExists('users', 'organization_id');
    const hasHotelCompanyId = await columnExists('users', 'hotel_company_id');

    if (hasLegacyOrgId && !hasHotelCompanyId) {
      console.log('🔁 Renaming users.organization_id -> users.hotel_company_id');
      await pool.query(
        'ALTER TABLE users CHANGE COLUMN organization_id hotel_company_id CHAR(36) NOT NULL'
      );
    }
  }

  const hasAuditLogsTable = await tableExists('audit_logs');
  if (hasAuditLogsTable) {
    const hasLegacyOrgId = await columnExists('audit_logs', 'organization_id');
    const hasHotelCompanyId = await columnExists('audit_logs', 'hotel_company_id');

    if (hasLegacyOrgId && !hasHotelCompanyId) {
      console.log('🔁 Renaming audit_logs.organization_id -> audit_logs.hotel_company_id');
      await pool.query(
        'ALTER TABLE audit_logs CHANGE COLUMN organization_id hotel_company_id CHAR(36) NULL'
      );
    }
  }
}

async function applyLegacyPermissionRename() {
  const [legacyPermissionRows] = await pool.query(
    'SELECT id, name FROM permissions WHERE name IN (?, ?)',
    ['MANAGE_ORGANIZATIONS', 'MANAGE_HOTEL']
  );

  for (const row of legacyPermissionRows) {
    console.log(`🔁 Renaming legacy permission ${row.name} -> MANAGE_HOTELS`);
    await pool.query(
      'UPDATE permissions SET name = ? WHERE id = ?',
      ['MANAGE_HOTELS', row.id]
    );
  }
}

async function applyHotelCompanyColumnCleanup() {
  const hasHotelCompanies = await tableExists('hotel_companies');
  if (!hasHotelCompanies) {
    return;
  }

  const removableColumns = ['code', 'city', 'state', 'country', 'postal_code', 'address'];
  for (const column of removableColumns) {
    if (await columnExists('hotel_companies', column)) {
      console.log(`🔁 Dropping deprecated hotel_companies.${column}`);
      await pool.query(`ALTER TABLE hotel_companies DROP COLUMN ${column}`);
    }
  }

  if (await indexExists('hotel_companies', 'uq_hotel_companies_code')) {
    console.log('🔁 Dropping deprecated unique index uq_hotel_companies_code');
    await pool.query('ALTER TABLE hotel_companies DROP INDEX uq_hotel_companies_code');
  }

  if (!(await indexExists('hotel_companies', 'uq_hotel_companies_name'))) {
    console.log('🔁 Ensuring unique index uq_hotel_companies_name');
    await pool.query('ALTER TABLE hotel_companies ADD UNIQUE KEY uq_hotel_companies_name (name)');
  }
}

async function applyUsersBranchLink() {
  const hasUsers = await tableExists('users');
  const hasBranches = await tableExists('hotel_branches');

  if (!hasUsers || !hasBranches) {
    return;
  }

  if (!(await columnExists('users', 'branch_id'))) {
    console.log('🔁 Adding users.branch_id');
    await pool.query('ALTER TABLE users ADD COLUMN branch_id CHAR(36) NULL AFTER hotel_company_id');
  }

  if (!(await indexExists('users', 'idx_users_branch_id'))) {
    console.log('🔁 Adding index idx_users_branch_id');
    await pool.query('ALTER TABLE users ADD INDEX idx_users_branch_id (branch_id)');
  }

  if (!(await foreignKeyExists('users', 'fk_users_branch'))) {
    console.log('🔁 Adding foreign key fk_users_branch');
    await pool.query(
      `ALTER TABLE users
       ADD CONSTRAINT fk_users_branch
       FOREIGN KEY (branch_id) REFERENCES hotel_branches(id)
       ON DELETE SET NULL`
    );
  }
}

async function runSanityChecks() {
  const roleIdPlaceholders = REQUIRED_ROLE_IDS.map(() => '?').join(', ');
  const permissionIdPlaceholders = REQUIRED_PERMISSION_IDS.map(() => '?').join(', ');

  const [tableRows] = await pool.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)`,
    [process.env.DB_NAME, REQUIRED_TABLES]
  );

  const existingTables = new Set(tableRows.map((row) => row.TABLE_NAME));
  const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Migration sanity check failed: missing required tables: ${missingTables.join(', ')}`);
  }

  const [roleRows] = await pool.query(
    `SELECT id FROM roles WHERE id IN (${roleIdPlaceholders})`,
    REQUIRED_ROLE_IDS
  );
  const existingRoleIds = new Set(roleRows.map((row) => row.id));
  const missingRoles = REQUIRED_ROLE_IDS.filter((id) => !existingRoleIds.has(id));
  if (missingRoles.length > 0) {
    throw new Error(`Seed sanity check failed: missing required role IDs: ${missingRoles.join(', ')}`);
  }

  const [permissionRows] = await pool.query(
    `SELECT id FROM permissions WHERE id IN (${permissionIdPlaceholders})`,
    REQUIRED_PERMISSION_IDS
  );
  const existingPermissionIds = new Set(permissionRows.map((row) => row.id));
  const missingPermissions = REQUIRED_PERMISSION_IDS.filter((id) => !existingPermissionIds.has(id));
  if (missingPermissions.length > 0) {
    throw new Error(`Seed sanity check failed: missing required permission IDs: ${missingPermissions.join(', ')}`);
  }

  console.log('✅ Migration sanity checks passed (tables, roles, permissions).');
}

async function runMigration() {
  let hadStatementErrors = false;

  try {
    console.log('🔄 Running database migration...');

    await applyLegacyOrganizationRename();
    await applyLegacyPermissionRename();
    await applyHotelCompanyColumnCleanup();
    await applyUsersBranchLink();

    const migrationFiles = [
      '../database/user_management_schema.sql',
      '../database/user_management_seed.sql',
    ];

    for (const migrationFile of migrationFiles) {
      const sqlPath = path.join(__dirname, migrationFile);

      if (!fs.existsSync(sqlPath)) {
        console.warn(`⚠️ Skipping missing migration file: ${migrationFile}`);
        continue;
      }

      console.log(`📄 Running: ${migrationFile}`);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const statements = sql.split(';').filter(stmt => stmt.trim());

      for (const stmt of statements) {
        try {
          const [result] = await pool.query(stmt);
          console.log('✅ Executed:', stmt.substring(0, 50) + '...');

          const statementForTypeCheck = stmt
            .replace(/^(\s*--.*\r?\n)*/g, '')
            .trim()
            .toUpperCase();

          if (statementForTypeCheck.startsWith('SELECT') && Array.isArray(result) && result.length > 0) {
            console.log('ℹ️ Result:', JSON.stringify(result[0]));
          }
        } catch (err) {
          hadStatementErrors = true;
          console.error('❌ Error executing:', stmt.substring(0, 50));
          console.error(err.message);
        }
      }
    }

    if (hadStatementErrors) {
      throw new Error('One or more SQL statements failed during migration execution.');
    }

    await runSanityChecks();
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

runMigration();