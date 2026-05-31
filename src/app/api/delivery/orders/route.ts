import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { getCurrentDriverDeliveries } from "@/lib/delivery/current-driver-orders";
import { requireDriverAccess } from "@/lib/permissions";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  try {
    return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
  } catch {
    return {
      message: String(error),
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    const access = await requireDriverAccess(
      req,
      authUser?.user?.id ?? null,
      "VIEW_ASSIGNED_DELIVERIES",
      "No puedes ver pedidos de otro repartidor.",
    );

    if (!access.ok) {
      return NextResponse.json(
        {
          success: false,
          ok: false,
          error: "No autorizado para acceder al panel de repartidor",
          orders: [],
          activeDeliveries: [],
          availableOffers: [],
        },
        { status: access.response.status },
      );
    }

    const userId = access.access.userId;

    console.log("[DELIVERY ORDERS] inicio", { userId });
    logDbUsage("/api/delivery/orders", {
      userId,
      email: access.deliveryAccess.email,
      role: access.deliveryAccess.roles,
    });

    const { activeDeliveries } = await getCurrentDriverDeliveries(userId, pool);

    return NextResponse.json({
      success: true,
      ok: true,
      orders: activeDeliveries,
      activeDeliveries,
      availableOffers: [],
    });
  } catch (error) {
    const serializedError = serializeError(error);
    console.error("[DELIVERY ORDERS ERROR]", serializedError);

    return NextResponse.json(
      {
        success: false,
        ok: false,
        error:
          serializedError && typeof serializedError === "object"
            ? String(
                (serializedError as Record<string, unknown>).message ??
                  "No se pudieron cargar las entregas del repartidor.",
              )
            : "No se pudieron cargar las entregas del repartidor.",
        debug:
          process.env.NODE_ENV === "production" ? undefined : serializedError,
        orders: [],
        activeDeliveries: [],
        availableOffers: [],
      },
      { status: 500 },
    );
  }
}
