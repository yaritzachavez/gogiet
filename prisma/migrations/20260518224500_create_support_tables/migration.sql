CREATE TABLE IF NOT EXISTS support_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_user_id INT NOT NULL,
  requester_role VARCHAR(30) NOT NULL,
  assigned_admin_id INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  subject VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_support_conversations_requester (requester_user_id, requester_role),
  INDEX idx_support_conversations_status (status),
  INDEX idx_support_conversations_admin (assigned_admin_id)
);

CREATE TABLE IF NOT EXISTS support_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NULL,
  thread_id INT NULL,
  sender_user_id INT NULL,
  sender_id INT NULL,
  sender_role VARCHAR(30) NULL,
  sender_type VARCHAR(20) NULL,
  message TEXT NOT NULL,
  attachment_url MEDIUMTEXT NULL,
  file_url MEDIUMTEXT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  message_type VARCHAR(30) NOT NULL DEFAULT 'text',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_support_messages_conversation (conversation_id),
  INDEX idx_support_messages_thread (thread_id),
  INDEX idx_support_messages_sender_user (sender_user_id),
  INDEX idx_support_messages_is_read (is_read)
);
