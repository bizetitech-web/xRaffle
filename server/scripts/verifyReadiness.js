import pool from '../config/database.js';

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

async function verifyReadiness() {
  const startedAt = Date.now();

  const rolePlaceholders = REQUIRED_ROLES.map(() => '?').join(', ');
  const permissionPlaceholders = REQUIRED_PERMISSIONS.map(() => '?').join(', ');

  const [tableRows] = await pool.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)`,
    [process.env.DB_NAME, REQUIRED_TABLES]
  );

  const existingTables = new Set(tableRows.map((row) => row.TABLE_NAME));
  const missingTables = REQUIRED_TABLES.filter((name) => !existingTables.has(name));

  const [roleRows] = await pool.query(
    `SELECT name FROM roles WHERE name IN (${rolePlaceholders})`,
    REQUIRED_ROLES
  );
  const existingRoles = new Set(roleRows.map((row) => normalizeRoleName(row.name)));
  const missingRoles = REQUIRED_ROLES.filter((name) => !existingRoles.has(normalizeRoleName(name)));

  const [permissionRows] = await pool.query(
    `SELECT name FROM permissions WHERE name IN (${permissionPlaceholders})`,
    REQUIRED_PERMISSIONS
  );
  const existingPermissions = new Set(permissionRows.map((row) => row.name));
  const missingPermissions = REQUIRED_PERMISSIONS.filter((name) => !existingPermissions.has(name));

  const [[orgCount]] = await pool.query('SELECT COUNT(*) AS count FROM organizations');
  const [[userCount]] = await pool.query('SELECT COUNT(*) AS count FROM users');
  const [[roleCount]] = await pool.query('SELECT COUNT(*) AS count FROM roles');
  const [[permissionCount]] = await pool.query('SELECT COUNT(*) AS count FROM permissions');

  const report = {
    status: missingTables.length || missingRoles.length || missingPermissions.length ? 'failed' : 'ok',
    database: process.env.DB_NAME,
    durationMs: Date.now() - startedAt,
    checks: {
      tables: { required: REQUIRED_TABLES.length, present: existingTables.size, missing: missingTables },
      roles: { required: REQUIRED_ROLES.length, present: existingRoles.size, missing: missingRoles },
      permissions: {
        required: REQUIRED_PERMISSIONS.length,
        present: existingPermissions.size,
        missing: missingPermissions,
      },
    },
    counts: {
      organizations: orgCount.count,
      users: userCount.count,
      roles: roleCount.count,
      permissions: permissionCount.count,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.status !== 'ok') {
    process.exitCode = 1;
  }
}

verifyReadiness()
  .catch((error) => {
    console.error('Database readiness verification failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
