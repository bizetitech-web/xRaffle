-- Ensure games.beer_price has a DB-level default of 90 ETB
-- Keep nullable so clearing per-game override can remain NULL.

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'games'
    AND COLUMN_NAME = 'beer_price'
);

SET @ddl := IF(
  @col_exists = 1,
  'ALTER TABLE games MODIFY COLUMN beer_price INT NULL DEFAULT 90',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
