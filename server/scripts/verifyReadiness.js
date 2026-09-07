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
  'realtime_event_outbox',
  'wallet_accounts',
  'wallet_transactions',
  'wallet_topups',
  'wallet_idempotency_requests',
  'wallet_reconciliation_runs',
  'wallet_reconciliation_items',
  'games',
  'game_prizes',
  'game_charges',
  'cards',
  'card_numbers',
  'game_sales',
  'draws',
  'winners',
];

const REQUIRED_ROLES = ['super_admin', 'org_admin', 'operator'];
const REQUIRED_PERMISSIONS = [
  'MANAGE_USERS',
  'MANAGE_ROLES',
  'MANAGE_HOTELS',
  'MANAGE_HOTEL',
  'MANAGE_FEE_TEMPLATES',
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
  'VIEW_DAILY_REPORTS',
  'VIEW_GLOBAL_REPORTS',
];
const REQUIRED_ROLE_IDS = [
  '79a386a5-207b-11f1-89b6-a4e078b831cc',
  '79a386a6-207b-11f1-89b6-a4e078b831cc',
  '79a386a7-207b-11f1-89b6-a4e078b831cc',
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
  '89a386af-207b-11f1-89b6-a4e078b831cc',
  '89a386b0-207b-11f1-89b6-a4e078b831cc',
  '89a386b1-207b-11f1-89b6-a4e078b831cc',
];

const REQUIRED_CHECK_CONSTRAINTS = [
  { table: 'wallet_topups', name: 'chk_wallet_topups_amount_positive' },
  { table: 'wallet_transactions', name: 'chk_wallet_transactions_amount_positive' },
  { table: 'game_charges', name: 'chk_game_charges_amount_non_negative' },
  { table: 'game_sales', name: 'chk_game_sales_sold_price_positive' },
  { table: 'game_prizes', name: 'chk_game_prizes_beer_quantity_positive' },
  { table: 'draws', name: 'chk_draws_beer_quantity_positive' },
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

  const [checkRows] = await pool.query(
    `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS constraintName
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ?
       AND CONSTRAINT_TYPE = 'CHECK'`,
    [process.env.DB_NAME]
  );
  const existingChecks = new Set(checkRows.map((row) => `${row.tableName}:${row.constraintName}`));
  const missingChecks = REQUIRED_CHECK_CONSTRAINTS.filter(
    (item) => !existingChecks.has(`${item.table}:${item.name}`)
  );

  const [[orgCount]] = await pool.query('SELECT COUNT(*) AS count FROM hotel_companies');
  const [[branchCount]] = await pool.query('SELECT COUNT(*) AS count FROM hotel_branches');
  const [[userCount]] = await pool.query('SELECT COUNT(*) AS count FROM users');
  const [[roleCount]] = await pool.query('SELECT COUNT(*) AS count FROM roles');
  const [[permissionCount]] = await pool.query('SELECT COUNT(*) AS count FROM permissions');
  const [[walletCount]] = await pool.query('SELECT COUNT(*) AS count FROM wallet_accounts');
  const [[gameCount]] = await pool.query('SELECT COUNT(*) AS count FROM games');

  const report = {
    status: missingTables.length || missingRoles.length || missingPermissions.length || missingChecks.length ? 'failed' : 'ok',
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
      checkConstraints: {
        required: REQUIRED_CHECK_CONSTRAINTS.length,
        present: REQUIRED_CHECK_CONSTRAINTS.length - missingChecks.length,
        missing: missingChecks,
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
