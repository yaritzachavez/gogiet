import { type NextRequest, NextResponse } from "next/server";

import {
  getSupportAuthUser,
  listSupportConversations,
  type SupportConversationStatus,
} from "@/lib/support";

function parseStatus(value: string | null): SupportConversationStatus | "all" {
  if (value === "open" || value === "pending" || value === "closed") {
    return value;
  }

  return "all";
}

export async function GET(req: NextRequest) {
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

    const threads = await listSupportConversations(authUser, {
      status: parseStatus(req.nextUrl.searchParams.get("status")),
    });

    return NextResponse.json({
      success: true,
      threads: threads.map((thread) => ({
        id: thread.id,
        user_id: thread.requester_user_id,
        order_id: null,
        status: thread.status,
        created_at: thread.created_at,
        customer_name: thread.requester_name,
        customer_email: thread.requester_email,
        requester_role: thread.requester_role,
        last_message: thread.last_message || "Sin mensajes",
        last_message_at: thread.last_message_at,
        last_message_type: "text",
        last_file_url: thread.last_attachment_url || "",
        payment_method: "",
        order_status: "",
        unread_count: thread.unread_count,
        subject: thread.subject,
      })),
    });
  } catch (error) {
    console.error("Error GET /api/admin/support/threads:", error);
    return NextResponse.json(
      {
        error: "No se pudieron cargar las conversaciones de soporte.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
