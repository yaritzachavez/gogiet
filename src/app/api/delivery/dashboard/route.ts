import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import {
  forbiddenResponse,
  unauthorizedResponse,
} from "@/lib/api-auth-response";
import { getSafeErrorMessage } from "@/lib/api-error";
import pool, { logDbUsage } from "@/lib/db";
import { getCurrentDriverDeliveries } from "@/lib/delivery/current-driver-orders";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import { getRequestLoggerContext, logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const requestContext = getRequestLoggerContext(req);

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return unauthorizedResponse(
        req,
        { ok: false, dashboard: null },
        "Token faltante",
      );
    }

    if (!authUser?.user) {
      return unauthorizedResponse(
        req,
        { ok: false, dashboard: null },
        "Token inválido",
      );
    }

    const userId = authUser.user.id;
    logger.info(
      "delivery.dashboard_request",
      "Solicitud de dashboard de repartidor",
      {
        ...requestContext,
        userId,
      },
    );

    const access = await resolveDeliveryAccess(userId);

    if (!access.allowed) {
      return forbiddenResponse(
        req,
        {
          ok: false,
          dashboard: null,
          stats: null,
          activeDeliveries: [],
          availableOffers: [],
          driver: {
            userId,
            roles: access.roles,
            operationalStatus: access.operationalStatus,
            canOperate: access.canOperate,
          },
        },
        "No autorizado para acceder al panel de repartidor",
      );
    }

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
        roles: access.roles,
        operationalStatus: access.operationalStatus,
        canOperate: access.canOperate,
      },
    });
  } catch (error) {
    logger.error(
      "delivery.dashboard_error",
      "Error cargando dashboard del repartidor",
      {
        ...requestContext,
        error,
      },
    );

    return NextResponse.json(
      {
        success: false,
        ok: false,
        error: getSafeErrorMessage(
          error,
          "No se pudo cargar el dashboard del repartidor.",
        ),
        dashboard: null,
        activeDeliveries: [],
        availableOffers: [],
      },
      { status: 500 },
    );
  }
}
