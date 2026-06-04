SET @driver_status_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'driver_status'
);

SET @driver_status_sql = IF(
  @driver_status_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `driver_status` VARCHAR(20) NULL DEFAULT ''ACTIVE''',
  'SELECT 1'
);

PREPARE driver_status_stmt FROM @driver_status_sql;
EXECUTE driver_status_stmt;
DEALLOCATE PREPARE driver_status_stmt;

SET @driver_status_reason_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'driver_status_reason'
);

SET @driver_status_reason_sql = IF(
  @driver_status_reason_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `driver_status_reason` TEXT NULL',
  'SELECT 1'
);

PREPARE driver_status_reason_stmt FROM @driver_status_reason_sql;
EXECUTE driver_status_reason_stmt;
DEALLOCATE PREPARE driver_status_reason_stmt;
