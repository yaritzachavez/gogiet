CREATE TABLE `user_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `session_token_hash` CHAR(64) NOT NULL,
    `device_name` VARCHAR(120) NULL,
    `location` VARCHAR(191) NULL,
    `last_active_at` DATETIME(0) NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `revoked_at` DATETIME(0) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_user_sessions_token_hash`(`session_token_hash`),
    INDEX `idx_user_sessions_user_id`(`user_id`),
    INDEX `idx_user_sessions_status`(`status`),
    INDEX `idx_user_sessions_expires_at`(`expires_at`),
    INDEX `idx_user_sessions_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_sessions`
    ADD CONSTRAINT `fk_user_sessions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
