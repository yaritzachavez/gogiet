import { type NextRequest, NextResponse } from "next/server";

import {
  ensureUserSessionsTable,
  getAuthUser,
  isAdminGeneral,
} from "@/lib/admin-security";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { user: authUser } = getAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!(await isAdminGeneral(authUser.id))) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    await ensureUserSessionsTable();

    await pool.query(
      `
        UPDATE user_sessions
        SET status = 'closed', updated_at = NOW(), last_active_at = NOW()
        WHERE user_id = ?
      `,
      [authUser.id],
    );

    const response = NextResponse.json({
      success: true,
      message: "Sesiones cerradas en todos los dispositivos",
    });

    response.cookies.set("authToken", "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      secure: true,
    });

    return response;
  } catch (error) {
    console.error("Error POST /api/admin/security/logout-all:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cerrar las sesiones.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
