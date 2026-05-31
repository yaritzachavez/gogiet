import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { logDbUsage } from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import { getRequestLoggerContext, logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const requestContext = getRequestLoggerContext(req);

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", deliveries: [], orders: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", deliveries: [], orders: [] },
        { status: 401 },
      );
    }

    const userId = authUser.user.id;
    const access = await resolveDeliveryAccess(userId);

    if (!access.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "No autorizado para acceder al panel de repartidor",
          deliveries: [],
          orders: [],
        },
        { status: 403 },
      );
    }

    logDbUsage("/api/delivery/available", {
      userId,
      email: access.email,
      role: access.roles,
    });

    logger.debug(
      "delivery.available_disabled_for_carousel",
      "Endpoint legado desactivado: las ofertas se hacen por carrusel asignado.",
      {
        ...requestContext,
        userId,
        operationalStatus: access.operationalStatus,
      },
    );

    return NextResponse.json({
      success: true,
      deliveries: [],
      orders: [],
      message:
        "Las entregas se ofrecen directamente por carrusel al repartidor correspondiente.",
    });
  } catch (error) {
    logger.error(
      "delivery.available_error",
      "Error cargando entregas disponibles",
      {
        ...requestContext,
        error,
      },
    );

    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar las entregas disponibles.",
        deliveries: [],
        orders: [],
      },
      { status: 500 },
    );
  }
}
