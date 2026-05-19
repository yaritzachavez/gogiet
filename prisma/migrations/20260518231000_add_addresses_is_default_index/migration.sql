SET @addresses_is_default_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'addresses'
    AND index_name = 'idx_addresses_is_default'
);

SET @addresses_is_default_index_sql := IF(
  @addresses_is_default_index_exists = 0,
  'CREATE INDEX idx_addresses_is_default ON addresses (is_default)',
  'SELECT 1'
);

PREPARE stmt FROM @addresses_is_default_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
