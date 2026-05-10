-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `first_name` VARCHAR(80) NOT NULL,
    `last_name` VARCHAR(80) NULL,
    `email` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `email_verified` BOOLEAN NULL DEFAULT false,
    `verification_code` VARCHAR(12) NULL,
    `verification_expires_at` DATETIME(0) NULL,
    `verification_sent_at` DATETIME(0) NULL,
    `reset_password_token` VARCHAR(255) NULL,
    `reset_password_expires_at` DATETIME(0) NULL,
    `reset_password_sent_at` DATETIME(0) NULL,
    `login_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(0) NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `birth_date` DATE NULL,
    `profile_image_url` TEXT NULL,
    `delivery_zone` VARCHAR(120) NULL,
    `vehicle_type` VARCHAR(50) NULL,
    `vehicle_plate` VARCHAR(30) NULL,
    `status` VARCHAR(30) NULL,
    `delivery_notes` VARCHAR(255) NULL,
    `is_available` BOOLEAN NULL,
    `status_id` INTEGER NOT NULL,
    `last_login` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_users_email`(`email`),
    UNIQUE INDEX `uk_users_phone`(`phone`),
    INDEX `fk_users_status`(`status_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `label` VARCHAR(50) NULL,
    `recipient_name` VARCHAR(120) NULL,
    `phone` VARCHAR(20) NULL,
    `street` VARCHAR(120) NOT NULL,
    `external_number` VARCHAR(20) NULL,
    `internal_number` VARCHAR(20) NULL,
    `neighborhood` VARCHAR(120) NOT NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `postal_code` VARCHAR(10) NOT NULL,
    `reference_notes` VARCHAR(255) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status_id` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_addresses_status`(`status_id`),
    INDEX `fk_addresses_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `legal_name` VARCHAR(150) NULL,
    `tax_id` VARCHAR(30) NULL,
    `city` VARCHAR(100) NOT NULL,
    `district` VARCHAR(100) NULL,
    `address` VARCHAR(180) NOT NULL,
    `address_notes` VARCHAR(255) NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(120) NULL,
    `logo_url` VARCHAR(255) NULL,
    `cover_image_url` VARCHAR(255) NULL,
    `min_order_amount` DECIMAL(10, 2) NULL,
    `estimated_delivery_minutes` INTEGER NULL,
    `rating_average` DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
    `is_open` BOOLEAN NOT NULL DEFAULT true,
    `status_id` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_business_status`(`status_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(150) NULL,
    `icon` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_business_categories_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_category_map` (
    `business_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_business_category_map_category`(`category_id`),
    PRIMARY KEY (`business_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_details` (
    `business_id` INTEGER NOT NULL,
    `description_long` TEXT NULL,
    `slogan` VARCHAR(180) NULL,
    `specialties` VARCHAR(255) NULL,
    `service_notes` VARCHAR(255) NULL,
    `accepts_pickup` BOOLEAN NOT NULL DEFAULT true,
    `accepts_delivery` BOOLEAN NOT NULL DEFAULT true,
    `has_own_delivery` BOOLEAN NOT NULL DEFAULT false,
    `pet_friendly` BOOLEAN NOT NULL DEFAULT false,
    `instagram_url` VARCHAR(255) NULL,
    `facebook_url` VARCHAR(255) NULL,
    `whatsapp_phone` VARCHAR(20) NULL,
    `website_url` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`business_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_hours` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `day_of_week` TINYINT NOT NULL,
    `open_time` TIME(0) NULL,
    `close_time` TIME(0) NULL,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_business_hours_day`(`business_id`, `day_of_week`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `image_url` VARCHAR(255) NOT NULL,
    `alt_text` VARCHAR(150) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 1,
    `is_cover` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_business_images_business`(`business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_managers` (
    `business_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `position` VARCHAR(100) NULL,
    `assigned_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `fk_business_managers_user`(`user_id`),
    PRIMARY KEY (`business_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_owners` (
    `business_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `notes` VARCHAR(255) NULL,

    INDEX `fk_business_owners_user`(`user_id`),
    PRIMARY KEY (`business_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cart` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'activo',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_cart_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `driver_user_id` INTEGER NOT NULL,
    `vehicle_type_id` INTEGER NULL,
    `delivery_status_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(0) NULL,
    `picked_up_at` DATETIME(0) NULL,
    `in_route_at` DATETIME(0) NULL,
    `delivered_at` DATETIME(0) NULL,
    `failed_at` DATETIME(0) NULL,
    `estimated_distance_km` DECIMAL(8, 2) NULL,
    `estimated_duration_min` INTEGER NULL,
    `delivery_notes` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_delivery_order_id`(`order_id`),
    INDEX `fk_delivery_driver`(`driver_user_id`),
    INDEX `fk_delivery_status`(`delivery_status_id`),
    INDEX `fk_delivery_vehicle_type`(`vehicle_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_metrics` (
    `delivery_id` INTEGER NOT NULL,
    `actual_distance_km` DECIMAL(8, 2) NULL,
    `actual_duration_min` INTEGER NULL,
    `wait_time_business_min` INTEGER NULL,
    `wait_time_customer_min` INTEGER NULL,
    `delay_minutes` INTEGER NULL,
    `was_on_time` BOOLEAN NOT NULL DEFAULT true,
    `internal_score` DECIMAL(5, 2) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`delivery_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `delivery_id` INTEGER NOT NULL,
    `driver_user_id` INTEGER NOT NULL,
    `base_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `bonus_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `adjustment_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `payment_status` VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    `paid_at` DATETIME(0) NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_delivery_payments_delivery`(`delivery_id`),
    INDEX `fk_delivery_payments_driver`(`driver_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_earnings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `delivery_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `driver_user_id` INTEGER NOT NULL,
    `delivery_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `driver_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `platform_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'MXN',
    `earning_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_driver_earnings_delivery_id`(`delivery_id`),
    INDEX `idx_driver_earnings_order_id`(`order_id`),
    INDEX `idx_driver_earnings_driver_user_id`(`driver_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driver_user_id` INTEGER NOT NULL,
    `period_start` DATETIME(0) NOT NULL,
    `period_end` DATETIME(0) NOT NULL,
    `total_deliveries` INTEGER NOT NULL DEFAULT 0,
    `gross_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `adjustments_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `settlement_status` VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    `settled_at` DATETIME(0) NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_delivery_settlements_driver`(`driver_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_status_catalog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(150) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 1,
    `is_final` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_delivery_status_catalog_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_tips` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `delivery_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `driver_user_id` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `tip_method` VARCHAR(30) NOT NULL DEFAULT 'digital',
    `delivered_to_driver` BOOLEAN NOT NULL DEFAULT false,
    `delivered_at` DATETIME(0) NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_delivery_tips_delivery`(`delivery_id`),
    INDEX `fk_delivery_tips_driver`(`driver_user_id`),
    INDEX `fk_delivery_tips_order`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `favorite_type` VARCHAR(30) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_favorites_unique`(`user_id`, `favorite_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `product_name_snapshot` VARCHAR(120) NOT NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_order_items_order`(`order_id`),
    INDEX `fk_order_items_product`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `note_type` VARCHAR(50) NOT NULL,
    `note_text` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_order_notes_order`(`order_id`),
    INDEX `fk_order_notes_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_status_catalog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(150) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 1,
    `is_final` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_order_status_catalog_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `cart_id` INTEGER NULL,
    `business_id` INTEGER NOT NULL,
    `driver_id` INTEGER NULL,
    `address_id` INTEGER NOT NULL,
    `payment_method_id` INTEGER NOT NULL,
    `payment_method` VARCHAR(50) NULL,
    `payment_receipt_url` MEDIUMTEXT NULL,
    `comprobante_pago_url` MEDIUMTEXT NULL,
    `order_status_id` INTEGER NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `terminal_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `delivery_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `service_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `platform_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `driver_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tip_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `customer_notes` VARCHAR(255) NULL,
    `placed_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `confirmed_at` DATETIME(0) NULL,
    `delivered_at` DATETIME(0) NULL,
    `cancelled_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_orders_address`(`address_id`),
    INDEX `fk_orders_business`(`business_id`),
    INDEX `fk_orders_cart`(`cart_id`),
    INDEX `fk_orders_order_status`(`order_status_id`),
    INDEX `fk_orders_payment_method`(`payment_method_id`),
    INDEX `fk_orders_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `message` TEXT NOT NULL,
    `file_url` MEDIUMTEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_admin_messages_order_id`(`order_id`),
    INDEX `idx_admin_messages_user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_methods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(150) NULL,
    `requires_verification` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_payment_methods_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `payment_method_id` INTEGER NOT NULL,
    `payment_status` VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    `transaction_reference` VARCHAR(120) NULL,
    `provider_name` VARCHAR(80) NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `paid_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_payments_order`(`order_id`),
    INDEX `fk_payments_payment_method`(`payment_method_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(150) NULL,
    `icon` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_product_categories_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_category_map` (
    `product_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_product_category_map_category`(`category_id`),
    PRIMARY KEY (`product_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `image_url` VARCHAR(255) NOT NULL,
    `alt_text` VARCHAR(150) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 1,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_product_images_product`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `business_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `sku` VARCHAR(60) NOT NULL,
    `barcode` VARCHAR(80) NULL,
    `description_short` VARCHAR(255) NULL,
    `description_long` TEXT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `discount_price` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'MXN',
    `sale_format` VARCHAR(50) NULL,
    `price_per_unit` DECIMAL(10, 2) NULL,
    `tax_included` BOOLEAN NOT NULL DEFAULT true,
    `tax_rate` DECIMAL(5, 2) NULL,
    `commission_rate` DECIMAL(5, 2) NULL,
    `is_stock_available` BOOLEAN NOT NULL DEFAULT true,
    `stock_average` INTEGER NOT NULL DEFAULT 0,
    `stock_danger` INTEGER NOT NULL DEFAULT 0,
    `min_per_order` INTEGER NULL,
    `max_per_order` INTEGER NULL,
    `thumbnail_url` VARCHAR(255) NULL,
    `expires_at` DATETIME(0) NULL,
    `promotion_id` INTEGER NULL,
    `status_id` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_products_sku`(`sku`),
    INDEX `fk_products_business`(`business_id`),
    INDEX `fk_products_promotion`(`promotion_id`),
    INDEX `fk_products_status`(`status_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products_cart` (
    `cart_id` INTEGER NOT NULL,
    `product_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `notes` VARCHAR(255) NULL,
    `added_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_products_cart_product`(`product_id`),
    PRIMARY KEY (`cart_id`, `product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promotions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(200) NULL,
    `promo_type` VARCHAR(30) NOT NULL,
    `discount_value` DECIMAL(10, 2) NULL,
    `start_date` DATETIME(0) NULL,
    `end_date` DATETIME(0) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `order_id` INTEGER NULL,
    `review_type` VARCHAR(30) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `rating` INTEGER NOT NULL,
    `title` VARCHAR(120) NULL,
    `comment_text` VARCHAR(500) NULL,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_reviews_order`(`order_id`),
    INDEX `fk_reviews_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(150) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_roles_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `status_catalog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(150) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_status_catalog_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requester_user_id` INTEGER NOT NULL,
    `requester_role` VARCHAR(30) NOT NULL,
    `assigned_admin_id` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',
    `subject` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_support_conversations_requester`(`requester_user_id`, `requester_role`),
    INDEX `idx_support_conversations_admin`(`assigned_admin_id`),
    INDEX `idx_support_conversations_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NULL,
    `sender_user_id` INTEGER NULL,
    `sender_role` VARCHAR(30) NULL,
    `message` TEXT NOT NULL,
    `attachment_url` MEDIUMTEXT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_support_messages_conversation`(`conversation_id`),
    INDEX `idx_support_messages_sender_user`(`sender_user_id`),
    INDEX `idx_support_messages_is_read`(`is_read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` INTEGER NOT NULL,
    `role_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_user_roles_role`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(150) NULL,
    `max_load_kg` DECIMAL(6, 2) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_vehicle_types_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `fk_users_status` FOREIGN KEY (`status_id`) REFERENCES `status_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `fk_addresses_status` FOREIGN KEY (`status_id`) REFERENCES `status_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `fk_addresses_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business` ADD CONSTRAINT `fk_business_status` FOREIGN KEY (`status_id`) REFERENCES `status_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_category_map` ADD CONSTRAINT `fk_business_category_map_business` FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_category_map` ADD CONSTRAINT `fk_business_category_map_category` FOREIGN KEY (`category_id`) REFERENCES `business_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_details` ADD CONSTRAINT `fk_business_details_business` FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_hours` ADD CONSTRAINT `fk_business_hours_business` FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_images` ADD CONSTRAINT `fk_business_images_business` FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_managers` ADD CONSTRAINT `fk_business_managers_business` FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_managers` ADD CONSTRAINT `fk_business_managers_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_owners` ADD CONSTRAINT `fk_business_owners_business` FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_owners` ADD CONSTRAINT `fk_business_owners_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart` ADD CONSTRAINT `fk_cart_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery` ADD CONSTRAINT `fk_delivery_driver` FOREIGN KEY (`driver_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery` ADD CONSTRAINT `fk_delivery_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery` ADD CONSTRAINT `fk_delivery_status` FOREIGN KEY (`delivery_status_id`) REFERENCES `delivery_status_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery` ADD CONSTRAINT `fk_delivery_vehicle_type` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_metrics` ADD CONSTRAINT `fk_delivery_metrics_delivery` FOREIGN KEY (`delivery_id`) REFERENCES `delivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_payments` ADD CONSTRAINT `fk_delivery_payments_delivery` FOREIGN KEY (`delivery_id`) REFERENCES `delivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_payments` ADD CONSTRAINT `fk_delivery_payments_driver` FOREIGN KEY (`driver_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_settlements` ADD CONSTRAINT `fk_delivery_settlements_driver` FOREIGN KEY (`driver_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_tips` ADD CONSTRAINT `fk_delivery_tips_delivery` FOREIGN KEY (`delivery_id`) REFERENCES `delivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_tips` ADD CONSTRAINT `fk_delivery_tips_driver` FOREIGN KEY (`driver_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_tips` ADD CONSTRAINT `fk_delivery_tips_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `fk_favorites_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_notes` ADD CONSTRAINT `fk_order_notes_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_notes` ADD CONSTRAINT `fk_order_notes_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_address` FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_business` FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_cart` FOREIGN KEY (`cart_id`) REFERENCES `cart`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_order_status` FOREIGN KEY (`order_status_id`) REFERENCES `order_status_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_payment_method` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_messages` ADD CONSTRAINT `admin_messages_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_messages` ADD CONSTRAINT `admin_messages_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `fk_payments_payment_method` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_category_map` ADD CONSTRAINT `fk_product_category_map_category` FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_category_map` ADD CONSTRAINT `fk_product_category_map_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_images` ADD CONSTRAINT `fk_product_images_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `fk_products_business` FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `fk_products_promotion` FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `fk_products_status` FOREIGN KEY (`status_id`) REFERENCES `status_catalog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products_cart` ADD CONSTRAINT `fk_products_cart_cart` FOREIGN KEY (`cart_id`) REFERENCES `cart`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products_cart` ADD CONSTRAINT `fk_products_cart_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `fk_reviews_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `fk_reviews_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_requester_user_id_fkey` FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_assigned_admin_id_fkey` FOREIGN KEY (`assigned_admin_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `support_conversations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_sender_user_id_fkey` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
