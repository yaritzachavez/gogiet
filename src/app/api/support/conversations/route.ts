import { type NextRequest, NextResponse } from "next/server";

import {
  getOrCreateSupportConversation,
  getSupportAuthUser,
  listSupportConversations,
  resolveRequestedSupportRole,
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
        { success: false, error: "Token inválido o faltante." },
        { status: 401 },
      );
    }

    const requestedRole = req.nextUrl.searchParams.get("role");
    const mine = req.nextUrl.searchParams.get("mine");
    const role = resolveRequestedSupportRole(authUser, requestedRole);
    const status = parseStatus(req.nextUrl.searchParams.get("status"));
    const conversations = await listSupportConversations(authUser, {
      role: mine === "true" ? null : role,
      status,
      mineOnly: mine === "true",
    });

    return NextResponse.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("Error GET /api/support/conversations:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar las conversaciones de soporte.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getSupportAuthUser(req);

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante." },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const role = resolveRequestedSupportRole(authUser, body?.requester_role);

    if (!role || role === "admin_general" || role === "system") {
      return NextResponse.json(
        {
          success: false,
          error: "Rol de soporte inválido para la conversación.",
        },
        { status: 400 },
      );
    }

    const subject = String(body?.subject ?? "").trim() || null;
    const conversationId = await getOrCreateSupportConversation({
      requesterUserId: authUser.userId,
      requesterRole: role,
      subject,
    });

    const [conversation] = await listSupportConversations(authUser, { role });
    const resolvedConversation =
      conversation?.id === conversationId
        ? conversation
        : ((
            await listSupportConversations(authUser, {
              role,
            })
          ).find((item) => item.id === conversationId) ?? null);

    return NextResponse.json({
      success: true,
      conversation_id: conversationId,
      conversation: resolvedConversation,
    });
  } catch (error) {
    console.error("Error POST /api/support/conversations:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo crear o recuperar la conversación.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
