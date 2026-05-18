import { type NextRequest, NextResponse } from "next/server";

import { resolveBusinessAccess } from "@/lib/business-panel";
import {
  ensureNotificationsTable,
  markNotificationReadForActor,
} from "@/lib/notifications";
import { requireAuthenticatedUser } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      return auth.response;
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

    const access = await resolveBusinessAccess(auth.access.userId);
    const affectedRows = await markNotificationReadForActor(notificationId, {
      userId: auth.access.userId,
      businessIds: access.businessIds,
      roles: access.roles,
    });

    if (!affectedRows) {
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
      },
      { status: 500 },
    );
  }
}
