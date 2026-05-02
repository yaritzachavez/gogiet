"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getClientAuthToken } from "@/lib/client-auth";
import { cn } from "@/lib/utils";

type SupportThread = {
  id: number;
  user_id: number;
  order_id: number | null;
  status: "open" | "pending" | "closed";
  created_at: string;
  customer_name: string;
  customer_email: string;
  requester_role?: string;
  last_message: string;
  last_message_at: string | null;
  last_message_type: string;
  last_file_url: string;
  payment_method: string;
  order_status: string;
  unread_count?: number;
  subject?: string | null;
};

type SupportMessage = {
  id: number;
  sender_id: number | null;
  sender_type: "user" | "admin" | "system";
  message: string;
  file_url: string | null;
  message_type: "text" | "image" | "payment_proof";
  created_at: string;
};

type SupportThreadDetail = {
  id: number;
  user_id: number;
  order_id: number | null;
  status: "open" | "pending" | "closed";
  created_at: string;
  customer_name: string;
  customer_email: string;
  requester_role?: string;
  subject?: string | null;
  customer_phone?: string | null;
  total_amount?: number | string | null;
  order_created_at?: string | null;
  comprobante_pago_url?: string | null;
  payment_method?: string | null;
  order_status?: string | null;
  messages: SupportMessage[];
};

type ThreadListResponse = {
  success: boolean;
  conversations?: Array<{
    id: number;
    requester_user_id: number;
    requester_role?: string;
    status: "open" | "pending" | "closed";
    subject?: string | null;
    created_at: string;
    requester_name?: string;
    requester_email?: string;
    last_message?: string;
    last_message_at?: string | null;
    last_attachment_url?: string | null;
    unread_count?: number;
  }>;
  error?: string;
};

type ThreadDetailResponse = {
  success: boolean;
  conversation?: {
    id: number;
    requester_user_id: number;
    requester_role?: string;
    status: "open" | "pending" | "closed";
    subject?: string | null;
    created_at: string;
    requester_name?: string;
    requester_email?: string;
  };
  messages?: Array<{
    id: number;
    sender_user_id: number | null;
    sender_role: string | null;
    message: string;
    attachment_url: string | null;
    message_type?: string;
    created_at: string;
  }>;
  error?: string;
};

const CATEGORY_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "clientes", label: "Clientes" },
  { key: "repartidores", label: "Repartidores" },
  { key: "negocios", label: "Negocios" },
] as const;

type CategoryFilterKey = (typeof CATEGORY_FILTERS)[number]["key"];
type SupportCategory = "clientes" | "repartidores" | "negocios" | "otros";

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeRequesterRole(value?: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) return "cliente";

  if (
    normalized === "cliente" ||
    normalized === "user" ||
    normalized === "customer"
  ) {
    return "cliente";
  }

  if (
    normalized === "repartidor" ||
    normalized === "delivery" ||
    normalized === "driver"
  ) {
    return "repartidor";
  }

  if (
    normalized === "negocio" ||
    normalized === "business" ||
    normalized === "business_admin"
  ) {
    return "negocio";
  }

  if (
    normalized === "vendedor" ||
    normalized === "seller" ||
    normalized === "business_staff"
  ) {
    return "vendedor";
  }

  if (normalized === "admin_general") {
    return "admin_general";
  }

  return normalized;
}

function getCategoryFromRole(value?: string): SupportCategory {
  const normalizedRole = normalizeRequesterRole(value);

  if (normalizedRole === "cliente") return "clientes";
  if (normalizedRole === "repartidor") return "repartidores";
  if (normalizedRole === "negocio" || normalizedRole === "vendedor") {
    return "negocios";
  }

  return "otros";
}

function formatRoleLabel(value?: string) {
  const normalizedRole = normalizeRequesterRole(value);

  const labels: Record<string, string> = {
    cliente: "Cliente",
    repartidor: "Repartidor",
    vendedor: "Vendedor",
    negocio: "Negocio",
    admin_general: "Administrador",
  };

  return labels[normalizedRole] ?? formatLabel(normalizedRole);
}

export function AdminChatPanel() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeThread, setActiveThread] = useState<SupportThreadDetail | null>(
    null,
  );
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [validatingPayment, setValidatingPayment] = useState(false);

  const mapConversationToThread = useCallback(
    (
      conversation: NonNullable<ThreadListResponse["conversations"]>[number],
    ): SupportThread => ({
      id: Number(conversation.id),
      user_id: Number(conversation.requester_user_id),
      order_id: null,
      status: conversation.status,
      created_at: conversation.created_at,
      customer_name: conversation.requester_name || "Usuario sin nombre",
      customer_email: conversation.requester_email || "",
      requester_role: conversation.requester_role,
      last_message: conversation.last_message || "",
      last_message_at: conversation.last_message_at || null,
      last_message_type: "text",
      last_file_url: conversation.last_attachment_url || "",
      payment_method: "",
      order_status: "",
      unread_count: Number(conversation.unread_count ?? 0),
      subject: conversation.subject || null,
    }),
    [],
  );

  const mapDetailResponseToThread = useCallback(
    (payload: ThreadDetailResponse): SupportThreadDetail | null => {
      if (!payload.conversation) {
        return null;
      }

      return {
        id: Number(payload.conversation.id),
        user_id: Number(payload.conversation.requester_user_id),
        order_id: null,
        status: payload.conversation.status,
        created_at: payload.conversation.created_at,
        customer_name:
          payload.conversation.requester_name || "Usuario sin nombre",
        customer_email: payload.conversation.requester_email || "",
        requester_role: payload.conversation.requester_role,
        subject: payload.conversation.subject || null,
        messages: Array.isArray(payload.messages)
          ? payload.messages.map((message) => ({
              id: Number(message.id),
              sender_id: message.sender_user_id,
              sender_type:
                message.sender_role === "admin_general"
                  ? "admin"
                  : message.sender_role === "system"
                    ? "system"
                    : "user",
              message: message.message,
              file_url: message.attachment_url,
              message_type:
                message.message_type === "image" ||
                message.message_type === "payment_proof"
                  ? message.message_type
                  : "text",
              created_at: message.created_at,
            }))
          : [],
      };
    },
    [],
  );

  const loadThreads = useCallback(
    async (silent = false) => {
      const token = getClientAuthToken();

      if (!silent) {
        setTokenLoading(false);
      }

      console.log("ADMIN TOKEN", token);

      if (!token) {
        setSessionExpired(true);
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        if (!silent) {
          setLoading(false);
        }
        return;
      }

      try {
        setSessionExpired(false);
        if (!silent) {
          setLoading(true);
        }
        setError("");

        const response = await fetch(`/api/support/conversations`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = (await response.json()) as ThreadListResponse;
        console.log("CONVERSATIONS RESPONSE", payload);

        if (!response.ok || !payload.success) {
          if (response.status === 401 || response.status === 403) {
            setSessionExpired(true);
          }
          console.error("Error real cargando soporte:", {
            status: response.status,
            body: payload,
          });
          setError(
            payload.error ||
              "No se pudieron cargar las conversaciones de soporte.",
          );
          return;
        }

        const mappedThreads = Array.isArray(payload.conversations)
          ? payload.conversations.map(mapConversationToThread)
          : [];

        setThreads(mappedThreads);
        setActiveId((current) => current ?? mappedThreads[0]?.id ?? null);
      } catch (fetchError) {
        console.error("Error cargando soporte:", fetchError);
        setError("No se pudieron cargar las conversaciones de soporte.");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [mapConversationToThread],
  );

  const loadThreadDetail = useCallback(
    async (threadId: number, silent = false) => {
      const token = getClientAuthToken();

      if (!token) {
        setSessionExpired(true);
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }

      try {
        if (!silent) {
          setDetailLoading(true);
        }
        const response = await fetch(
          `/api/support/conversations/${threadId}/messages`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const payload = (await response.json()) as ThreadDetailResponse;

        if (!response.ok || !payload.success) {
          if (response.status === 401 || response.status === 403) {
            setSessionExpired(true);
          }
          console.error("Error real cargando detalle de soporte:", {
            status: response.status,
            body: payload,
          });
          setError(payload.error || "No se pudo cargar la conversación.");
          return;
        }

        setActiveThread(mapDetailResponseToThread(payload));
      } catch (fetchError) {
        console.error("Error cargando detalle de soporte:", fetchError);
        setError("No se pudo cargar la conversación.");
      } finally {
        if (!silent) {
          setDetailLoading(false);
        }
      }
    },
    [mapDetailResponseToThread],
  );

  useEffect(() => {
    setTokenLoading(true);
    loadThreads();

    const intervalId = window.setInterval(() => {
      loadThreads(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadThreads]);

  useEffect(() => {
    if (activeId) {
      loadThreadDetail(activeId);
    }

    if (!activeId) return;

    const intervalId = window.setInterval(() => {
      loadThreadDetail(activeId, true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activeId, loadThreadDetail]);

  const threadCounters = useMemo(() => {
    const counters = {
      all: threads.length,
      clientes: 0,
      repartidores: 0,
      negocios: 0,
    };

    for (const thread of threads) {
      const category = getCategoryFromRole(thread.requester_role);

      if (category === "clientes") counters.clientes += 1;
      if (category === "repartidores") counters.repartidores += 1;
      if (category === "negocios") counters.negocios += 1;
    }

    return counters;
  }, [threads]);

  const filteredThreads = useMemo(() => {
    if (categoryFilter === "all") return threads;

    return threads.filter(
      (thread) => getCategoryFromRole(thread.requester_role) === categoryFilter,
    );
  }, [categoryFilter, threads]);

  useEffect(() => {
    if (filteredThreads.length === 0) {
      setActiveId(null);
      setActiveThread(null);
      return;
    }

    const activeThreadStillVisible = filteredThreads.some(
      (thread) => thread.id === activeId,
    );

    if (!activeThreadStillVisible) {
      setActiveId(filteredThreads[0]?.id ?? null);
    }
  }, [activeId, filteredThreads]);

  const handleSend = async () => {
    if (!message.trim() || !activeThread) return;

    const token = getClientAuthToken();
    if (!token) {
      setSessionExpired(true);
      setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    try {
      setSending(true);
      const response = await fetch(
        `/api/support/conversations/${activeThread.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: message.trim(),
          }),
        },
      );

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        if (response.status === 401 || response.status === 403) {
          setSessionExpired(true);
        }
        throw new Error(payload.error || "No se pudo enviar el mensaje.");
      }

      setMessage("");
      await loadThreadDetail(activeThread.id);
      await loadThreads();
    } catch (sendError) {
      console.error("Error enviando mensaje de soporte:", sendError);
      setError("No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  };

  const handleUpdateThreadStatus = async (
    status: "open" | "pending" | "closed",
  ) => {
    if (!activeThread) return;
    const token = getClientAuthToken();
    if (!token) {
      setSessionExpired(true);
      setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    try {
      setUpdatingStatus(true);
      const response = await fetch(
        `/api/admin/support/threads/${activeThread.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status }),
        },
      );
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        if (response.status === 401 || response.status === 403) {
          setSessionExpired(true);
        }
        throw new Error(payload.error || "No se pudo actualizar el estado.");
      }

      setActiveThread((current) =>
        current ? { ...current, status } : current,
      );
      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeThread.id ? { ...thread, status } : thread,
        ),
      );
    } catch (statusError) {
      console.error("Error actualizando estado de soporte:", statusError);
      setError("No se pudo actualizar el estado de la conversación.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleValidatePayment = async (action: "approve" | "reject") => {
    if (!activeThread?.order_id) return;

    const token = getClientAuthToken();
    if (!token) {
      setSessionExpired(true);
      setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    const reason =
      action === "reject"
        ? (window.prompt("Indica el motivo del rechazo:", "")?.trim() ?? "")
        : "";

    if (action === "reject" && !reason) return;

    try {
      setValidatingPayment(true);

      const response = await fetch(
        `/api/admin/orders/${activeThread.order_id}/payment`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            reason: action === "reject" ? reason : undefined,
          }),
        },
      );

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo validar el pago.");
      }

      await loadThreadDetail(activeThread.id);
      await loadThreads();
    } catch (validationError) {
      console.error("Error validando pago desde soporte:", validationError);
      setError("No se pudo validar el pago desde soporte.");
    } finally {
      setValidatingPayment(false);
    }
  };

  const isTransferPending =
    activeThread?.payment_method === "transferencia" &&
    activeThread?.order_status === "por_validar_pago";

  return (
    <section className="space-y-4 rounded-[26px] border border-white/40 bg-white/90 p-4 shadow-xl ring-1 ring-white/70 transition dark:border-white/10 dark:bg-white/10 dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-orange-500">
            Comunicaciones
          </p>
          <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
            Soporte, ayuda y comprobantes
          </h3>
        </div>
        <Badge className="rounded-full bg-orange-500/10 text-orange-600">
          Nuevos:{" "}
          {threads.reduce(
            (sum, thread) => sum + Number(thread.unread_count ?? 0),
            0,
          )}
        </Badge>
      </div>

      {tokenLoading ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          Validando sesión del administrador...
        </div>
      ) : null}

      {sessionExpired ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Tu sesión expiró. Vuelve a iniciar sesión.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm text-zinc-600">
        {CATEGORY_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setCategoryFilter(item.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 transition",
              categoryFilter === item.key
                ? "border-orange-400 bg-orange-500/10 text-orange-600"
                : "border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5",
            )}
          >
            {item.label}
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-zinc-600">
              {item.key === "all"
                ? threadCounters.all
                : item.key === "clientes"
                  ? threadCounters.clientes
                  : item.key === "repartidores"
                    ? threadCounters.repartidores
                    : threadCounters.negocios}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              Cargando conversaciones...
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              No hay conversaciones para mostrar.
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setActiveId(thread.id)}
                className={cn(
                  "w-full rounded-2xl border px-3 py-3 text-left shadow-sm transition",
                  thread.id === activeId
                    ? "border-orange-400 bg-orange-50 dark:bg-white/10"
                    : "border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      {thread.status}
                    </span>
                    <Badge className="rounded-full bg-orange-500/10 text-orange-700">
                      {formatRoleLabel(thread.requester_role)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {thread.last_message_type === "payment_proof" ? (
                      <Badge className="rounded-full bg-orange-500/15 text-orange-700">
                        Transferencia
                      </Badge>
                    ) : null}
                    {Number(thread.unread_count ?? 0) > 0 ? (
                      <Badge className="rounded-full bg-orange-500 text-white">
                        {thread.unread_count}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {thread.customer_name}
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-300">
                  Conversation ID: {thread.id}
                </p>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                  Categoría: {formatRoleLabel(thread.requester_role)}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  {thread.subject || "Soporte general"}
                </p>
                <p className="mt-2 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-300">
                  {thread.last_message}
                </p>
                <span className="mt-3 inline-flex rounded-full border border-orange-200 px-3 py-1 text-[11px] font-semibold text-orange-600">
                  Abrir chat
                </span>
              </button>
            ))
          )}
        </div>

        {activeThread ? (
          <div className="flex h-full flex-col rounded-[22px] border border-zinc-200 bg-white p-4 shadow-inner dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {activeThread.customer_name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  {activeThread.customer_email || "Sin correo"}
                  {activeThread.requester_role
                    ? ` · ${formatRoleLabel(activeThread.requester_role)}`
                    : ""}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-300">
                  Conversation ID: {activeThread.id}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-300">
                  {activeThread.subject || "Soporte general"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleUpdateThreadStatus(
                      activeThread.status === "closed" ? "open" : "closed",
                    )
                  }
                  disabled={updatingStatus}
                  className="rounded-full border-orange-200 text-orange-600"
                >
                  {activeThread.status === "open" ? "Cerrar" : "Reabrir"}
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 sm:grid-cols-2">
              <p>
                <span className="font-semibold">Estado:</span>{" "}
                {formatLabel(activeThread.status)}
              </p>
              <p>
                <span className="font-semibold">Categoría:</span>{" "}
                {formatRoleLabel(activeThread.requester_role)}
              </p>
              <p>
                <span className="font-semibold">Pago:</span>{" "}
                {formatLabel(activeThread.payment_method || "sin_definir")}
              </p>
              <p>
                <span className="font-semibold">Pedido:</span>{" "}
                {activeThread.order_id
                  ? `#${activeThread.order_id}`
                  : "Sin pedido"}
              </p>
              <p>
                <span className="font-semibold">Estado del pedido:</span>{" "}
                {formatLabel(activeThread.order_status || "sin_definir")}
              </p>
              <p>
                <span className="font-semibold">Cliente:</span>{" "}
                {activeThread.customer_phone || "Sin teléfono"}
              </p>
              <p>
                <span className="font-semibold">Último mensaje:</span>{" "}
                {activeThread.messages.at(-1)?.message || "Sin mensajes"}
              </p>
              <p>
                <span className="font-semibold">Total:</span>{" "}
                {activeThread.total_amount
                  ? new Intl.NumberFormat("es-MX", {
                      style: "currency",
                      currency: "MXN",
                    }).format(Number(activeThread.total_amount))
                  : "Sin total"}
              </p>
            </div>

            {isTransferPending ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => handleValidatePayment("approve")}
                  disabled={validatingPayment}
                  className="rounded-full bg-orange-500 text-white hover:bg-orange-600"
                >
                  {validatingPayment ? "Procesando..." : "Aprobar pago"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleValidatePayment("reject")}
                  disabled={validatingPayment}
                  className="rounded-full border-orange-200 text-orange-600"
                >
                  {validatingPayment ? "Procesando..." : "Rechazar pago"}
                </Button>
              </div>
            ) : null}

            <div className="flex-1 space-y-3 overflow-y-auto py-4 text-sm">
              {detailLoading ? (
                <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-zinc-500 dark:bg-white/5 dark:text-zinc-300">
                  Cargando mensajes...
                </div>
              ) : activeThread.messages.length === 0 ? (
                <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-zinc-500 dark:bg-white/5 dark:text-zinc-300">
                  Sin mensajes todavía.
                </div>
              ) : (
                activeThread.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow",
                      msg.sender_type === "admin"
                        ? "ml-auto bg-orange-500/15 text-orange-700 dark:text-orange-200"
                        : msg.sender_type === "system"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-200"
                          : "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-100",
                    )}
                  >
                    <p>{msg.message}</p>
                    {msg.file_url ? (
                      <a
                        href={msg.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex rounded-full border border-current/20 px-3 py-1 text-xs font-semibold"
                      >
                        {msg.message_type === "payment_proof"
                          ? "Ver comprobante"
                          : "Ver archivo"}
                      </a>
                    ) : null}
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.3em] text-zinc-400">
                      {msg.sender_type} ·{" "}
                      {new Date(msg.created_at).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 space-y-2">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800 outline-none focus:border-orange-400 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                placeholder="Escribe una respuesta para esta conversación..."
              />
              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="rounded-full bg-orange-500 text-white hover:bg-orange-600"
                >
                  {sending ? "Enviando..." : "Enviar mensaje"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full text-zinc-600 hover:bg-zinc-100"
                  onClick={() => setMessage("")}
                >
                  Limpiar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[22px] border border-zinc-200 bg-white/70 p-8 text-sm text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            Selecciona una conversación para ver los mensajes.
          </div>
        )}
      </div>
    </section>
  );
}

export default AdminChatPanel;
