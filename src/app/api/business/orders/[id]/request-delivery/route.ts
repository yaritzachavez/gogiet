import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import {
  DeliveryAssignmentError,
  requestCourierAssignment,
} from "@/lib/delivery-assignments";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params;
    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Pedido invalido" },
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
      message: result.message,
    });
  } catch (error) {
    console.error(
      "Error POST /api/business/orders/[id]/request-delivery:",
      error,
    );

    if (error instanceof DeliveryAssignmentError) {
      return NextResponse.json(
        { success: false, error: error.message },
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
