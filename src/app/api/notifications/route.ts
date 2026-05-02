import { type NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import {
  createNotification,
  ensureNotificationsTable,
  getNotificationsForUser,
} from "@/lib/notifications";

type UserInfoRow = {
  email: string;
  role_name: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", notifications: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", notifications: [] },
        { status: 401 },
      );
    }

    const [userInfoRows] = await pool.query<Array<UserInfoRow & RowDataPacket>>(
      `
        SELECT u.email, r.name AS role_name
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ?
      `,
      [authUser.user.id],
    );

    console.log("GET /api/notifications endpoint:", "/api/notifications");
    console.log("GET /api/notifications userId:", authUser.user.id);
    console.log(
      "GET /api/notifications email:",
      userInfoRows[0]?.email ?? null,
    );
    console.log(
      "GET /api/notifications role:",
      userInfoRows
        .map((row) => row.role_name)
        .filter((role): role is string => Boolean(role)),
    );
    logDbUsage("/api/notifications", {
      userId: authUser.user.id,
      email: userInfoRows[0]?.email ?? null,
      role: userInfoRows
        .map((row) => row.role_name)
        .filter((role): role is string => Boolean(role)),
    });

    await ensureNotificationsTable();
    const notifications = await getNotificationsForUser(authUser.user.id);
    const unread_count = notifications.filter(
      (notification) => !notification.is_read,
    ).length;

    return NextResponse.json({
      success: true,
      notifications,
      unread_count,
    });
  } catch (error) {
    console.error("Error GET /api/notifications:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar las notificaciones.",
        details: error instanceof Error ? error.message : String(error),
        notifications: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    await ensureNotificationsTable();

    const body = await req.json();
    const userId = Number(body?.user_id);
    const type = String(body?.type ?? "").trim();
    const title = String(body?.title ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const relatedId = Number(body?.related_id);

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "user_id, type, title y message son requeridos",
        },
        { status: 400 },
      );
    }

    const notificationId = await createNotification({
      userId,
      type,
      title,
      message,
      relatedId: Number.isFinite(relatedId) ? relatedId : null,
    });

    return NextResponse.json(
      {
        success: true,
        notification_id: notificationId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error POST /api/notifications:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo crear la notificación.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
