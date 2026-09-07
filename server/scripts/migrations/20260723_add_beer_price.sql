-- Add branch beer price history and per-game beer price override
CREATE TABLE IF NOT EXISTS branch_beer_prices (
  id VARCHAR(36) PRIMARY KEY,
  branch_id VARCHAR(36) NOT NULL,
  price INT NOT NULL,
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to DATETIME NULL,
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_branch_effective (branch_id, effective_from)
);

-- Add per-game override for beer price (ETB per beer)
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'games'
    AND COLUMN_NAME = 'beer_price'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE games ADD COLUMN beer_price INT NULL DEFAULT 90',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
