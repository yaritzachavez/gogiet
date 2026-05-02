import type { ResultSetHeader } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";
import { ensureNotificationsTable } from "@/lib/notifications";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    await ensureNotificationsTable();

    const { id } = await context.params;
    const notificationId = Number(id);

    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 },
      );
    }

    const [result] = await pool.query<ResultSetHeader>(
      `
        UPDATE notifications
        SET is_read = 1
        WHERE id = ? AND user_id = ?
      `,
      [notificationId, authUser.user.id],
    );

    if (!result.affectedRows) {
      return NextResponse.json(
        { success: false, error: "Notificación no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error PATCH /api/notifications/[id]/read:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo actualizar la notificación.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
