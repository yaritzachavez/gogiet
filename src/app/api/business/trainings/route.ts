import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";
import {
  createTraining,
  ensureTrainingTables,
  normalizeTrainingType,
  type TrainingQuestionInput,
} from "@/lib/trainings";

type TrainingRow = RowDataPacket & {
  id: number;
  title: string;
  description: string | null;
  type: string;
  video_url: string | null;
  passing_score: number | string | null;
  is_active: number | boolean | null;
  created_at: string;
};

type QuestionRow = RowDataPacket & {
  id: number;
  training_id: number;
  question: string;
  sort_order: number;
};

type AnswerRow = RowDataPacket & {
  id: number;
  question_id: number;
  text: string;
  is_correct: number | boolean | null;
  sort_order: number;
};

type ResultRow = RowDataPacket & {
  assignment_id: number;
  training_id: number;
  training_title: string;
  user_id: number;
  seller_name: string;
  status: string;
  score: number | string | null;
  passed: number | boolean | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
};

function toPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function canManageTrainings(roles: string[]) {
  const normalized = roles.map((role) => String(role).trim().toLowerCase());

  return normalized.some((role) =>
    ["admin_general", "business_admin", "administrador_negocio"].includes(role),
  );
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const access = await resolveBusinessAccess(
      authUser.user.id,
      toPositiveNumber(req.nextUrl.searchParams.get("business_id")),
    );
    logDbUsage("/api/business/trainings", {
      userId: access.userId,
      email: access.email,
      role: access.roles,
    });

    if (!access.businessId) {
      return NextResponse.json({
        success: true,
        trainings: [],
        results: [],
      });
    }

    if (!canManageTrainings(access.roles) && !access.isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para gestionar capacitaciones",
        },
        { status: 403 },
      );
    }

    await ensureTrainingTables();

    const [trainingRows] = await pool.query<TrainingRow[]>(
      `
        SELECT
          id,
          title,
          description,
          type,
          video_url,
          passing_score,
          is_active,
          created_at
        FROM trainings
        WHERE business_id = ?
        ORDER BY created_at DESC, id DESC
      `,
      [access.businessId],
    );

    const trainingIds = trainingRows.map((row) => Number(row.id));
    const [questionRows] = trainingIds.length
      ? await pool.query<QuestionRow[]>(
          `
            SELECT id, training_id, question, sort_order
            FROM training_questions
            WHERE training_id IN (${trainingIds.map(() => "?").join(", ")})
            ORDER BY training_id ASC, sort_order ASC, id ASC
          `,
          trainingIds,
        )
      : [[] as QuestionRow[]];
    const questionIds = questionRows.map((row) => Number(row.id));
    const [answerRows] = questionIds.length
      ? await pool.query<AnswerRow[]>(
          `
            SELECT id, question_id, text, is_correct, sort_order
            FROM training_answers
            WHERE question_id IN (${questionIds.map(() => "?").join(", ")})
            ORDER BY question_id ASC, sort_order ASC, id ASC
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

    const [resultRows] = await pool.query<ResultRow[]>(
      `
        SELECT
          ta.id AS assignment_id,
          ta.training_id,
          t.title AS training_title,
          ta.user_id,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS seller_name,
          ta.status,
          tr.score,
          tr.passed,
          ta.due_date,
          ta.created_at,
          tr.completed_at
        FROM training_assignments ta
        INNER JOIN trainings t ON t.id = ta.training_id
        INNER JOIN users u ON u.id = ta.user_id
        LEFT JOIN training_results tr ON tr.assignment_id = ta.id
        WHERE ta.business_id = ?
        ORDER BY ta.created_at DESC, ta.id DESC
      `,
      [access.businessId],
    );

    return NextResponse.json({
      success: true,
      trainings: trainingRows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        description: row.description ?? "",
        type: row.type,
        video_url: row.video_url ?? "",
        passing_score: Number(row.passing_score ?? 0),
        is_active: Boolean(row.is_active),
        created_at: String(row.created_at),
        questions: questionsByTraining.get(Number(row.id)) ?? [],
      })),
      results: resultRows.map((row) => ({
        assignment_id: Number(row.assignment_id),
        training_id: Number(row.training_id),
        training_title: row.training_title,
        user_id: Number(row.user_id),
        seller_name: row.seller_name || `Usuario ${row.user_id}`,
        status: row.status,
        score: Number(row.score ?? 0),
        passed: row.passed === null ? null : Boolean(row.passed),
        due_date: row.due_date,
        created_at: row.created_at,
        completed_at: row.completed_at,
      })),
    });
  } catch (error) {
    console.error("Error GET /api/business/trainings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las capacitaciones.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    const businessId = Number(body?.business_id ?? 0);
    const title = String(body?.title ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const type = normalizeTrainingType(body?.type);
    const videoUrl = String(body?.video_url ?? "").trim();
    const passingScore = Number(body?.passing_score ?? 70);
    const isActive = body?.is_active !== false;
    const questions = Array.isArray(body?.questions)
      ? (body.questions as TrainingQuestionInput[])
      : [];

    if (!title) {
      return NextResponse.json(
        { success: false, error: "El título es obligatorio" },
        { status: 400 },
      );
    }

    if ((type === "video" || type === "video_test") && !videoUrl) {
      return NextResponse.json(
        { success: false, error: "El video o enlace es obligatorio" },
        { status: 400 },
      );
    }

    if ((type === "test" || type === "video_test") && !questions.length) {
      return NextResponse.json(
        { success: false, error: "Debes agregar al menos una pregunta" },
        { status: 400 },
      );
    }

    const access = await resolveBusinessAccess(authUser.user.id, businessId);

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes negocio asignado" },
        { status: 403 },
      );
    }

    if (!canManageTrainings(access.roles) && !access.isAdmin) {
      return NextResponse.json(
        { success: false, error: "No autorizado para crear capacitaciones" },
        { status: 403 },
      );
    }

    await connection.beginTransaction();
    const trainingId = await createTraining(
      {
        businessId: access.businessId,
        title,
        description,
        type,
        videoUrl: videoUrl || null,
        passingScore: Number.isFinite(passingScore) ? passingScore : 70,
        createdBy: authUser.user.id,
        questions,
        isActive,
      },
      connection,
    );
    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Capacitación creada correctamente",
      training_id: trainingId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error POST /api/business/trainings:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la capacitación.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
