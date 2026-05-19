import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import pool from "@/lib/db";
import { assertColumnsExist, assertTablesExist } from "@/lib/runtime-schema";

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
  await assertTablesExist(executor, [
    "trainings",
    "training_questions",
    "training_answers",
    "training_assignments",
    "training_results",
  ]);
  await assertColumnsExist(executor, "trainings", [
    "id",
    "business_id",
    "title",
    "description",
    "type",
    "video_url",
    "passing_score",
    "is_active",
    "created_by",
    "created_at",
    "updated_at",
  ]);
  await assertColumnsExist(executor, "training_questions", [
    "id",
    "training_id",
    "question",
    "sort_order",
    "created_at",
    "updated_at",
  ]);
  await assertColumnsExist(executor, "training_answers", [
    "id",
    "question_id",
    "text",
    "is_correct",
    "sort_order",
    "created_at",
    "updated_at",
  ]);
  await assertColumnsExist(executor, "training_assignments", [
    "id",
    "training_id",
    "business_id",
    "user_id",
    "due_date",
    "status",
    "assigned_by",
    "video_completed_at",
    "created_at",
    "updated_at",
  ]);
  await assertColumnsExist(executor, "training_results", [
    "id",
    "assignment_id",
    "score",
    "passed",
    "answers_json",
    "completed_at",
  ]);
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
