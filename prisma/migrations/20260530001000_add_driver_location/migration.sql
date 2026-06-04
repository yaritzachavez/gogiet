SET @last_latitude_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_latitude'
);

SET @last_latitude_sql = IF(
  @last_latitude_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `last_latitude` DECIMAL(10,7) NULL',
  'SELECT 1'
);

PREPARE last_latitude_stmt FROM @last_latitude_sql;
EXECUTE last_latitude_stmt;
DEALLOCATE PREPARE last_latitude_stmt;

SET @last_longitude_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_longitude'
);

SET @last_longitude_sql = IF(
  @last_longitude_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `last_longitude` DECIMAL(10,7) NULL',
  'SELECT 1'
);

PREPARE last_longitude_stmt FROM @last_longitude_sql;
EXECUTE last_longitude_stmt;
DEALLOCATE PREPARE last_longitude_stmt;

SET @last_location_at_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_location_at'
);

SET @last_location_at_sql = IF(
  @last_location_at_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `last_location_at` DATETIME NULL',
  'SELECT 1'
);

PREPARE last_location_at_stmt FROM @last_location_at_sql;
EXECUTE last_location_at_stmt;
DEALLOCATE PREPARE last_location_at_stmt;
