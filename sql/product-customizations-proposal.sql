CREATE TABLE IF NOT EXISTS product_customization_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  min_selections INT NOT NULL DEFAULT 0,
  max_selections INT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_customization_groups_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_customization_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  extra_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  sort_order INT NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_customization_options_group
    FOREIGN KEY (group_id) REFERENCES product_customization_groups(id)
    ON DELETE CASCADE
);

ALTER TABLE products_cart
  MODIFY COLUMN notes TEXT NULL;

ALTER TABLE products_cart
  ADD COLUMN IF NOT EXISTS selected_options JSON NULL AFTER notes,
  ADD COLUMN IF NOT EXISTS base_unit_price DECIMAL(10, 2) NULL AFTER selected_options,
  ADD COLUMN IF NOT EXISTS extras_total DECIMAL(10, 2) NULL AFTER base_unit_price,
  ADD COLUMN IF NOT EXISTS total_price DECIMAL(10, 2) NULL AFTER extras_total;
