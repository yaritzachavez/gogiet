CREATE TABLE IF NOT EXISTS trainings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  type VARCHAR(24) NOT NULL,
  video_url LONGTEXT NULL,
  passing_score DECIMAL(5,2) NOT NULL DEFAULT 70,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_trainings_business_id (business_id),
  INDEX idx_trainings_is_active (is_active)
);

CREATE TABLE IF NOT EXISTS training_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  training_id INT NOT NULL,
  question TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_training_questions_training_id (training_id)
);

CREATE TABLE IF NOT EXISTS training_answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_training_answers_question_id (question_id)
);

CREATE TABLE IF NOT EXISTS training_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  training_id INT NOT NULL,
  business_id INT NOT NULL,
  user_id INT NOT NULL,
  due_date DATETIME NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pendiente',
  assigned_by INT NULL,
  video_completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_training_assignments_training_id (training_id),
  INDEX idx_training_assignments_business_id (business_id),
  INDEX idx_training_assignments_user_id (user_id),
  INDEX idx_training_assignments_status (status)
);

CREATE TABLE IF NOT EXISTS training_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  score DECIMAL(5,2) NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  answers_json LONGTEXT NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_training_results_assignment_id (assignment_id)
);
