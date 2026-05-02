import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import {
  ensureAdminSettingsTable,
  ensureUserSessionsTable,
  getAuthUser,
  isAdminGeneral,
  type SessionRow,
} from "@/lib/admin-security";
import pool from "@/lib/db";

type SecuritySettingsRow = RowDataPacket & {
  two_factor_enabled: number | null;
};

export async function GET(req: NextRequest) {
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

    await ensureAdminSettingsTable();
    await ensureUserSessionsTable();

    const [settingRows] = await pool.query<SecuritySettingsRow[]>(
      `
        SELECT two_factor_enabled
        FROM admin_settings
        WHERE user_id = ?
        LIMIT 1
      `,
      [authUser.id],
    );

    const [sessionRows] = await pool.query<SessionRow[]>(
      `
        SELECT
          id,
          device_name,
          location,
          last_active_at,
          status
        FROM user_sessions
        WHERE user_id = ?
        ORDER BY last_active_at DESC
      `,
      [authUser.id],
    );

    return NextResponse.json({
      success: true,
      security: {
        twoFactorEnabled: Boolean(settingRows[0]?.two_factor_enabled ?? false),
      },
      sessions: sessionRows.map((session) => ({
        id: session.id,
        deviceName: session.device_name ?? "Dispositivo desconocido",
        location: session.location ?? "Ubicación no disponible",
        lastActiveAt: session.last_active_at,
        status: session.status ?? "active",
      })),
    });
  } catch (error) {
    console.error("Error GET /api/admin/security:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo cargar la seguridad.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
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

    const body = await req.json();
    const twoFactorEnabled = Boolean(body?.twoFactorEnabled);

    await ensureAdminSettingsTable();

    await pool.query(
      `
        INSERT INTO admin_settings (user_id, two_factor_enabled)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          two_factor_enabled = VALUES(two_factor_enabled),
          updated_at = NOW()
      `,
      [authUser.id, twoFactorEnabled ? 1 : 0],
    );

    return NextResponse.json({
      success: true,
      message: twoFactorEnabled
        ? "Autenticación en dos pasos activada"
        : "Autenticación en dos pasos desactivada",
      security: {
        twoFactorEnabled,
      },
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/security:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo actualizar la seguridad.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
