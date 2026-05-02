import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";
import { ensureTrainingTables } from "@/lib/trainings";

type AssignmentRow = RowDataPacket & {
  assignment_id: number;
  training_id: number;
  business_id: number;
  title: string;
  description: string | null;
  type: string;
  video_url: string | null;
  passing_score: number | string | null;
  status: string;
  due_date: string | null;
  video_completed_at: string | null;
  score: number | string | null;
  passed: number | boolean | null;
  completed_at: string | null;
  business_name: string | null;
};

type QuestionRow = RowDataPacket & {
  id: number;
  training_id: number;
  question: string;
};

type AnswerRow = RowDataPacket & {
  id: number;
  question_id: number;
  text: string;
  is_correct: number | boolean | null;
};

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", trainings: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", trainings: [] },
        { status: 401 },
      );
    }

    await ensureTrainingTables();

    const [assignmentRows] = await pool.query<AssignmentRow[]>(
      `
        SELECT
          ta.id AS assignment_id,
          ta.training_id,
          ta.business_id,
          t.title,
          t.description,
          t.type,
          t.video_url,
          t.passing_score,
          ta.status,
          ta.due_date,
          ta.video_completed_at,
          tr.score,
          tr.passed,
          tr.completed_at,
          b.name AS business_name
        FROM training_assignments ta
        INNER JOIN trainings t ON t.id = ta.training_id
        LEFT JOIN training_results tr ON tr.assignment_id = ta.id
        LEFT JOIN business b ON b.id = ta.business_id
        WHERE ta.user_id = ?
        ORDER BY ta.created_at DESC, ta.id DESC
      `,
      [authUser.user.id],
    );

    const trainingIds = assignmentRows.map((row) => Number(row.training_id));
    const [questionRows] = trainingIds.length
      ? await pool.query<QuestionRow[]>(
          `
            SELECT id, training_id, question
            FROM training_questions
            WHERE training_id IN (${trainingIds.map(() => "?").join(", ")})
            ORDER BY sort_order ASC, id ASC
          `,
          trainingIds,
        )
      : [[] as QuestionRow[]];
    const questionIds = questionRows.map((row) => Number(row.id));
    const [answerRows] = questionIds.length
      ? await pool.query<AnswerRow[]>(
          `
            SELECT id, question_id, text, is_correct
            FROM training_answers
            WHERE question_id IN (${questionIds.map(() => "?").join(", ")})
            ORDER BY sort_order ASC, id ASC
          `,
          questionIds,
        )
      : [[] as AnswerRow[]];

    const answersByQuestion = new Map<number, AnswerRow[]>();
    for (const answer of answerRows) {
      const key = Number(answer.question_id);
      const group = answersByQuestion.get(key) ?? [];
      group.push(answer);
      answersByQuestion.set(key, group);
    }

    const questionsByTraining = new Map<
      number,
      Array<Record<string, unknown>>
    >();
    for (const question of questionRows) {
      const key = Number(question.training_id);
      const group = questionsByTraining.get(key) ?? [];
      group.push({
        id: Number(question.id),
        question: question.question,
        options: (answersByQuestion.get(Number(question.id)) ?? []).map(
          (answer) => ({
            id: Number(answer.id),
            text: answer.text,
            isCorrect: Boolean(answer.is_correct),
          }),
        ),
      });
      questionsByTraining.set(key, group);
    }

    return NextResponse.json({
      success: true,
      trainings: assignmentRows.map((row) => ({
        assignment_id: Number(row.assignment_id),
        training_id: Number(row.training_id),
        business_id: Number(row.business_id),
        business_name: row.business_name ?? "Negocio",
        title: row.title,
        description: row.description ?? "",
        type: row.type,
        video_url: row.video_url ?? "",
        passing_score: Number(row.passing_score ?? 0),
        status: row.status,
        due_date: row.due_date,
        video_completed_at: row.video_completed_at,
        score: Number(row.score ?? 0),
        passed: row.passed === null ? null : Boolean(row.passed),
        completed_at: row.completed_at,
        questions: questionsByTraining.get(Number(row.training_id)) ?? [],
      })),
    });
  } catch (error) {
    console.error("Error GET /api/seller/trainings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las capacitaciones.",
        trainings: [],
      },
      { status: 500 },
    );
  }
}
