import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { apiErrorResponse, safeErrorResponse } from "@/lib/api-error";
import pool, { logDbUsage } from "@/lib/db";
import { getCurrentDriverDeliveries } from "@/lib/delivery/current-driver-orders";
import { requireDriverAccess } from "@/lib/permissions";

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
      return apiErrorResponse(req, {
        code: access.response.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        message: "No autorizado para acceder al panel de repartidor",
        extra: {
          ok: false,
          orders: [],
          activeDeliveries: [],
          availableOffers: [],
        },
      });
    }

    const userId = access.access.userId;

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
    return safeErrorResponse(
      "delivery.orders.get_error",
      error,
      "No se pudieron cargar las entregas del repartidor.",
      500,
      {
        request: req,
        ok: false,
        orders: [],
        activeDeliveries: [],
        availableOffers: [],
      },
    );
  }
}
