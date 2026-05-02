import { type NextRequest, NextResponse } from "next/server";

import {
  addSupportMessage,
  canAccessSupportConversation,
  getSupportAuthUser,
  getSupportConversationDetail,
  getSupportConversationMessages,
  type SupportRole,
} from "@/lib/support";

function parseConversationId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await getSupportAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante." },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const conversationId = parseConversationId(id);

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: "ID de conversación inválido." },
        { status: 400 },
      );
    }

    const conversation = await getSupportConversationDetail(
      authUser,
      conversationId,
    );

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversación no encontrada." },
        { status: 404 },
      );
    }

    const messages = await getSupportConversationMessages(
      authUser,
      conversationId,
    );

    return NextResponse.json({
      success: true,
      conversation,
      messages: messages ?? [],
    });
  } catch (error) {
    console.error("Error GET /api/support/conversations/[id]/messages:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar los mensajes.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await getSupportAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante." },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const conversationId = parseConversationId(id);

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: "ID de conversación inválido." },
        { status: 400 },
      );
    }

    const conversation = await canAccessSupportConversation(
      authUser,
      conversationId,
    );

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "No autorizado para esta conversación." },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const message = String(body?.message ?? "").trim();
    const attachmentUrl = String(body?.attachment_url ?? "").trim() || null;
    const messageType = String(body?.message_type ?? "text")
      .trim()
      .toLowerCase();

    if (!message) {
      return NextResponse.json(
        { success: false, error: "El mensaje es obligatorio." },
        { status: 400 },
      );
    }

    const senderRole: SupportRole | null = authUser.isAdminGeneral
      ? "admin_general"
      : conversation.requester_role;

    await addSupportMessage({
      conversationId,
      senderUserId: authUser.userId,
      senderRole,
      message,
      attachmentUrl,
      messageType:
        messageType === "payment_proof" || messageType === "image"
          ? messageType
          : "text",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "Error POST /api/support/conversations/[id]/messages:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo guardar el mensaje.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
