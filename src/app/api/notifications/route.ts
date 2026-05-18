import { type NextRequest, NextResponse } from "next/server";

import { resolveBusinessAccess } from "@/lib/business-panel";
import {
  createNotification,
  ensureNotificationsTable,
  getNotificationsForActor,
} from "@/lib/notifications";
import {
  requireAdminGeneral,
  requireAuthenticatedUser,
} from "@/lib/permissions";

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
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      return auth.response;
    }

    const access = await resolveBusinessAccess(auth.access.userId);

    await ensureNotificationsTable();
    const actorRoles = expandNotificationRoles(access.roles);
    const notifications = await getNotificationsForActor({
      userId: auth.access.userId,
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
        notifications: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminGeneral(req);
    if (!admin.ok) {
      return admin.response;
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
      },
      { status: 500 },
    );
  }
}
