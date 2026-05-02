import { type NextRequest, NextResponse } from "next/server";

import {
  getSupportAuthUser,
  getSupportConversationDetail,
  getSupportConversationMessages,
  type SupportConversationStatus,
  updateSupportConversationStatus,
} from "@/lib/support";

function parseConversationId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseStatus(value: unknown) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  return status === "open" || status === "pending" || status === "closed"
    ? (status as SupportConversationStatus)
    : null;
}

export async function GET(
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
    const conversationId = parseConversationId(id);

    if (!conversationId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const thread = await getSupportConversationDetail(authUser, conversationId);

    if (!thread) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 },
      );
    }

    const messages = await getSupportConversationMessages(
      authUser,
      conversationId,
    );

    return NextResponse.json({
      success: true,
      thread: {
        ...thread,
        user_id: thread.requester_user_id,
        order_id: null,
        customer_name: thread.requester_name || "Usuario sin nombre",
        customer_email: thread.requester_email || "",
        messages: (messages ?? []).map((message) => ({
          id: message.id,
          thread_id: conversationId,
          sender_id: message.sender_user_id,
          sender_type:
            message.sender_role === "admin_general"
              ? "admin"
              : message.sender_role === "system"
                ? "system"
                : "user",
          sender_role: message.sender_role,
          message: message.message,
          file_url: message.attachment_url,
          attachment_url: message.attachment_url,
          message_type: message.message_type,
          created_at: message.created_at,
        })),
      },
    });
  } catch (error) {
    console.error("Error GET /api/admin/support/threads/[id]:", error);
    return NextResponse.json(
      {
        error: "No se pudo cargar la conversación.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
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
    const conversationId = parseConversationId(id);
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const status = parseStatus(body?.status);

    if (!conversationId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }

    await updateSupportConversationStatus(authUser, conversationId, status);

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("Error PATCH /api/admin/support/threads/[id]:", error);
    return NextResponse.json(
      {
        error: "No se pudo actualizar la conversación.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
