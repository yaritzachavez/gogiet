import { type NextRequest, NextResponse } from "next/server";

import {
  addSupportMessage,
  getOrCreateSupportConversation,
  getSupportAuthUser,
} from "@/lib/support";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getSupportAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const requesterRole = authUser.supportRoles.includes("cliente")
      ? "cliente"
      : (authUser.supportRoles[0] ?? null);

    if (!requesterRole || requesterRole === "admin_general") {
      return NextResponse.json(
        { error: "No se pudo determinar el rol del solicitante." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const message = String(body?.message ?? "").trim();
    const fileUrl = String(body?.file_url ?? "").trim() || null;
    const orderId = Number(body?.order_id);
    const subject =
      Number.isInteger(orderId) && orderId > 0 ? `Pedido #${orderId}` : null;

    const conversationId = await getOrCreateSupportConversation({
      requesterUserId: authUser.userId,
      requesterRole,
      subject,
    });

    if (message) {
      await addSupportMessage({
        conversationId,
        senderUserId: authUser.userId,
        senderRole: requesterRole,
        message,
        attachmentUrl: fileUrl,
        messageType: fileUrl ? "payment_proof" : "text",
      });
    }

    return NextResponse.json({ success: true, thread_id: conversationId });
  } catch (error) {
    console.error("Error POST /api/support/threads:", error);
    return NextResponse.json(
      {
        error: "No se pudo crear la conversación de soporte.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
