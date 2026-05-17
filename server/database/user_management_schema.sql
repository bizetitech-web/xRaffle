CREATE TABLE IF NOT EXISTS hotel_companies (
  id CHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  status ENUM('active','inactive','suspended') DEFAULT 'active',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hotel_companies_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hotel_branches (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  branch_code VARCHAR(50) NOT NULL,
  city VARCHAR(100) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hotel_branches_branch_code (branch_code),
  KEY idx_hotel_branches_company_id (company_id),
  CONSTRAINT fk_hotel_branches_company
    FOREIGN KEY (company_id) REFERENCES hotel_companies(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  level INT DEFAULT 9,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id CHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  module VARCHAR(100) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  hotel_company_id CHAR(36) NOT NULL,
  branch_id CHAR(36) DEFAULT NULL,
  first_name VARCHAR(100) DEFAULT NULL,
  last_name VARCHAR(100) DEFAULT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  last_login TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_org_email (hotel_company_id, email),
  KEY idx_users_email (email),
  KEY idx_users_branch_id (branch_id),
  CONSTRAINT fk_users_organization
    FOREIGN KEY (hotel_company_id) REFERENCES hotel_companies(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_users_branch
    FOREIGN KEY (branch_id) REFERENCES hotel_branches(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  assigned_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by CHAR(36) DEFAULT NULL,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  KEY idx_user_roles_assigned_by (assigned_by),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id CHAR(36) NOT NULL,
  permission_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id),
  CONSTRAINT fk_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) NOT NULL,
  hotel_company_id CHAR(36) DEFAULT NULL,
  user_id CHAR(36) DEFAULT NULL,
  action VARCHAR(150) DEFAULT NULL,
  table_name VARCHAR(100) DEFAULT NULL,
  entity_type VARCHAR(100) DEFAULT NULL,
  record_id CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_org (hotel_company_id),
  KEY idx_audit_logs_user (user_id),
  KEY idx_audit_logs_action (action),
  KEY idx_audit_logs_created_at (created_at),
  CONSTRAINT fk_audit_logs_org
    FOREIGN KEY (hotel_company_id) REFERENCES hotel_companies(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  refresh_token TEXT NOT NULL,
  ip_address VARCHAR(100) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_sessions_user_id (user_id),
  KEY idx_user_sessions_expires_at (expires_at),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_accounts_company_id (company_id),
  CONSTRAINT fk_wallet_accounts_company
    FOREIGN KEY (company_id) REFERENCES hotel_companies(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id CHAR(36) NOT NULL,
  wallet_id CHAR(36) NOT NULL,
  transaction_type ENUM('TOPUP','GAME_FEE','REFUND','ADJUSTMENT','BONUS','REVERSAL') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id CHAR(36) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_transactions_wallet_id (wallet_id),
  KEY idx_wallet_transactions_created_at (created_at),
  CONSTRAINT fk_wallet_transactions_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_wallet_transactions_user
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_topups (
  id CHAR(36) NOT NULL,
  wallet_id CHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('CASH','TELEBIRR','CBEBIRR','BANK','OTHER') NOT NULL,
  reference_number VARCHAR(100) DEFAULT NULL,
  approved_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_topups_wallet_id (wallet_id),
  KEY idx_wallet_topups_created_at (created_at),
  CONSTRAINT fk_wallet_topups_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_wallet_topups_user
    FOREIGN KEY (approved_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_templates (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) NOT NULL,
  branch_id CHAR(36) DEFAULT NULL,
  template_code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  card_price DECIMAL(10,2) NOT NULL,
  total_cards INT NOT NULL,
  total_numbers_pool INT NOT NULL,
  numbers_per_card INT NOT NULL,
  total_prize_beers INT NOT NULL,
  seconds_per_call INT NOT NULL,
  generation_mode ENUM('SEQUENTIAL','RANDOM') NOT NULL DEFAULT 'RANDOM',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) DEFAULT NULL,
  updated_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_templates_template_code (template_code),
  KEY idx_game_templates_company_branch_active (company_id, branch_id, is_active),
  CONSTRAINT fk_game_templates_company
    FOREIGN KEY (company_id) REFERENCES hotel_companies(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_templates_branch
    FOREIGN KEY (branch_id) REFERENCES hotel_branches(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_game_templates_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_game_templates_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_template_prizes (
  id CHAR(36) NOT NULL,
  template_id CHAR(36) NOT NULL,
  draw_position INT NOT NULL,
  beer_quantity INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_template_prizes_position (template_id, draw_position),
  KEY idx_game_template_prizes_template_id (template_id),
  CONSTRAINT fk_game_template_prizes_template
    FOREIGN KEY (template_id) REFERENCES game_templates(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS games (
  id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  game_code VARCHAR(50) NOT NULL,
  title VARCHAR(255) DEFAULT NULL,
  card_price DECIMAL(10,2) NOT NULL,
  total_cards INT NOT NULL,
  numbers_per_card INT NOT NULL DEFAULT 4,
  total_prize_beers INT NOT NULL,
  total_numbers_pool INT NOT NULL DEFAULT 100,
  status ENUM('PENDING','ACTIVE','DRAWING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  started_at DATETIME DEFAULT NULL,
  ended_at DATETIME DEFAULT NULL,
  created_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_games_game_code (game_code),
  KEY idx_games_branch_id (branch_id),
  KEY idx_games_status (status),
  CONSTRAINT fk_games_branch
    FOREIGN KEY (branch_id) REFERENCES hotel_branches(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_games_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_prizes (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  draw_position INT NOT NULL,
  beer_quantity INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_prizes_game_draw_position (game_id, draw_position),
  KEY idx_game_prizes_game_id (game_id),
  CONSTRAINT fk_game_prizes_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_charges (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  wallet_transaction_id CHAR(36) DEFAULT NULL,
  charge_amount DECIMAL(12,2) NOT NULL,
  charge_percentage DECIMAL(5,2) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_charges_game_id (game_id),
  KEY idx_game_charges_wallet_tx (wallet_transaction_id),
  CONSTRAINT fk_game_charges_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_charges_wallet_txn
    FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cards (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  card_number INT NOT NULL,
  status ENUM('AVAILABLE','SOLD','WINNER','CLAIMED','VOID') NOT NULL DEFAULT 'AVAILABLE',
  sold_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cards_game_card_number (game_id, card_number),
  KEY idx_cards_game_id (game_id),
  KEY idx_cards_status (status),
  CONSTRAINT fk_cards_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS card_numbers (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  number_position INT NOT NULL,
  number_value INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_card_numbers_card_position (card_id, number_position),
  KEY idx_card_numbers_game_id (game_id),
  KEY idx_card_numbers_number_value (number_value),
  CONSTRAINT fk_card_numbers_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_card_numbers_card
    FOREIGN KEY (card_id) REFERENCES cards(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_sales (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  sold_by CHAR(36) DEFAULT NULL,
  sold_price DECIMAL(10,2) NOT NULL,
  payment_method ENUM('CASH','TELEBIRR','CBEBIRR','BANK','OTHER') NOT NULL DEFAULT 'CASH',
  customer_name VARCHAR(150) DEFAULT NULL,
  customer_phone VARCHAR(50) DEFAULT NULL,
  note TEXT DEFAULT NULL,
  sold_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_sales_game_card (game_id, card_id),
  KEY idx_game_sales_game_id (game_id),
  KEY idx_game_sales_sold_at (sold_at),
  KEY idx_game_sales_sold_by (sold_by),
  CONSTRAINT fk_game_sales_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_sales_card
    FOREIGN KEY (card_id) REFERENCES cards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_sales_sold_by
    FOREIGN KEY (sold_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS draws (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  draw_position INT NOT NULL,
  winning_number INT NOT NULL,
  beer_quantity INT NOT NULL,
  created_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_draws_game_position (game_id, draw_position),
  UNIQUE KEY uq_draws_game_number (game_id, winning_number),
  KEY idx_draws_game_id (game_id),
  CONSTRAINT fk_draws_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_draws_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS winners (
  id CHAR(36) NOT NULL,
  game_id CHAR(36) NOT NULL,
  draw_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  beer_quantity INT NOT NULL,
  is_claimed TINYINT(1) NOT NULL DEFAULT 0,
  claimed_at DATETIME DEFAULT NULL,
  claimed_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_winners_game_card (game_id, card_id),
  KEY idx_winners_game_id (game_id),
  KEY idx_winners_draw_id (draw_id),
  KEY idx_winners_claimed (is_claimed),
  CONSTRAINT fk_winners_game
    FOREIGN KEY (game_id) REFERENCES games(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_winners_draw
    FOREIGN KEY (draw_id) REFERENCES draws(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_winners_card
    FOREIGN KEY (card_id) REFERENCES cards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_winners_claimed_by
    FOREIGN KEY (claimed_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
