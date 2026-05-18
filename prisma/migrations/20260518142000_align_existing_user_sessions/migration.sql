SET @has_user_sessions := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_sessions'
);

SET @sql = IF(
  @has_user_sessions = 1 AND (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_sessions'
      AND COLUMN_NAME = 'session_token_hash'
  ) = 0,
  'ALTER TABLE user_sessions ADD COLUMN session_token_hash CHAR(64) NULL AFTER user_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_user_sessions = 1 AND (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_sessions'
      AND COLUMN_NAME = 'expires_at'
  ) = 0,
  'ALTER TABLE user_sessions ADD COLUMN expires_at DATETIME(0) NULL AFTER last_active_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_user_sessions = 1 AND (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_sessions'
      AND COLUMN_NAME = 'revoked_at'
  ) = 0,
  'ALTER TABLE user_sessions ADD COLUMN revoked_at DATETIME(0) NULL AFTER expires_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE user_sessions
SET session_token_hash = SHA2(token, 256)
WHERE @has_user_sessions = 1
  AND session_token_hash IS NULL
  AND token IS NOT NULL
  AND TRIM(token) <> '';

UPDATE user_sessions
SET expires_at = DATE_ADD(COALESCE(last_active_at, created_at, NOW()), INTERVAL 9 HOUR)
WHERE @has_user_sessions = 1
  AND expires_at IS NULL;

SET @sql = IF(
  @has_user_sessions = 1 AND (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_sessions'
      AND INDEX_NAME = 'idx_user_sessions_expires_at'
  ) = 0,
  'ALTER TABLE user_sessions ADD INDEX idx_user_sessions_expires_at (expires_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_user_sessions = 1 AND (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_sessions'
      AND INDEX_NAME = 'idx_user_sessions_created_at'
  ) = 0,
  'ALTER TABLE user_sessions ADD INDEX idx_user_sessions_created_at (created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_user_sessions = 1 AND (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_sessions'
      AND INDEX_NAME = 'uk_user_sessions_token_hash'
  ) = 0,
  'ALTER TABLE user_sessions ADD UNIQUE INDEX uk_user_sessions_token_hash (session_token_hash)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_user_sessions = 1,
  'ALTER TABLE user_sessions MODIFY session_token_hash CHAR(64) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @has_user_sessions = 1,
  'ALTER TABLE user_sessions MODIFY expires_at DATETIME(0) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
