CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER NOT NULL AUTO_INCREMENT,
  user_id INTEGER NOT NULL,
  language VARCHAR(10) NULL,
  timezone VARCHAR(80) NULL,
  realtime_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  dark_mode BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  updated_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX uk_admin_settings_user_id (user_id),
  INDEX idx_admin_settings_user_id (user_id),
  CONSTRAINT fk_admin_settings_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER NOT NULL AUTO_INCREMENT,
  user_id INTEGER NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(191) NOT NULL,
  old_value LONGTEXT NULL,
  new_value LONGTEXT NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX idx_audit_logs_user_id (user_id),
  INDEX idx_audit_logs_action (action),
  INDEX idx_audit_logs_resource (resource_type, resource_id),
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  PRIMARY KEY (id)
);
