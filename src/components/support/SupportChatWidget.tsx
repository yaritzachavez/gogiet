"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { fetchWithSession, getClientAuthToken } from "@/lib/client-auth";

type SupportRole = "cliente" | "repartidor" | "vendedor" | "negocio";

type SupportConversation = {
  id: number;
  requester_role: string;
  status: "open" | "pending" | "closed";
  subject: string | null;
  unread_count: number;
};

type SupportMessage = {
  id: number;
  sender_user_id: number | null;
  sender_role: string | null;
  message: string;
  attachment_url: string | null;
  created_at: string;
};

type ConversationListResponse = {
  success: boolean;
  conversations: SupportConversation[];
  error?: string;
};

type MessagesResponse = {
  success: boolean;
  conversation: SupportConversation;
  messages: SupportMessage[];
  error?: string;
};

type CreateConversationResponse = {
  success: boolean;
  conversation_id: number;
  conversation: SupportConversation | null;
  error?: string;
};

function getStoredToken() {
  return getClientAuthToken();
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Ahora";
  }

  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStoredUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawUser = window.localStorage.getItem("user");
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as {
      id?: number;
      email?: string;
      roles?: string[];
    };
  } catch (error) {
    console.error("Error leyendo usuario local para soporte:", error);
    return null;
  }
}

function normalizeSupportRole(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "delivery" || normalized === "driver") {
    return "repartidor";
  }

  if (normalized === "user") {
    return "cliente";
  }

  if (normalized === "business_staff") {
    return "vendedor";
  }

  if (normalized === "business_admin") {
    return "negocio";
  }

  return normalized;
}

export function SupportChatWidget({
  requesterRole,
  title,
  description,
  buttonLabel = "Abrir chat con soporte",
  subject = null,
  buttonClassName = "",
  floating = false,
}: {
  requesterRole: SupportRole;
  title: string;
  description: string;
  buttonLabel?: string;
  subject?: string | null;
  buttonClassName?: string;
  floating?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState("");
  const { user } = useAuth();
  const localUser = useMemo(
    () =>
      user
        ? {
            id: user.id,
            roles: Array.isArray(user.roles) ? user.roles : [],
          }
        : getStoredUser(),
    [user],
  );

  const conversationsQuery = useQuery({
    queryKey: ["support-conversations", requesterRole],
    queryFn: async () => {
      const token = getStoredToken();

      if (!token) {
        throw new Error("Debes iniciar sesión nuevamente.");
      }

      const response = await fetchWithSession(
        `/api/support/conversations?mine=true`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      const payload = (await response.json()) as ConversationListResponse;

      if (requesterRole === "repartidor") {
        console.log("[support/repartidor] GET conversations mine=true", {
          userId: localUser?.id ?? null,
          userEmail: localUser?.email ?? null,
          userRoles: localUser?.roles ?? [],
          payload,
        });
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo cargar el soporte.");
      }

      return payload.conversations ?? [];
    },
    refetchInterval: 5000,
  });

  const activeConversation = useMemo(() => {
    const conversations = conversationsQuery.data ?? [];

    const matchingOpenConversation = conversations.find(
      (conversation) =>
        normalizeSupportRole(conversation.requester_role) === requesterRole &&
        (conversation.status === "open" || conversation.status === "pending"),
    );

    if (matchingOpenConversation) {
      return matchingOpenConversation;
    }

    const anyOpenConversation = conversations.find(
      (conversation) =>
        conversation.status === "open" || conversation.status === "pending",
    );

    return anyOpenConversation ?? conversations[0] ?? null;
  }, [conversationsQuery.data, requesterRole]);
  const unreadCount = useMemo(
    () =>
      (conversationsQuery.data ?? []).reduce(
        (sum, conversation) => sum + Number(conversation.unread_count ?? 0),
        0,
      ),
    [conversationsQuery.data],
  );

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const token = getStoredToken();

      if (!token) {
        throw new Error("Debes iniciar sesión nuevamente.");
      }

      const response = await fetchWithSession("/api/support/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requester_role: requesterRole,
          subject,
        }),
      });
      const payload = (await response.json()) as CreateConversationResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error || "No se pudo crear la conversación de soporte.",
        );
      }

      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["support-conversations", requesterRole],
      });
    },
  });

  useEffect(() => {
    if (!open || activeConversation || createConversationMutation.isPending) {
      return;
    }

    createConversationMutation.mutate();
  }, [activeConversation, createConversationMutation, open]);

  const messagesQuery = useQuery({
    queryKey: ["support-messages", activeConversation?.id],
    enabled: open && Boolean(activeConversation?.id),
    queryFn: async () => {
      const token = getStoredToken();

      if (!token || !activeConversation?.id) {
        throw new Error("Debes iniciar sesión nuevamente.");
      }

      if (requesterRole === "repartidor") {
        console.log("[support/repartidor] conversationId usado", {
          conversationId: activeConversation.id,
        });
      }

      const response = await fetchWithSession(
        `/api/support/conversations/${activeConversation.id}/messages`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      const payload = (await response.json()) as MessagesResponse;

      if (requesterRole === "repartidor") {
        console.log("[support/repartidor] GET messages", {
          userId: localUser?.id ?? null,
          userEmail: localUser?.email ?? null,
          userRoles: localUser?.roles ?? [],
          conversationId: activeConversation.id,
          payload,
        });
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudieron cargar los mensajes.");
      }

      return payload.messages ?? [];
    },
    refetchInterval: open ? 5000 : false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const token = getStoredToken();

      if (!token || !activeConversation?.id) {
        throw new Error("No hay una conversación activa.");
      }

      const message = draft.trim();
      if (!message) {
        throw new Error("Escribe un mensaje antes de enviarlo.");
      }

      const response = await fetchWithSession(
        `/api/support/conversations/${activeConversation.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
          }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar el mensaje.");
      }
    },
    onSuccess: async () => {
      setDraft("");
      setActionError("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["support-conversations", requesterRole],
        }),
        queryClient.invalidateQueries({
          queryKey: ["support-messages", activeConversation?.id],
        }),
      ]);
    },
    onError: (error) => {
      setActionError(
        error instanceof Error
          ? error.message
          : "No se pudo enviar el mensaje.",
      );
    },
  });

  const triggerClasses = floating
    ? `fixed bottom-5 right-5 z-40 rounded-full bg-[#FF6A00] px-5 py-3 text-[#FFFDF8] shadow-xl hover:bg-orange-600 ${buttonClassName}`
    : buttonClassName ||
      "inline-flex items-center justify-center gap-2 rounded-xl border border-orange-300 bg-white px-4 py-2 font-semibold text-orange-700 shadow-sm hover:bg-orange-50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClasses}
      >
        <MessageCircle className="h-4 w-4" />
        <span>{buttonLabel}</span>
        {unreadCount > 0 ? (
          <Badge className="rounded-full bg-white/90 text-orange-600">
            {unreadCount}
          </Badge>
        ) : null}
      </button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setActionError("");
          }
        }}
      >
        <DialogContent className="max-w-2xl border-[#F3D6B8] bg-[#FFFDF8] p-0">
          <DialogHeader className="border-b border-[#F3D6B8] px-6 py-5">
            <DialogTitle className="text-[#2B1A12]">{title}</DialogTitle>
            <DialogDescription className="text-[#7A5A45]">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            {conversationsQuery.error ? (
              <div className="rounded-2xl border border-[#F3D6B8] bg-[#FFF7ED] px-4 py-3 text-sm text-[#9A3412]">
                {conversationsQuery.error instanceof Error
                  ? conversationsQuery.error.message
                  : "No se pudo cargar el soporte."}
              </div>
            ) : null}

            {actionError ? (
              <div className="rounded-2xl border border-[#F3D6B8] bg-[#FFF7ED] px-4 py-3 text-sm text-[#9A3412]">
                {actionError}
              </div>
            ) : null}

            <div className="max-h-[420px] min-h-[240px] space-y-3 overflow-y-auto rounded-3xl border border-[#F3D6B8] bg-[#FFF7ED] p-4">
              {messagesQuery.isLoading ||
              createConversationMutation.isPending ? (
                <p className="text-sm text-[#7A5A45]">
                  Cargando conversación...
                </p>
              ) : (messagesQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-[#7A5A45]">
                  Aún no hay mensajes. Puedes iniciar la conversación ahora.
                </p>
              ) : (
                (messagesQuery.data ?? []).map((message) => {
                  const isOwnMessage =
                    normalizeSupportRole(message.sender_role) === requesterRole;

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[82%] rounded-3xl px-4 py-3 text-sm shadow-sm ${
                          isOwnMessage
                            ? "bg-[#FF6A00] text-[#FFFDF8]"
                            : "bg-[#FFFDF8] text-[#2B1A12]"
                        }`}
                      >
                        <p>{message.message}</p>
                        {message.attachment_url ? (
                          <a
                            href={message.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className={`mt-2 block text-xs underline ${
                              isOwnMessage
                                ? "text-[#FFF7ED]/90"
                                : "text-orange-600"
                            }`}
                          >
                            Ver adjunto
                          </a>
                        ) : null}
                        <p
                          className={`mt-2 text-[11px] ${
                            isOwnMessage
                              ? "text-[#FFF7ED]/80"
                              : "text-[#9A7A62]"
                          }`}
                        >
                          {formatDateTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escribe tu mensaje para soporte..."
                className="min-h-24 flex-1 rounded-2xl border border-orange-200 px-4 py-3 text-sm text-[#2B1A12] outline-none transition placeholder:text-[#9A7A62] focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
              <Button
                type="button"
                onClick={() => sendMessageMutation.mutate()}
                disabled={
                  sendMessageMutation.isPending ||
                  createConversationMutation.isPending
                }
                className="h-12 rounded-2xl bg-[#FF6A00] px-5 text-[#FFFDF8] hover:bg-orange-600"
              >
                <Send className="mr-2 h-4 w-4" />
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
