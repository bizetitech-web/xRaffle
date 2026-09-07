-- Migration 006: Persist generated template cards and numbers

CREATE TABLE IF NOT EXISTS game_template_cards (
  id CHAR(36) NOT NULL,
  template_id CHAR(36) NOT NULL,
  card_number INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_template_cards_number (template_id, card_number),
  KEY idx_game_template_cards_template_id (template_id),
  CONSTRAINT fk_game_template_cards_template
    FOREIGN KEY (template_id) REFERENCES game_templates(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_template_card_numbers (
  id CHAR(36) NOT NULL,
  template_id CHAR(36) NOT NULL,
  template_card_id CHAR(36) NOT NULL,
  number_position INT NOT NULL,
  number_value INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_template_card_numbers_position (template_card_id, number_position),
  KEY idx_game_template_card_numbers_template_id (template_id),
  KEY idx_game_template_card_numbers_value (number_value),
  CONSTRAINT fk_game_template_card_numbers_template
    FOREIGN KEY (template_id) REFERENCES game_templates(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_game_template_card_numbers_card
    FOREIGN KEY (template_card_id) REFERENCES game_template_cards(id)
    ON DELETE CASCADE
);