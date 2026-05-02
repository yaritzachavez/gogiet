import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";
import { ensureTrainingTables } from "@/lib/trainings";

type AssignmentRow = RowDataPacket & {
  passing_score: number | string | null;
};

type AnswerRow = RowDataPacket & {
  id: number;
  is_correct: number | boolean | null;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
) {
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

    const { assignmentId } = await context.params;
    const parsedAssignmentId = Number(assignmentId);
    const body = await req.json().catch(() => null);
    const answers = Array.isArray(body?.answers)
      ? (body.answers as Array<{ question_id: number; answer_id: number }>)
      : [];

    if (!Number.isInteger(parsedAssignmentId) || parsedAssignmentId <= 0) {
      return NextResponse.json(
        { success: false, error: "Asignación inválida" },
        { status: 400 },
      );
    }

    await ensureTrainingTables(connection);

    const [assignmentRows] = await connection.query<AssignmentRow[]>(
      `
        SELECT t.passing_score
        FROM training_assignments ta
        INNER JOIN trainings t ON t.id = ta.training_id
        WHERE ta.id = ? AND ta.user_id = ?
        LIMIT 1
      `,
      [parsedAssignmentId, authUser.user.id],
    );

    if (!assignmentRows.length) {
      return NextResponse.json(
        { success: false, error: "Capacitación no encontrada" },
        { status: 404 },
      );
    }

    const answerIds = answers
      .map((item) => Number(item.answer_id))
      .filter(Boolean);
    const [correctAnswerRows] = answerIds.length
      ? await connection.query<AnswerRow[]>(
          `
            SELECT id, is_correct
            FROM training_answers
            WHERE id IN (${answerIds.map(() => "?").join(", ")})
          `,
          answerIds,
        )
      : [[] as AnswerRow[]];

    const correctAnswers = new Set(
      correctAnswerRows
        .filter((row) => Boolean(row.is_correct))
        .map((row) => Number(row.id)),
    );
    const totalQuestions = answers.length;
    const correctCount = answers.filter((answer) =>
      correctAnswers.has(Number(answer.answer_id)),
    ).length;
    const score =
      totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const passingScore = Number(assignmentRows[0].passing_score ?? 70);
    const passed = score >= passingScore;

    await connection.beginTransaction();
    await connection.query(
      `
        INSERT INTO training_results (
          assignment_id,
          score,
          passed,
          answers_json,
          completed_at
        )
        VALUES (?, ?, ?, ?, NOW())
      `,
      [parsedAssignmentId, score, passed ? 1 : 0, JSON.stringify(answers)],
    );

    await connection.query(
      `
        UPDATE training_assignments
        SET
          status = ?,
          updated_at = NOW()
        WHERE id = ? AND user_id = ?
      `,
      [passed ? "aprobado" : "reprobado", parsedAssignmentId, authUser.user.id],
    );
    await connection.commit();

    return NextResponse.json({
      success: true,
      score: Number(score.toFixed(2)),
      passed,
      message: passed ? "Capacitación aprobada" : "Capacitación reprobada",
    });
  } catch (error) {
    await connection.rollback();
    console.error(
      "Error POST /api/seller/trainings/[assignmentId]/test:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el resultado del test.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
