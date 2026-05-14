import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_TABLES = [
  'organizations',
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'audit_logs',
];

const REQUIRED_ROLES = ['super_admin', 'org_admin', 'manager', 'viewer'];
const REQUIRED_PERMISSIONS = ['MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_ORGANIZATIONS', 'VIEW_AUDIT_LOGS'];

function normalizeRoleName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, '');
}

async function runSanityChecks() {
  const rolePlaceholders = REQUIRED_ROLES.map(() => '?').join(', ');
  const permissionPlaceholders = REQUIRED_PERMISSIONS.map(() => '?').join(', ');

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
    `SELECT name FROM roles WHERE name IN (${rolePlaceholders})`,
    REQUIRED_ROLES
  );
  const existingRoles = new Set(roleRows.map((row) => normalizeRoleName(row.name)));
  const missingRoles = REQUIRED_ROLES.filter((role) => !existingRoles.has(normalizeRoleName(role)));
  if (missingRoles.length > 0) {
    throw new Error(`Seed sanity check failed: missing required roles: ${missingRoles.join(', ')}`);
  }

  const [permissionRows] = await pool.query(
    `SELECT name FROM permissions WHERE name IN (${permissionPlaceholders})`,
    REQUIRED_PERMISSIONS
  );
  const existingPermissions = new Set(permissionRows.map((row) => row.name));
  const missingPermissions = REQUIRED_PERMISSIONS.filter((permission) => !existingPermissions.has(permission));
  if (missingPermissions.length > 0) {
    throw new Error(`Seed sanity check failed: missing required permissions: ${missingPermissions.join(', ')}`);
  }

  console.log('✅ Migration sanity checks passed (tables, roles, permissions).');
}

async function runMigration() {
  let hadStatementErrors = false;

  try {
    console.log('🔄 Running database migration...');

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