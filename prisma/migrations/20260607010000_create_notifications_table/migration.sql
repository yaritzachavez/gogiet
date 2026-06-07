CREATE TABLE `notifications` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NULL,
  `business_id` INTEGER NULL,
  `role` VARCHAR(80) NULL,
  `type` VARCHAR(50) NULL,
  `title` VARCHAR(160) NOT NULL,
  `message` TEXT NOT NULL,
  `related_id` INTEGER NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT false,
  `data_json` JSON NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  INDEX `idx_notifications_business_id` (`business_id`),
  INDEX `idx_notifications_created_at` (`created_at`),
  INDEX `idx_notifications_is_read` (`is_read`),
  INDEX `idx_notifications_role` (`role`),
  INDEX `idx_notifications_user_id` (`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
