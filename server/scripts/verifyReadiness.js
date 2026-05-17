import pool from '../config/database.js';

const REQUIRED_TABLES = [
  'hotel_companies',
  'hotel_branches',
  'users',
  'user_sessions',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'audit_logs',
  'wallet_accounts',
  'wallet_transactions',
  'wallet_topups',
  'games',
  'game_prizes',
  'game_charges',
  'cards',
  'card_numbers',
  'game_sales',
  'draws',
  'winners',
];

const REQUIRED_ROLES = ['super_admin', 'org_admin', 'manager', 'viewer'];
const REQUIRED_PERMISSIONS = [
  'MANAGE_USERS',
  'MANAGE_ROLES',
  'MANAGE_HOTELS',
  'VIEW_AUDIT_LOGS',
  'VIEW_WALLET',
  'TOPUP_WALLET',
  'MANAGE_GAMES',
  'VIEW_GAMES',
  'SELL_CARDS',
  'RUN_DRAWS',
  'VIEW_WINNERS',
  'CLAIM_PRIZES',
  'VIEW_REPORTS',
  'VIEW_GLOBAL_REPORTS',
];
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
  '89a386a5-207b-11f1-89b6-a4e078b831cc',
  '89a386a6-207b-11f1-89b6-a4e078b831cc',
  '89a386a7-207b-11f1-89b6-a4e078b831cc',
  '89a386a8-207b-11f1-89b6-a4e078b831cc',
  '89a386a9-207b-11f1-89b6-a4e078b831cc',
  '89a386aa-207b-11f1-89b6-a4e078b831cc',
  '89a386ab-207b-11f1-89b6-a4e078b831cc',
  '89a386ac-207b-11f1-89b6-a4e078b831cc',
  '89a386ad-207b-11f1-89b6-a4e078b831cc',
  '89a386ae-207b-11f1-89b6-a4e078b831cc',
];

function normalizeRoleName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, '');
}

async function verifyReadiness() {
  const startedAt = Date.now();

  const roleIdPlaceholders = REQUIRED_ROLE_IDS.map(() => '?').join(', ');
  const permissionIdPlaceholders = REQUIRED_PERMISSION_IDS.map(() => '?').join(', ');

  const [tableRows] = await pool.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)`,
    [process.env.DB_NAME, REQUIRED_TABLES]
  );

  const existingTables = new Set(tableRows.map((row) => row.TABLE_NAME));
  const missingTables = REQUIRED_TABLES.filter((name) => !existingTables.has(name));

  const [roleRows] = await pool.query(
    `SELECT id FROM roles WHERE id IN (${roleIdPlaceholders})`,
    REQUIRED_ROLE_IDS
  );
  const existingRoles = new Set(roleRows.map((row) => row.id));
  const missingRoles = REQUIRED_ROLE_IDS.filter((id) => !existingRoles.has(id));

  const [permissionRows] = await pool.query(
    `SELECT id FROM permissions WHERE id IN (${permissionIdPlaceholders})`,
    REQUIRED_PERMISSION_IDS
  );
  const existingPermissions = new Set(permissionRows.map((row) => row.id));
  const missingPermissions = REQUIRED_PERMISSION_IDS.filter((id) => !existingPermissions.has(id));

  const [[orgCount]] = await pool.query('SELECT COUNT(*) AS count FROM hotel_companies');
  const [[branchCount]] = await pool.query('SELECT COUNT(*) AS count FROM hotel_branches');
  const [[userCount]] = await pool.query('SELECT COUNT(*) AS count FROM users');
  const [[roleCount]] = await pool.query('SELECT COUNT(*) AS count FROM roles');
  const [[permissionCount]] = await pool.query('SELECT COUNT(*) AS count FROM permissions');
  const [[walletCount]] = await pool.query('SELECT COUNT(*) AS count FROM wallet_accounts');
  const [[gameCount]] = await pool.query('SELECT COUNT(*) AS count FROM games');

  const report = {
    status: missingTables.length || missingRoles.length || missingPermissions.length ? 'failed' : 'ok',
    database: process.env.DB_NAME,
    durationMs: Date.now() - startedAt,
    checks: {
      tables: { required: REQUIRED_TABLES.length, present: existingTables.size, missing: missingTables },
      roles: { required: REQUIRED_ROLE_IDS.length, present: existingRoles.size, missing: missingRoles },
      permissions: {
        required: REQUIRED_PERMISSION_IDS.length,
        present: existingPermissions.size,
        missing: missingPermissions,
      },
    },
    counts: {
      hotel_companies: orgCount.count,
      hotel_branches: branchCount.count,
      users: userCount.count,
      roles: roleCount.count,
      permissions: permissionCount.count,
      wallet_accounts: walletCount.count,
      games: gameCount.count,
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
