import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import pool from "@/lib/db";

type Queryable = Pool | PoolConnection;

export type TrainingType = "video" | "test" | "video_test";

export type TrainingQuestionInput = {
  question: string;
  options: Array<{
    text: string;
    isCorrect: boolean;
  }>;
};

export async function ensureTrainingTables(executor: Queryable = pool) {
  await executor.query(
    `
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
      )
    `,
  );

  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS training_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        training_id INT NOT NULL,
        question TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_training_questions_training_id (training_id)
      )
    `,
  );

  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS training_answers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question_id INT NOT NULL,
        text TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_training_answers_question_id (question_id)
      )
    `,
  );

  await executor.query(
    `
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
      )
    `,
  );

  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS training_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id INT NOT NULL,
        score DECIMAL(5,2) NOT NULL DEFAULT 0,
        passed BOOLEAN NOT NULL DEFAULT FALSE,
        answers_json LONGTEXT NULL,
        completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_training_results_assignment_id (assignment_id)
      )
    `,
  );
}

export async function createTraining(
  params: {
    businessId: number;
    title: string;
    description?: string;
    type: TrainingType;
    videoUrl?: string | null;
    passingScore: number;
    createdBy?: number | null;
    questions?: TrainingQuestionInput[];
    isActive?: boolean;
  },
  executor: Queryable = pool,
) {
  await ensureTrainingTables(executor);

  const [result] = await executor.query<ResultSetHeader>(
    `
      INSERT INTO trainings (
        business_id,
        title,
        description,
        type,
        video_url,
        passing_score,
        is_active,
        created_by,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      params.businessId,
      params.title,
      params.description ?? null,
      params.type,
      params.videoUrl ?? null,
      params.passingScore,
      params.isActive === false ? 0 : 1,
      params.createdBy ?? null,
    ],
  );

  const trainingId = Number(result.insertId);
  const questions = Array.isArray(params.questions) ? params.questions : [];

  for (const [questionIndex, question] of questions.entries()) {
    const [questionResult] = await executor.query<ResultSetHeader>(
      `
        INSERT INTO training_questions (
          training_id,
          question,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NOW(), NOW())
      `,
      [trainingId, question.question, questionIndex + 1],
    );

    for (const [optionIndex, option] of question.options.entries()) {
      await executor.query(
        `
          INSERT INTO training_answers (
            question_id,
            text,
            is_correct,
            sort_order,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, NOW(), NOW())
        `,
        [
          Number(questionResult.insertId),
          option.text,
          option.isCorrect ? 1 : 0,
          optionIndex + 1,
        ],
      );
    }
  }

  return trainingId;
}

export async function assignTrainingToUser(
  params: {
    trainingId: number;
    businessId: number;
    userId: number;
    dueDate?: string | null;
    assignedBy?: number | null;
  },
  executor: Queryable = pool,
) {
  await ensureTrainingTables(executor);

  const [existingRows] = await executor.query<RowDataPacket[]>(
    `
      SELECT id, status
      FROM training_assignments
      WHERE training_id = ? AND user_id = ? AND business_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [params.trainingId, params.userId, params.businessId],
  );

  if (existingRows.length) {
    const assignmentId = Number(existingRows[0].id);
    await executor.query(
      `
        UPDATE training_assignments
        SET
          due_date = ?,
          status = CASE
            WHEN status IN ('aprobado', 'reprobado') THEN 'pendiente'
            ELSE status
          END,
          assigned_by = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        params.dueDate ? `${params.dueDate} 23:59:59` : null,
        params.assignedBy ?? null,
        assignmentId,
      ],
    );

    return assignmentId;
  }

  const [result] = await executor.query<ResultSetHeader>(
    `
      INSERT INTO training_assignments (
        training_id,
        business_id,
        user_id,
        due_date,
        status,
        assigned_by,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'pendiente', ?, NOW(), NOW())
    `,
    [
      params.trainingId,
      params.businessId,
      params.userId,
      params.dueDate ? `${params.dueDate} 23:59:59` : null,
      params.assignedBy ?? null,
    ],
  );

  return Number(result.insertId);
}

export function normalizeTrainingType(value: unknown): TrainingType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "video") return "video";
  if (normalized === "test") return "test";
  return "video_test";
}
