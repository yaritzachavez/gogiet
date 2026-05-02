import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";
import { ensureTrainingTables } from "@/lib/trainings";

type TrainingTypeRow = RowDataPacket & {
  type: string;
};

export async function PATCH(
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

    if (!Number.isInteger(parsedAssignmentId) || parsedAssignmentId <= 0) {
      return NextResponse.json(
        { success: false, error: "Asignación inválida" },
        { status: 400 },
      );
    }

    await ensureTrainingTables(connection);

    const [rows] = await connection.query<TrainingTypeRow[]>(
      `
        SELECT t.type
        FROM training_assignments ta
        INNER JOIN trainings t ON t.id = ta.training_id
        WHERE ta.id = ? AND ta.user_id = ?
        LIMIT 1
      `,
      [parsedAssignmentId, authUser.user.id],
    );

    if (!rows.length) {
      return NextResponse.json(
        { success: false, error: "Capacitación no encontrada" },
        { status: 404 },
      );
    }

    const type = String(rows[0].type);
    const nextStatus = type === "video" ? "aprobado" : "en_progreso";

    await connection.beginTransaction();
    await connection.query(
      `
        UPDATE training_assignments
        SET
          video_completed_at = NOW(),
          status = ?,
          updated_at = NOW()
        WHERE id = ? AND user_id = ?
      `,
      [nextStatus, parsedAssignmentId, authUser.user.id],
    );

    if (type === "video") {
      await connection.query(
        `
          INSERT INTO training_results (
            assignment_id,
            score,
            passed,
            answers_json,
            completed_at
          )
          VALUES (?, 100, 1, NULL, NOW())
        `,
        [parsedAssignmentId],
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Video marcado como visto",
    });
  } catch (error) {
    await connection.rollback();
    console.error(
      "Error PATCH /api/seller/trainings/[assignmentId]/video:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo marcar el video como visto.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
