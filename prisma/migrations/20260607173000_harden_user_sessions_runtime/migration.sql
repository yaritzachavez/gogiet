-- Formal migration prepared for legacy user_sessions tables that still store
-- opaque session tokens directly and are missing revocation/expiry metadata.
-- Do not apply against production without staging validation and backup.

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS session_token_hash CHAR(64) NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS last_used_at DATETIME(0) NULL AFTER last_active_at,
  ADD COLUMN IF NOT EXISTS expires_at DATETIME(0) NULL AFTER last_used_at,
  ADD COLUMN IF NOT EXISTS revoked_at DATETIME(0) NULL AFTER expires_at,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'active' AFTER revoked_at;

UPDATE user_sessions
SET
  session_token_hash = COALESCE(session_token_hash, NULLIF(SHA2(token, 256), "")),
  last_used_at = COALESCE(last_used_at, last_active_at, updated_at, created_at),
  expires_at = COALESCE(
    expires_at,
    DATE_ADD(COALESCE(last_active_at, updated_at, created_at), INTERVAL 9 HOUR)
  ),
  revoked_at = CASE
    WHEN LOWER(TRIM(COALESCE(status, ""))) = "revoked"
      THEN COALESCE(revoked_at, updated_at, created_at)
    ELSE revoked_at
  END,
  status = CASE
    WHEN TRIM(COALESCE(status, "")) = "" THEN "active"
    ELSE status
  END;

ALTER TABLE user_sessions
  MODIFY COLUMN session_token_hash CHAR(64) NOT NULL,
  MODIFY COLUMN expires_at DATETIME(0) NOT NULL;

CREATE UNIQUE INDEX uk_user_sessions_token_hash
  ON user_sessions (session_token_hash);
CREATE INDEX idx_user_sessions_user_id
  ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_user_status
  ON user_sessions (user_id, status);
CREATE INDEX idx_user_sessions_status
  ON user_sessions (status);
CREATE INDEX idx_user_sessions_expires_at
  ON user_sessions (expires_at);
CREATE INDEX idx_user_sessions_last_used_at
  ON user_sessions (last_used_at);
CREATE INDEX idx_user_sessions_created_at
  ON user_sessions (created_at);

ALTER TABLE user_sessions
  DROP COLUMN token;
