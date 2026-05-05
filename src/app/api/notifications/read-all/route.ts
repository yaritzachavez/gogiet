import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import {
  ensureNotificationsTable,
  markAllNotificationsReadForActor,
} from "@/lib/notifications";

export async function PATCH(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    await ensureNotificationsTable();

    const access = await resolveBusinessAccess(authUser.user.id);
    const affectedRows = await markAllNotificationsReadForActor({
      userId: authUser.user.id,
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
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
