CREATE TABLE IF NOT EXISTS driver_earnings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  delivery_id INT NOT NULL,
  order_id INT NOT NULL,
  driver_user_id INT NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  driver_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'MXN',
  earning_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_driver_earnings_delivery_id (delivery_id),
  KEY idx_driver_earnings_order_id (order_id),
  KEY idx_driver_earnings_driver_user_id (driver_user_id)
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  changed_by_user_id INT NOT NULL,
  changed_by_role VARCHAR(30) NOT NULL,
  reason TEXT NULL,
  metadata MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_status_history_order_id (order_id),
  INDEX idx_order_status_history_changed_by_user_id (changed_by_user_id)
);
