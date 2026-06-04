SET @to_business_at_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'delivery'
    AND COLUMN_NAME = 'to_business_at'
);

SET @to_business_at_sql = IF(
  @to_business_at_exists = 0,
  'ALTER TABLE `delivery` ADD COLUMN `to_business_at` DATETIME NULL',
  'SELECT 1'
);

PREPARE to_business_at_stmt FROM @to_business_at_sql;
EXECUTE to_business_at_stmt;
DEALLOCATE PREPARE to_business_at_stmt;

SET @arrived_business_at_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'delivery'
    AND COLUMN_NAME = 'arrived_business_at'
);

SET @arrived_business_at_sql = IF(
  @arrived_business_at_exists = 0,
  'ALTER TABLE `delivery` ADD COLUMN `arrived_business_at` DATETIME NULL',
  'SELECT 1'
);

PREPARE arrived_business_at_stmt FROM @arrived_business_at_sql;
EXECUTE arrived_business_at_stmt;
DEALLOCATE PREPARE arrived_business_at_stmt;

SET @incident_at_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'delivery'
    AND COLUMN_NAME = 'incident_at'
);

SET @incident_at_sql = IF(
  @incident_at_exists = 0,
  'ALTER TABLE `delivery` ADD COLUMN `incident_at` DATETIME NULL',
  'SELECT 1'
);

PREPARE incident_at_stmt FROM @incident_at_sql;
EXECUTE incident_at_stmt;
DEALLOCATE PREPARE incident_at_stmt;

SET @incident_reason_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'delivery'
    AND COLUMN_NAME = 'incident_reason'
);

SET @incident_reason_sql = IF(
  @incident_reason_exists = 0,
  'ALTER TABLE `delivery` ADD COLUMN `incident_reason` VARCHAR(255) NULL',
  'SELECT 1'
);

PREPARE incident_reason_stmt FROM @incident_reason_sql;
EXECUTE incident_reason_stmt;
DEALLOCATE PREPARE incident_reason_stmt;
