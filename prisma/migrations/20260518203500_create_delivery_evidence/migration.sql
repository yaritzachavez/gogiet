CREATE TABLE IF NOT EXISTS `delivery_evidence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `delivery_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `driver_user_id` INTEGER NOT NULL,
    `photo_url` TEXT NOT NULL,
    `note` TEXT NULL,
    `latitude` DECIMAL(10,7) NULL,
    `longitude` DECIMAL(10,7) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_delivery_evidence_delivery_id`(`delivery_id`),
    INDEX `idx_delivery_evidence_order_id`(`order_id`),
    INDEX `idx_delivery_evidence_driver_user_id`(`driver_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
