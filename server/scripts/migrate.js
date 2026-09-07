import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKIPPED_SCRIPT_MIGRATIONS = new Set([
  // Legacy seed uses non-canonical role/permission IDs and names.
  '003_seed_roles_permissions.sql',
]);

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
  'game_templates',
  'game_template_prizes',
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

async function checkConstraintExists(tableName, constraintName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ?
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'CHECK'
     LIMIT 1`,
    [process.env.DB_NAME, tableName, constraintName]
  );

  return rows.length > 0;
}

async function getColumnType(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE AS columnType
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [process.env.DB_NAME, tableName, columnName]
  );

  return rows[0]?.columnType || null;
}

async function applyRealtimeOutboxTable() {
  if (await tableExists('realtime_event_outbox')) {
    const statusType = String(await getColumnType('realtime_event_outbox', 'status') || '').toLowerCase();
    if (statusType && !statusType.includes('dead_letter')) {
      console.log('🔁 Extending realtime_event_outbox.status enum with DEAD_LETTER');
      await pool.query(
        `ALTER TABLE realtime_event_outbox
         MODIFY COLUMN status ENUM('PENDING','PROCESSING','PUBLISHED','FAILED','DEAD_LETTER')
         NOT NULL DEFAULT 'PENDING'`
      );
    }
    return;
  }

  console.log('🔁 Creating realtime_event_outbox table');
  await pool.query(
    `CREATE TABLE IF NOT EXISTS realtime_event_outbox (
      id CHAR(36) NOT NULL,
      event_group ENUM('session','board','draw','winner') NOT NULL DEFAULT 'session',
      event_name VARCHAR(120) NOT NULL,
      session_id CHAR(36) DEFAULT NULL,
      company_id CHAR(36) DEFAULT NULL,
      payload JSON NOT NULL,
      status ENUM('PENDING','PROCESSING','PUBLISHED','FAILED','DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
      attempts INT NOT NULL DEFAULT 0,
      available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME DEFAULT NULL,
      last_error VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_realtime_event_outbox_status_available (status, available_at),
      KEY idx_realtime_event_outbox_created_at (created_at),
      KEY idx_realtime_event_outbox_session_id (session_id),
      KEY idx_realtime_event_outbox_company_id (company_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function applyStrictBusinessCheckConstraints() {
  const constraints = [
    {
      table: 'wallet_topups',
      name: 'chk_wallet_topups_amount_positive',
      expression: '(amount > 0)',
    },
    {
      table: 'wallet_transactions',
      name: 'chk_wallet_transactions_amount_positive',
      expression: '(amount > 0)',
    },
    {
      table: 'game_charges',
      name: 'chk_game_charges_amount_non_negative',
      expression: '(charge_amount >= 0)',
    },
    {
      table: 'game_sales',
      name: 'chk_game_sales_sold_price_positive',
      expression: '(sold_price > 0)',
    },
    {
      table: 'game_prizes',
      name: 'chk_game_prizes_beer_quantity_positive',
      expression: '(beer_quantity > 0)',
    },
    {
      table: 'draws',
      name: 'chk_draws_beer_quantity_positive',
      expression: '(beer_quantity > 0)',
    },
  ];

  for (const constraint of constraints) {
    if (!(await tableExists(constraint.table))) {
      continue;
    }

    if (await checkConstraintExists(constraint.table, constraint.name)) {
      continue;
    }

    console.log(`🔁 Adding check constraint ${constraint.name}`);
    await pool.query(
      `ALTER TABLE ${constraint.table}
       ADD CONSTRAINT ${constraint.name}
       CHECK ${constraint.expression}`
    );
  }
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
    'SELECT id, name FROM permissions WHERE name = ?',
    ['MANAGE_ORGANIZATIONS']
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

async function applyGamesTemplateLink() {
  const hasGames = await tableExists('games');
  const hasTemplates = await tableExists('game_templates');
  if (!hasGames || !hasTemplates) {
    return;
  }

  if (!(await columnExists('games', 'template_id'))) {
    console.log('🔁 Adding games.template_id');
    await pool.query('ALTER TABLE games ADD COLUMN template_id CHAR(36) NULL AFTER id');
  }

  if (!(await indexExists('games', 'idx_games_template_id'))) {
    console.log('🔁 Adding index idx_games_template_id');
    await pool.query('ALTER TABLE games ADD INDEX idx_games_template_id (template_id)');
  }

  if (!(await foreignKeyExists('games', 'fk_games_template'))) {
    console.log('🔁 Adding foreign key fk_games_template');
    await pool.query(
      `ALTER TABLE games
       ADD CONSTRAINT fk_games_template
       FOREIGN KEY (template_id) REFERENCES game_templates(id)
       ON DELETE SET NULL`
    );
  }
}

async function applyGameTemplateDefaultFlag() {
  const hasTemplates = await tableExists('game_templates');
  if (!hasTemplates) {
    return;
  }

  if (!(await columnExists('game_templates', 'is_default'))) {
    console.log('🔁 Adding game_templates.is_default');
    await pool.query('ALTER TABLE game_templates ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 AFTER generation_mode');
  }

  if (!(await indexExists('game_templates', 'idx_game_templates_company_default'))) {
    console.log('🔁 Adding index idx_game_templates_company_default');
    await pool.query('ALTER TABLE game_templates ADD INDEX idx_game_templates_company_default (company_id, is_default)');
  }

  // Backfill: ensure every company has at least one default template.
  console.log('🔁 Backfilling default game templates per company');
  await pool.query(
    `UPDATE game_templates gt
     JOIN (
       SELECT company_id, MIN(created_at) AS created_at
       FROM game_templates
       GROUP BY company_id
     ) firsts ON firsts.company_id = gt.company_id AND firsts.created_at = gt.created_at
     LEFT JOIN (
       SELECT DISTINCT company_id
       FROM game_templates
       WHERE is_default = 1
     ) existing_defaults ON existing_defaults.company_id = gt.company_id
     SET gt.is_default = 1
     WHERE existing_defaults.company_id IS NULL`
  );
}

async function applyWalletAccountBackfill() {
  const hasHotelCompanies = await tableExists('hotel_companies');
  const hasWalletAccounts = await tableExists('wallet_accounts');

  if (!hasHotelCompanies || !hasWalletAccounts) {
    return;
  }

  console.log('🔁 Backfilling wallet_accounts for any company without a wallet');
  await pool.query(
    `INSERT INTO wallet_accounts (id, company_id, balance, currency, is_active, created_at, updated_at)
     SELECT UUID(), hc.id, 0.00, 'ETB', 1, NOW(), NOW()
     FROM hotel_companies hc
     LEFT JOIN wallet_accounts wa ON wa.company_id = hc.id
     WHERE wa.id IS NULL`
  );
}

async function applyWalletTransactionHardening() {
  const hasWalletTransactions = await tableExists('wallet_transactions');
  if (!hasWalletTransactions) {
    return;
  }

  if (!(await columnExists('wallet_transactions', 'direction'))) {
    console.log('🔁 Adding wallet_transactions.direction');
    await pool.query(
      `ALTER TABLE wallet_transactions
       ADD COLUMN direction ENUM('DEBIT','CREDIT') NOT NULL DEFAULT 'DEBIT' AFTER transaction_type`
    );
  }

  if (!(await columnExists('wallet_transactions', 'status'))) {
    console.log('🔁 Adding wallet_transactions.status');
    await pool.query(
      `ALTER TABLE wallet_transactions
       ADD COLUMN status ENUM('POSTED','PENDING','FAILED','REVERSED') NOT NULL DEFAULT 'POSTED' AFTER description`
    );
  }

  if (!(await columnExists('wallet_transactions', 'idempotency_key'))) {
    console.log('🔁 Adding wallet_transactions.idempotency_key');
    await pool.query(
      `ALTER TABLE wallet_transactions
       ADD COLUMN idempotency_key VARCHAR(128) DEFAULT NULL AFTER reference_id`
    );
  }

  if (!(await columnExists('wallet_transactions', 'correlation_id'))) {
    console.log('🔁 Adding wallet_transactions.correlation_id');
    await pool.query(
      `ALTER TABLE wallet_transactions
       ADD COLUMN correlation_id VARCHAR(128) DEFAULT NULL AFTER idempotency_key`
    );
  }

  if (!(await indexExists('wallet_transactions', 'idx_wallet_transactions_reference'))) {
    console.log('🔁 Adding index idx_wallet_transactions_reference');
    await pool.query(
      `ALTER TABLE wallet_transactions
       ADD INDEX idx_wallet_transactions_reference (reference_type, reference_id)`
    );
  }

  if (!(await indexExists('wallet_transactions', 'idx_wallet_transactions_idempotency_key'))) {
    console.log('🔁 Adding index idx_wallet_transactions_idempotency_key');
    await pool.query(
      `ALTER TABLE wallet_transactions
       ADD INDEX idx_wallet_transactions_idempotency_key (idempotency_key)`
    );
  }

  console.log('🔁 Backfilling wallet_transactions.direction from transaction_type');
  await pool.query(
    `UPDATE wallet_transactions
     SET direction = CASE
       WHEN transaction_type IN ('TOPUP', 'REFUND', 'BONUS', 'REVERSAL') THEN 'CREDIT'
       ELSE 'DEBIT'
     END
     WHERE direction IS NULL OR direction = ''`
  );
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

async function applyScriptMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) return;

  let hadErrors = false;
  for (const file of files) {
    if (SKIPPED_SCRIPT_MIGRATIONS.has(file)) {
      console.log(`⏭️ Skipping deprecated migration file: ${file}`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, file);
    console.log(`📄 Running migration file: ${file}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = sql.split(';').filter((stmt) => stmt.trim());
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (err) {
        hadErrors = true;
        console.error(`❌ Error executing ${file}:`, err.message);
      }
    }
  }

  if (hadErrors) {
    throw new Error('One or more statements failed in scripts/migrations');
  }
}

async function runMigration() {
  let hadStatementErrors = false;

  try {
    console.log('🔄 Running database migration...');

    await applyLegacyOrganizationRename();
    await applyLegacyPermissionRename();
    await applyHotelCompanyColumnCleanup();
    await applyUsersBranchLink();
    await applyGamesTemplateLink();
    await applyGameTemplateDefaultFlag();
    await applyRealtimeOutboxTable();
    await applyWalletTransactionHardening();
    await applyStrictBusinessCheckConstraints();

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

    // Apply any additional scripts in scripts/migrations (e.g. incremental fixes)
    await applyScriptMigrations();

    if (hadStatementErrors) {
      throw new Error('One or more SQL statements failed during migration execution.');
    }

    await runSanityChecks();
    await applyWalletAccountBackfill();
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
}

runMigration();