import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import {
  ensureAdminSettingsTable,
  getAuthUser,
  isAdminGeneral,
} from "@/lib/admin-security";
import pool from "@/lib/db";

type AdminSettingRow = RowDataPacket & {
  language: string | null;
  timezone: string | null;
  realtime_notifications: number | null;
  dark_mode: number | null;
};

const DEFAULT_SETTINGS = {
  language: "es-MX",
  timezone: "America/Mexico_City",
  realtimeNotifications: true,
  darkMode: false,
};

function isValidLanguage(value: string) {
  return value === "es-MX" || value === "en-US";
}

function isValidTimezone(value: string) {
  return value === "America/Mexico_City" || value === "America/Guadalajara";
}

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

    const [rows] = await pool.query<AdminSettingRow[]>(
      `
        SELECT language, timezone, realtime_notifications, dark_mode
        FROM admin_settings
        WHERE user_id = ?
        LIMIT 1
      `,
      [authUser.id],
    );

    if (!rows.length) {
      return NextResponse.json({
        success: true,
        settings: DEFAULT_SETTINGS,
      });
    }

    const settings = rows[0];

    return NextResponse.json({
      success: true,
      settings: {
        language: settings.language ?? DEFAULT_SETTINGS.language,
        timezone: settings.timezone ?? DEFAULT_SETTINGS.timezone,
        realtimeNotifications:
          settings.realtime_notifications === null
            ? DEFAULT_SETTINGS.realtimeNotifications
            : Boolean(settings.realtime_notifications),
        darkMode:
          settings.dark_mode === null
            ? DEFAULT_SETTINGS.darkMode
            : Boolean(settings.dark_mode),
      },
    });
  } catch (error) {
    console.error("Error GET /api/admin/settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar las preferencias.",
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
    const language = String(body?.language ?? "").trim();
    const timezone = String(body?.timezone ?? "").trim();
    const realtimeNotifications = Boolean(body?.realtimeNotifications);
    const darkMode = Boolean(body?.darkMode);

    if (!isValidLanguage(language)) {
      return NextResponse.json(
        { success: false, error: "Idioma no válido" },
        { status: 400 },
      );
    }

    if (!isValidTimezone(timezone)) {
      return NextResponse.json(
        { success: false, error: "Zona horaria no válida" },
        { status: 400 },
      );
    }

    await ensureAdminSettingsTable();

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO admin_settings (
          user_id,
          language,
          timezone,
          realtime_notifications,
          dark_mode
        )
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          language = VALUES(language),
          timezone = VALUES(timezone),
          realtime_notifications = VALUES(realtime_notifications),
          dark_mode = VALUES(dark_mode),
          updated_at = NOW()
      `,
      [
        authUser.id,
        language,
        timezone,
        realtimeNotifications ? 1 : 0,
        darkMode ? 1 : 0,
      ],
    );

    return NextResponse.json({
      success: true,
      message: "Preferencias guardadas",
      settings: {
        language,
        timezone,
        realtimeNotifications,
        darkMode,
      },
    });
  } catch (error) {
    console.error("Error PATCH /api/admin/settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron guardar las preferencias.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
