SET @orders_has_payment_provider := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'payment_provider'
);
SET @orders_payment_provider_sql := IF(
  @orders_has_payment_provider = 0,
  'ALTER TABLE orders ADD COLUMN payment_provider VARCHAR(80) NULL AFTER payment_method',
  'SELECT 1'
);
PREPARE stmt FROM @orders_payment_provider_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @orders_has_provider_payment_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'provider_payment_id'
);
SET @orders_provider_payment_id_sql := IF(
  @orders_has_provider_payment_id = 0,
  'ALTER TABLE orders ADD COLUMN provider_payment_id VARCHAR(120) NULL AFTER payment_provider',
  'SELECT 1'
);
PREPARE stmt FROM @orders_provider_payment_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @orders_has_payment_status := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'payment_status'
);
SET @orders_payment_status_sql := IF(
  @orders_has_payment_status = 0,
  'ALTER TABLE orders ADD COLUMN payment_status VARCHAR(30) NULL AFTER provider_payment_id',
  'SELECT 1'
);
PREPARE stmt FROM @orders_payment_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @orders_has_amount_paid := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'amount_paid'
);
SET @orders_amount_paid_sql := IF(
  @orders_has_amount_paid = 0,
  'ALTER TABLE orders ADD COLUMN amount_paid DECIMAL(10,2) NULL AFTER total_amount',
  'SELECT 1'
);
PREPARE stmt FROM @orders_amount_paid_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @orders_has_request_fingerprint := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'request_fingerprint'
);
SET @orders_request_fingerprint_sql := IF(
  @orders_has_request_fingerprint = 0,
  'ALTER TABLE orders ADD COLUMN request_fingerprint VARCHAR(191) NULL AFTER customer_notes',
  'SELECT 1'
);
PREPARE stmt FROM @orders_request_fingerprint_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @orders_has_snapshot_json := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'order_snapshot_json'
);
SET @orders_snapshot_json_sql := IF(
  @orders_has_snapshot_json = 0,
  'ALTER TABLE orders ADD COLUMN order_snapshot_json LONGTEXT NULL AFTER request_fingerprint',
  'SELECT 1'
);
PREPARE stmt FROM @orders_snapshot_json_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @orders_has_paid_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'paid_at'
);
SET @orders_paid_at_sql := IF(
  @orders_has_paid_at = 0,
  'ALTER TABLE orders ADD COLUMN paid_at DATETIME(0) NULL AFTER placed_at',
  'SELECT 1'
);
PREPARE stmt FROM @orders_paid_at_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @orders_request_fingerprint_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND index_name = 'idx_orders_request_fingerprint'
);
SET @orders_request_fingerprint_index_sql := IF(
  @orders_request_fingerprint_index_exists = 0,
  'CREATE INDEX idx_orders_request_fingerprint ON orders (request_fingerprint)',
  'SELECT 1'
);
PREPARE stmt FROM @orders_request_fingerprint_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_items_has_product_snapshot_json := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'order_items'
    AND column_name = 'product_snapshot_json'
);
SET @order_items_product_snapshot_json_sql := IF(
  @order_items_has_product_snapshot_json = 0,
  'ALTER TABLE order_items ADD COLUMN product_snapshot_json LONGTEXT NULL AFTER product_name_snapshot',
  'SELECT 1'
);
PREPARE stmt FROM @order_items_product_snapshot_json_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_provider := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'provider'
);
SET @payments_provider_sql := IF(
  @payments_has_provider = 0,
  'ALTER TABLE payments ADD COLUMN provider VARCHAR(80) NULL AFTER provider_name',
  'SELECT 1'
);
PREPARE stmt FROM @payments_provider_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_provider_payment_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'provider_payment_id'
);
SET @payments_provider_payment_id_sql := IF(
  @payments_has_provider_payment_id = 0,
  'ALTER TABLE payments ADD COLUMN provider_payment_id VARCHAR(120) NULL AFTER provider',
  'SELECT 1'
);
PREPARE stmt FROM @payments_provider_payment_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_webhook_event_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'webhook_event_id'
);
SET @payments_webhook_event_id_sql := IF(
  @payments_has_webhook_event_id = 0,
  'ALTER TABLE payments ADD COLUMN webhook_event_id VARCHAR(120) NULL AFTER provider_payment_id',
  'SELECT 1'
);
PREPARE stmt FROM @payments_webhook_event_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_status := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'status'
);
SET @payments_status_sql := IF(
  @payments_has_status = 0,
  'ALTER TABLE payments ADD COLUMN status VARCHAR(30) NULL AFTER webhook_event_id',
  'SELECT 1'
);
PREPARE stmt FROM @payments_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_currency := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'currency'
);
SET @payments_currency_sql := IF(
  @payments_has_currency = 0,
  'ALTER TABLE payments ADD COLUMN currency VARCHAR(10) NULL AFTER amount',
  'SELECT 1'
);
PREPARE stmt FROM @payments_currency_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_raw_event := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'raw_event'
);
SET @payments_raw_event_sql := IF(
  @payments_has_raw_event = 0,
  'ALTER TABLE payments ADD COLUMN raw_event LONGTEXT NULL AFTER currency',
  'SELECT 1'
);
PREPARE stmt FROM @payments_raw_event_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_raw_response := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'raw_response'
);
SET @payments_raw_response_sql := IF(
  @payments_has_raw_response = 0,
  'ALTER TABLE payments ADD COLUMN raw_response LONGTEXT NULL AFTER raw_event',
  'SELECT 1'
);
PREPARE stmt FROM @payments_raw_response_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_signature_validated_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'signature_validated_at'
);
SET @payments_signature_validated_at_sql := IF(
  @payments_has_signature_validated_at = 0,
  'ALTER TABLE payments ADD COLUMN signature_validated_at DATETIME(0) NULL AFTER raw_response',
  'SELECT 1'
);
PREPARE stmt FROM @payments_signature_validated_at_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_has_processed_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'processed_at'
);
SET @payments_processed_at_sql := IF(
  @payments_has_processed_at = 0,
  'ALTER TABLE payments ADD COLUMN processed_at DATETIME(0) NULL AFTER signature_validated_at',
  'SELECT 1'
);
PREPARE stmt FROM @payments_processed_at_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_payment_method_id_nullable := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND column_name = 'payment_method_id'
    AND is_nullable = 'YES'
);
SET @payments_payment_method_id_sql := IF(
  @payments_payment_method_id_nullable = 0,
  'ALTER TABLE payments MODIFY payment_method_id INTEGER NULL',
  'SELECT 1'
);
PREPARE stmt FROM @payments_payment_method_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE payments
SET
  provider = COALESCE(provider, provider_name, 'MANUAL'),
  status = COALESCE(status, payment_status, 'pending'),
  currency = COALESCE(currency, 'MXN')
WHERE
  provider IS NULL
  OR status IS NULL
  OR currency IS NULL;

SET @payments_provider_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND index_name = 'idx_payments_provider'
);
SET @payments_provider_index_sql := IF(
  @payments_provider_index_exists = 0,
  'CREATE INDEX idx_payments_provider ON payments (provider)',
  'SELECT 1'
);
PREPARE stmt FROM @payments_provider_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_provider_payment_id_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND index_name = 'idx_payments_provider_payment_id'
);
SET @payments_provider_payment_id_index_sql := IF(
  @payments_provider_payment_id_index_exists = 0,
  'CREATE INDEX idx_payments_provider_payment_id ON payments (provider_payment_id)',
  'SELECT 1'
);
PREPARE stmt FROM @payments_provider_payment_id_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @payments_webhook_event_id_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'payments'
    AND index_name = 'idx_payments_webhook_event_id'
);
SET @payments_webhook_event_id_index_sql := IF(
  @payments_webhook_event_id_index_exists = 0,
  'CREATE INDEX idx_payments_webhook_event_id ON payments (webhook_event_id)',
  'SELECT 1'
);
PREPARE stmt FROM @payments_webhook_event_id_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
