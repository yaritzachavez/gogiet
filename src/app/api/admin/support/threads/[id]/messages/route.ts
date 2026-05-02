import { type NextRequest, NextResponse } from "next/server";

import {
  addSupportMessage,
  canAccessSupportConversation,
  getSupportAuthUser,
} from "@/lib/support";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await getSupportAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    if (!authUser.isAdminGeneral) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await context.params;
    const conversationId = Number(id);
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const message = String(body?.message ?? "").trim();
    const attachmentUrl = String(body?.file_url ?? "").trim() || null;
    const messageType = String(body?.message_type ?? "text")
      .trim()
      .toLowerCase();

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    if (!(await canAccessSupportConversation(authUser, conversationId))) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 },
      );
    }

    if (!message) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
    }

    await addSupportMessage({
      conversationId,
      senderUserId: authUser.userId,
      senderRole: "admin_general",
      message,
      attachmentUrl,
      messageType:
        messageType === "image" || messageType === "payment_proof"
          ? messageType
          : "text",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Error POST /api/admin/support/threads/[id]/messages:",
      error,
    );
    return NextResponse.json(
      {
        error: "No se pudo enviar el mensaje.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
