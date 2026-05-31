SET @business_hours_has_is_24_hours := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'business_hours'
    AND COLUMN_NAME = 'is_24_hours'
);

SET @business_hours_is_24_hours_sql := IF(
  @business_hours_has_is_24_hours = 0,
  'ALTER TABLE `business_hours` ADD COLUMN `is_24_hours` BOOLEAN NOT NULL DEFAULT false AFTER `is_closed`',
  'SELECT 1'
);

PREPARE business_hours_is_24_hours_stmt FROM @business_hours_is_24_hours_sql;
EXECUTE business_hours_is_24_hours_stmt;
DEALLOCATE PREPARE business_hours_is_24_hours_stmt;
