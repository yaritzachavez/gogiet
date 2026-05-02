import { type NextRequest, NextResponse } from "next/server";

import {
  addSupportMessage,
  getOrCreateSupportConversation,
  getSupportAuthUser,
  getSupportConversationMessages,
  listSupportConversations,
} from "@/lib/support";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getSupportAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", thread: null, messages: [] },
        { status: 401 },
      );
    }

    if (!authUser.supportRoles.includes("repartidor")) {
      return NextResponse.json(
        { success: false, error: "No autorizado", thread: null, messages: [] },
        { status: 403 },
      );
    }

    const conversations = await listSupportConversations(authUser, {
      role: "repartidor",
    });
    const thread = conversations[0] ?? null;

    if (!thread) {
      return NextResponse.json({
        success: true,
        thread: null,
        messages: [],
      });
    }

    const messages = await getSupportConversationMessages(authUser, thread.id);

    return NextResponse.json({
      success: true,
      thread: {
        id: thread.id,
        status: thread.status,
        orderId: null,
      },
      messages: (messages ?? []).map((message) => ({
        id: message.id,
        senderId: message.sender_user_id,
        senderType:
          message.sender_role === "admin_general"
            ? "admin"
            : message.sender_role === "system"
              ? "system"
              : "user",
        message: message.message,
        fileUrl: message.attachment_url,
        messageType: message.message_type,
        createdAt: message.created_at,
      })),
    });
  } catch (error) {
    console.error("Error GET /api/delivery/support:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el chat de soporte.",
        thread: null,
        messages: [],
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getSupportAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser.supportRoles.includes("repartidor")) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const message = String(body?.message ?? "").trim();

    if (!message) {
      return NextResponse.json(
        { success: false, error: "El mensaje es obligatorio" },
        { status: 400 },
      );
    }

    const conversationId = await getOrCreateSupportConversation({
      requesterUserId: authUser.userId,
      requesterRole: "repartidor",
      subject: "Soporte repartidor",
    });

    await addSupportMessage({
      conversationId,
      senderUserId: authUser.userId,
      senderRole: "repartidor",
      message,
      messageType: "text",
    });

    return NextResponse.json({
      success: true,
      threadId: conversationId,
    });
  } catch (error) {
    console.error("Error POST /api/delivery/support:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar el mensaje de soporte.",
      },
      { status: 500 },
    );
  }
}
