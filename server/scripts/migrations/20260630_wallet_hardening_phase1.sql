-- Phase 1 wallet hardening foundation
-- Safe to run repeatedly because all objects are created with IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS wallet_idempotency_requests (
  id CHAR(36) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  request_payload JSON DEFAULT NULL,
  response_code INT DEFAULT NULL,
  response_body JSON DEFAULT NULL,
  status ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_idempotency_endpoint_key (endpoint, idempotency_key),
  KEY idx_wallet_idempotency_created_at (created_at),
  KEY idx_wallet_idempotency_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_reconciliation_runs (
  id CHAR(36) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME DEFAULT NULL,
  status ENUM('RUNNING','PASS','FAIL') NOT NULL DEFAULT 'RUNNING',
  checked_wallets INT NOT NULL DEFAULT 0,
  mismatch_count INT NOT NULL DEFAULT 0,
  total_cached_balance DECIMAL(14,2) DEFAULT NULL,
  total_ledger_balance DECIMAL(14,2) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_reconciliation_runs_started (started_at),
  KEY idx_wallet_reconciliation_runs_status (status),
  CONSTRAINT fk_wallet_reconciliation_runs_user
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_reconciliation_items (
  id CHAR(36) NOT NULL,
  run_id CHAR(36) NOT NULL,
  wallet_id CHAR(36) NOT NULL,
  cached_balance DECIMAL(14,2) NOT NULL,
  ledger_balance DECIMAL(14,2) NOT NULL,
  delta DECIMAL(14,2) NOT NULL,
  severity ENUM('INFO','WARN','CRITICAL') NOT NULL DEFAULT 'WARN',
  details JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_reconciliation_items_run (run_id),
  KEY idx_wallet_reconciliation_items_wallet (wallet_id),
  KEY idx_wallet_reconciliation_items_created_at (created_at),
  CONSTRAINT fk_wallet_reconciliation_items_run
    FOREIGN KEY (run_id) REFERENCES wallet_reconciliation_runs(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_wallet_reconciliation_items_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
