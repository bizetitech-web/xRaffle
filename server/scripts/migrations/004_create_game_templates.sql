-- Migration 004: Create game_templates and game_template_prizes

CREATE TABLE IF NOT EXISTS game_templates (
  id CHAR(36) NOT NULL,
  company_id CHAR(36) DEFAULT NULL,
  branch_id CHAR(36) DEFAULT NULL,
  template_code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  card_price DECIMAL(10,2) NOT NULL,
  total_cards INT NOT NULL,
  total_numbers_pool INT NOT NULL,
  numbers_per_card INT NOT NULL DEFAULT 4,
  total_prize_beers INT NOT NULL,
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
  CONSTRAINT fk_game_templates_company FOREIGN KEY (company_id) REFERENCES hotel_companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_game_templates_branch FOREIGN KEY (branch_id) REFERENCES hotel_branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_game_templates_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_game_templates_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
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
  CONSTRAINT fk_game_template_prizes_template FOREIGN KEY (template_id) REFERENCES game_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
