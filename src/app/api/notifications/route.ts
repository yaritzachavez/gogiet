import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import { logDbUsage } from "@/lib/db";
import {
  createNotification,
  ensureNotificationsTable,
  getNotificationsForActor,
} from "@/lib/notifications";

function expandNotificationRoles(roles: string[]) {
  const normalizedRoles = new Set(
    roles
      .map((role) => String(role ?? "").trim())
      .filter((role) => role.length > 0),
  );

  if (normalizedRoles.has("delivery") || normalizedRoles.has("repartidor")) {
    normalizedRoles.add("delivery");
    normalizedRoles.add("repartidor");
  }

  return Array.from(normalizedRoles);
}

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

    const access = await resolveBusinessAccess(authUser.user.id);

    console.log("GET /api/notifications endpoint:", "/api/notifications");
    console.log("GET /api/notifications userId:", authUser.user.id);
    console.log("GET /api/notifications email:", access.email);
    console.log("GET /api/notifications role:", access.roles);
    logDbUsage("/api/notifications", {
      userId: authUser.user.id,
      email: access.email,
      role: access.roles,
    });

    await ensureNotificationsTable();
    const actorRoles = expandNotificationRoles(access.roles);
    const notifications = await getNotificationsForActor({
      userId: authUser.user.id,
      businessIds: access.businessIds,
      roles: actorRoles,
    });
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
    const businessId = Number(body?.business_id);
    const role = String(body?.role ?? "").trim() || null;
    const type = String(body?.type ?? "").trim();
    const title = String(body?.title ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const relatedId = Number(body?.related_id);
    const dataJson = body?.data_json ?? null;

    if ((!userId && !businessId && !role) || !type || !title || !message) {
      return NextResponse.json(
        {
          success: false,
          error:
            "user_id o business_id o role, además de type, title y message, son requeridos",
        },
        { status: 400 },
      );
    }

    const notificationId = await createNotification({
      userId: Number.isFinite(userId) ? userId : null,
      businessId: Number.isFinite(businessId) ? businessId : null,
      role,
      type,
      title,
      message,
      relatedId: Number.isFinite(relatedId) ? relatedId : null,
      dataJson,
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
