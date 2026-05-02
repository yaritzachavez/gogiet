import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import {
  DeliveryAssignmentError,
  respondToCourierAssignment,
} from "@/lib/delivery-assignments";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> },
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

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const { orderId: rawOrderId } = await context.params;
    const orderId = Number(rawOrderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "Pedido invalido" },
        { status: 400 },
      );
    }

    if (action !== "accept" && action !== "reject") {
      return NextResponse.json(
        { success: false, error: "La accion debe ser accept o reject" },
        { status: 400 },
      );
    }

    const result = await respondToCourierAssignment({
      orderId,
      userId: authUser.user.id,
      action,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Error PATCH /api/delivery/assignments/[orderId]:", error);

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
            : "No se pudo responder la asignacion.",
      },
      { status: 500 },
    );
  }
}
