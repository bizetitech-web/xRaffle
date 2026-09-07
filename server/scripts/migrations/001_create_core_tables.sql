-- Migration 001: Create core tables for xRaffle

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  refresh_token TEXT NOT NULL,
  ip_address VARCHAR(100),
  user_agent TEXT,
  expires_at DATETIME NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wallet_accounts_company_id (company_id),
  FOREIGN KEY (company_id) REFERENCES hotel_companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id CHAR(36) PRIMARY KEY,
  wallet_id CHAR(36) NOT NULL,
  transaction_type ENUM('TOPUP','GAME_FEE','REFUND','ADJUSTMENT','BONUS','REVERSAL') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id CHAR(36),
  description TEXT,
  created_by CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS wallet_topups (
  id CHAR(36) PRIMARY KEY,
  wallet_id CHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('CASH','TELEBIRR','CBEBIRR','BANK','OTHER') NOT NULL,
  reference_number VARCHAR(100),
  approved_by CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Add more tables in next migration files
