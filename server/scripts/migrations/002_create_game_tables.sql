-- Migration 002: Create game-related tables for xRaffle

CREATE TABLE IF NOT EXISTS games (
  id CHAR(36) PRIMARY KEY,
  branch_id CHAR(36) NOT NULL,
  game_code VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  card_price DECIMAL(10,2) NOT NULL,
  total_cards INT NOT NULL,
  numbers_per_card INT NOT NULL DEFAULT 4,
  total_prize_beers INT NOT NULL,
  total_numbers_pool INT NOT NULL DEFAULT 100,
  status ENUM('PENDING','ACTIVE','DRAWING','ENDED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  started_at DATETIME,
  ended_at DATETIME,
  created_by CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_games_game_code (game_code),
  KEY idx_games_branch_id (branch_id),
  KEY idx_games_status (status),
  FOREIGN KEY (branch_id) REFERENCES hotel_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS game_prizes (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  draw_position INT NOT NULL,
  beer_quantity INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_game_prizes_game_draw_position (game_id,draw_position),
  KEY idx_game_prizes_game_id (game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cards (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  card_number INT NOT NULL,
  status ENUM('AVAILABLE','SOLD','WINNER','CLAIMED','VOID') NOT NULL DEFAULT 'AVAILABLE',
  sold_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cards_game_card_number (game_id,card_number),
  KEY idx_cards_game_id (game_id),
  KEY idx_cards_status (status),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_numbers (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  number_position INT NOT NULL,
  number_value INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_card_numbers_card_position (card_id,number_position),
  KEY idx_card_numbers_game_id (game_id),
  KEY idx_card_numbers_number_value (number_value),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_sales (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  sold_by CHAR(36),
  sold_price DECIMAL(10,2) NOT NULL,
  payment_method ENUM('CASH','TELEBIRR','CBEBIRR','BANK','OTHER') NOT NULL DEFAULT 'CASH',
  customer_name VARCHAR(150),
  customer_phone VARCHAR(50),
  note TEXT,
  sold_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_game_sales_game_card (game_id,card_id),
  KEY idx_game_sales_game_id (game_id),
  KEY idx_game_sales_sold_at (sold_at),
  KEY idx_game_sales_sold_by (sold_by),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS draws (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  draw_position INT NOT NULL,
  winning_number INT NOT NULL,
  beer_quantity INT NOT NULL,
  created_by CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_draws_game_position (game_id,draw_position),
  UNIQUE KEY uq_draws_game_number (game_id,winning_number),
  KEY idx_draws_game_id (game_id),
  KEY fk_draws_created_by (created_by),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS winners (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  draw_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  beer_quantity INT NOT NULL,
  is_claimed TINYINT(1) NOT NULL DEFAULT 0,
  claimed_at DATETIME,
  claimed_by CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_winners_game_card (game_id,card_id),
  KEY idx_winners_game_id (game_id),
  KEY idx_winners_draw_id (draw_id),
  KEY idx_winners_claimed (is_claimed),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (draw_id) REFERENCES draws(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS game_charges (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  wallet_transaction_id CHAR(36),
  charge_amount DECIMAL(12,2) NOT NULL,
  charge_percentage DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_game_charges_game_id (game_id),
  KEY idx_game_charges_wallet_tx (wallet_transaction_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL
);
