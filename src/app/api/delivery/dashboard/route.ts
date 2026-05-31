import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";
import { getCurrentDriverDeliveries } from "@/lib/delivery/current-driver-orders";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import { getRequestLoggerContext, logger } from "@/lib/logger";

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
  const requestContext = getRequestLoggerContext(req);

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, ok: false, error: "Token faltante", dashboard: null },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, ok: false, error: "Token inválido", dashboard: null },
        { status: 401 },
      );
    }

    const userId = authUser.user.id;
    console.log("[DELIVERY DASHBOARD] inicio");
    console.log("[DELIVERY DASHBOARD] user", userId);

    const access = await resolveDeliveryAccess(userId);

    if (!access.allowed) {
      return NextResponse.json(
        {
          success: false,
          ok: false,
          error: "No autorizado para acceder al panel de repartidor",
          dashboard: null,
          stats: null,
          activeDeliveries: [],
          availableOffers: [],
          driver: {
            userId,
            email: access.email,
            roles: access.roles,
            operationalStatus: access.operationalStatus,
            canOperate: access.canOperate,
          },
        },
        { status: 403 },
      );
    }

    console.log("[DELIVERY DASHBOARD] driver", {
      userId,
      email: access.email,
      roles: access.roles,
      operationalStatus: access.operationalStatus,
      canOperate: access.canOperate,
    });

    logDbUsage("/api/delivery/dashboard", {
      userId,
      email: access.email,
      role: access.roles,
    });

    const { activeDeliveries } = await getCurrentDriverDeliveries(userId, pool);
    const dashboard = {
      activeDeliveriesCount: activeDeliveries.length,
      completedTodayCount: 0,
      currentDeliveries: activeDeliveries.map((delivery) => ({
        id: delivery.id,
        businessName: delivery.businessName,
        customerName: delivery.customerName,
        address: delivery.address,
        total: delivery.total,
        orderStatus: delivery.status,
        deliveryStatus: delivery.assignmentStatus,
      })),
      completedDeliveriesToday: [],
    };

    console.log(
      "[DELIVERY DASHBOARD] activeDeliveries",
      activeDeliveries.length,
    );
    console.log("[DELIVERY DASHBOARD] offers", 0);

    logger.info(
      "delivery.dashboard_loaded",
      "Dashboard de repartidor calculado",
      {
        ...requestContext,
        activeDeliveriesCount: activeDeliveries.length,
        completedTodayCount: 0,
        availableDeliveriesCount: 0,
      },
    );

    return NextResponse.json({
      success: true,
      ok: true,
      dashboard,
      stats: {
        activeDeliveries: activeDeliveries.length,
        completedDeliveries: 0,
        availableDeliveries: 0,
        earnings: 0,
      },
      activeDeliveries,
      availableOffers: [],
      driver: {
        userId,
        email: access.email,
        roles: access.roles,
        operationalStatus: access.operationalStatus,
        canOperate: access.canOperate,
      },
    });
  } catch (error) {
    const serializedError = serializeError(error);
    console.error("[DELIVERY DASHBOARD ERROR]", serializedError);
    logger.error(
      "delivery.dashboard_error",
      "Error cargando dashboard del repartidor",
      {
        ...requestContext,
        error: serializedError,
      },
    );

    return NextResponse.json(
      {
        success: false,
        ok: false,
        error:
          serializedError && typeof serializedError === "object"
            ? String(
                (serializedError as Record<string, unknown>).message ??
                  "No se pudo cargar el dashboard del repartidor.",
              )
            : "No se pudo cargar el dashboard del repartidor.",
        debug:
          process.env.NODE_ENV === "production" ? undefined : serializedError,
        dashboard: null,
        activeDeliveries: [],
        availableOffers: [],
      },
      { status: 500 },
    );
  }
}
