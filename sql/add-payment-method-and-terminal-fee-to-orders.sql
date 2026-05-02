ALTER TABLE orders
ADD COLUMN IF NOT EXISTS terminal_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00
AFTER subtotal,
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NULL
AFTER payment_method_id,
ADD COLUMN IF NOT EXISTS comprobante_pago_url MEDIUMTEXT NULL
AFTER payment_method;

CREATE TABLE IF NOT EXISTS admin_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  file_url MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_messages_order_id (order_id),
  INDEX idx_admin_messages_user_id (user_id)
);
