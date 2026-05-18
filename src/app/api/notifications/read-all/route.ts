import { type NextRequest, NextResponse } from "next/server";

import { resolveBusinessAccess } from "@/lib/business-panel";
import {
  ensureNotificationsTable,
  markAllNotificationsReadForActor,
} from "@/lib/notifications";
import { requireAuthenticatedUser } from "@/lib/permissions";

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      return auth.response;
    }

    await ensureNotificationsTable();

    const access = await resolveBusinessAccess(auth.access.userId);
    const affectedRows = await markAllNotificationsReadForActor({
      userId: auth.access.userId,
      businessIds: access.businessIds,
      roles: access.roles,
    });

    return NextResponse.json({
      success: true,
      updated_count: affectedRows,
    });
  } catch (error) {
    console.error("Error PATCH /api/notifications/read-all:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron marcar las notificaciones como leídas.",
      },
      { status: 500 },
    );
  }
}
