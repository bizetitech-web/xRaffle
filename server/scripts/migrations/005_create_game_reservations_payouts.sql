-- Migration 005: Reservations, Tickets, Payouts, Audit and State transitions for games

CREATE TABLE IF NOT EXISTS ticket_reservations (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  wallet_transaction_id CHAR(36), -- reference to a hold/authorization
  status ENUM('RESERVED','CAPTURED','REVERSED','EXPIRED') NOT NULL DEFAULT 'RESERVED',
  reserved_by CHAR(36), -- user who reserved (operator) or customer id
  reserved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ticket_reservations_game_card (game_id,card_id),
  KEY idx_ticket_reservations_game_id (game_id),
  KEY idx_ticket_reservations_status (status),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  FOREIGN KEY (reserved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS digital_tickets (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  ticket_code VARCHAR(128) NOT NULL,
  issued_to VARCHAR(255), -- customer name or identifier
  issued_phone VARCHAR(50),
  wallet_transaction_id CHAR(36), -- settlement tx when purchase finalized
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('ACTIVE','REVOKED','REFUNDED') NOT NULL DEFAULT 'ACTIVE',
  UNIQUE KEY uq_digital_tickets_code (ticket_code),
  UNIQUE KEY uq_digital_tickets_game_card (game_id,card_id),
  KEY idx_digital_tickets_game_id (game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payout_batches (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  batch_status ENUM('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  attempted_count INT NOT NULL DEFAULT 0,
  created_by CHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME DEFAULT NULL,
  KEY idx_payout_batches_game_id (game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payout_transactions (
  id CHAR(36) PRIMARY KEY,
  payout_batch_id CHAR(36) NOT NULL,
  winner_id CHAR(36) NOT NULL, -- winners.id
  wallet_transaction_id CHAR(36), -- wallet_transactions entry for payout
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('PENDING','SENT','CONFIRMED','FAILED','REVERSED') NOT NULL DEFAULT 'PENDING',
  attempted_at TIMESTAMP DEFAULT NULL,
  result_text TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payout_transactions_batch (payout_batch_id),
  FOREIGN KEY (payout_batch_id) REFERENCES payout_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (winner_id) REFERENCES winners(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS prize_locks (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  draw_id CHAR(36) DEFAULT NULL,
  locked_amount DECIMAL(12,2) NOT NULL,
  locked_by CHAR(36),
  locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at DATETIME DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  KEY idx_prize_locks_game (game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (draw_id) REFERENCES draws(id) ON DELETE SET NULL,
  FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS game_state_transitions (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  from_state VARCHAR(50) NOT NULL,
  to_state VARCHAR(50) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_game_state_transitions_game (game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS game_audit_logs (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) DEFAULT NULL,
  actor CHAR(36) DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  details JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_game_audit_game (game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (actor) REFERENCES users(id) ON DELETE SET NULL
);
