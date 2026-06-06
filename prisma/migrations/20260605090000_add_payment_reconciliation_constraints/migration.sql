SET @payments_has_transaction_reference_unique := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND index_name = 'uk_payments_transaction_reference'
);
SET @payments_transaction_reference_unique_sql := IF(
  @payments_has_transaction_reference_unique = 0,
  'CREATE UNIQUE INDEX uk_payments_transaction_reference ON payments (transaction_reference)',
  'SELECT 1'
);
PREPARE stmt FROM @payments_transaction_reference_unique_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_provider_payment_unique := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND index_name = 'uk_payments_provider_provider_payment_id'
);
SET @payments_provider_payment_unique_sql := IF(
  @payments_has_provider_payment_unique = 0,
  'CREATE UNIQUE INDEX uk_payments_provider_provider_payment_id ON payments (provider, provider_payment_id)',
  'SELECT 1'
);
PREPARE stmt FROM @payments_provider_payment_unique_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_provider_webhook_unique := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND index_name = 'uk_payments_provider_webhook_event_id'
);
SET @payments_provider_webhook_unique_sql := IF(
  @payments_has_provider_webhook_unique = 0,
  'CREATE UNIQUE INDEX uk_payments_provider_webhook_event_id ON payments (provider, webhook_event_id)',
  'SELECT 1'
);
PREPARE stmt FROM @payments_provider_webhook_unique_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_order_provider_created_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND index_name = 'idx_payments_order_provider_created_at'
);
SET @payments_order_provider_created_index_sql := IF(
  @payments_has_order_provider_created_index = 0,
  'CREATE INDEX idx_payments_order_provider_created_at ON payments (order_id, provider, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @payments_order_provider_created_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
