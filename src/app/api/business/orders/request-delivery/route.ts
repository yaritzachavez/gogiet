import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import {
  DeliveryAssignmentError,
  requestCourierAssignment,
} from "@/lib/delivery-assignments";

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token invalido" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    const orderId = Number(body?.order_id);

    console.log("[api/request-delivery] payload recibido:", {
      order_id: body?.order_id,
      parsedOrderId: orderId,
      userId: authUser.user.id,
    });

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "order_id es obligatorio y debe ser valido" },
        { status: 400 },
      );
    }

    const result = await requestCourierAssignment({
      orderId,
      userId: authUser.user.id,
    });

    return NextResponse.json({
      success: true,
      assignedDeliveryUserId: result.courierId,
      delivery_user_id: result.courierId,
      delivery_name: result.courierName,
      delivery_phone: result.courierPhone,
      delivery_profile_image_url: result.courierAvatarUrl,
      message: result.message,
    });
  } catch (error) {
    console.error("Error POST /api/business/orders/request-delivery:", error);

    if (error instanceof DeliveryAssignmentError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          ...(error.debug ? { debug: error.debug } : {}),
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo solicitar el repartidor.",
      },
      { status: 500 },
    );
  }
}
