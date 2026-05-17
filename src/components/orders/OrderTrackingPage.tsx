"use client";

import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";
import {
  getOrderStatusLabel,
  resolveCanonicalOrderStatus,
} from "@/lib/order-status";

type OrderItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes?: string | null;
};

type OrderDetail = {
  id: number;
  user_id: number;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  business_name?: string | null;
  payment_method: string;
  status_name: string;
  total_amount: number;
  subtotal: number;
  terminal_fee: number;
  delivery_fee: number;
  service_fee: number;
  platform_fee?: number;
  driver_fee?: number;
  customer_notes?: string | null;
  delivery_user_id?: number | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  delivery_profile_image_url?: string | null;
  delivery_status?: string | null;
  payment_receipt_url?: string | null;
  comprobante_pago_url?: string | null;
  created_at: string;
  notes?: Array<{
    id: number;
    note_type?: string | null;
    note_text?: string | null;
    created_at?: string | null;
  }>;
  street?: string | null;
  external_number?: string | null;
  neighborhood?: string | null;
  delivery_city?: string | null;
  items: OrderItem[];
};

type StepDefinition = {
  key: string;
  label: string;
};

const BASE_STEPS: StepDefinition[] = [
  { key: "pedido_recibido", label: "Pedido recibido" },
  { key: "preparando", label: "Preparando por tienda" },
  { key: "listo_para_recoger", label: "Listo para recoger" },
  { key: "repartidor_asignado", label: "Repartidor asignado" },
  { key: "en_camino", label: "En camino" },
  { key: "entregado", label: "Entregado" },
];

const TRANSFER_STEPS: StepDefinition[] = [
  { key: "pedido_recibido", label: "Pedido recibido" },
  { key: "preparando", label: "Preparando por tienda" },
  { key: "listo_para_recoger", label: "Listo para recoger" },
  { key: "repartidor_asignado", label: "Repartidor asignado" },
  { key: "en_camino", label: "En camino" },
  { key: "entregado", label: "Entregado" },
];

function normalizeStatus(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function getStepKey(statusName: string) {
  const normalizedStatus = resolveCanonicalOrderStatus(statusName);

  if (
    normalizedStatus === "pending" ||
    normalizedStatus === "pending_payment" ||
    normalizedStatus === "payment_review" ||
    normalizedStatus === "paid" ||
    normalizedStatus === "payment_failed"
  ) {
    return "pedido_recibido";
  }
  if (normalizedStatus === "accepted" || normalizedStatus === "preparing") {
    return "preparando";
  }
  if (
    normalizedStatus === "ready_for_pickup" ||
    normalizedStatus === "delivery_requested"
  ) {
    return "listo_para_recoger";
  }
  if (normalizedStatus === "driver_assigned") {
    return "repartidor_asignado";
  }
  if (normalizedStatus === "on_the_way") {
    return "en_camino";
  }
  if (normalizedStatus === "delivered") return "entregado";

  return "pedido_recibido";
}

function buildAddress(order: OrderDetail) {
  return [
    order.street,
    order.external_number,
    order.neighborhood,
    order.delivery_city,
  ]
    .filter(Boolean)
    .join(", ");
}

const TOKEN_STORAGE_KEYS = [
  "token",
  "authToken",
  "access_token",
  "gogi_token",
  "userToken",
  "accessToken",
];

function getStoredToken() {
  if (typeof window === "undefined") return null;

  for (const key of TOKEN_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);

    if (value?.trim()) {
      return value.trim();
    }
  }

  return null;
}

function clearStoredSession() {
  if (typeof window === "undefined") return;

  for (const key of [...TOKEN_STORAGE_KEYS, "user"]) {
    window.localStorage.removeItem(key);
  }
}

const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return `${moneyFormatter.format(Number.isFinite(value) ? value : 0)} MXN`;
}

export default function OrderTrackingPage() {
  const params = useParams<{ orderId?: string; id?: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAdminGeneral, setIsAdminGeneral] = useState(false);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const orderId = params.orderId ?? params.id ?? "";

  const loadOrder = async (showLoader = false) => {
    const token = getStoredToken();

    if (!token) {
      setErrorMessage("Tu sesión expiró. Inicia sesión nuevamente.");
      setLoading(false);
      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
      return;
    }

    try {
      if (showLoader) {
        setLoading(true);
      }

      const response = await fetch(`/api/orders/${orderId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (response.status === 401 || response.status === 403) {
        clearStoredSession();
        setErrorMessage("Tu sesión expiró. Inicia sesión nuevamente.");
        setLoading(false);
        window.setTimeout(() => {
          router.replace("/login");
        }, 1200);
        return;
      }

      if (!response.ok || !data?.order) {
        setErrorMessage(
          formatApiError(
            response.status,
            data,
            "No pudimos cargar la información del pedido.",
          ),
        );
        return;
      }

      setOrder(data.order as OrderDetail);
      setErrorMessage("");
      try {
        const rawUser = window.localStorage.getItem("user");
        const parsedUser = rawUser ? JSON.parse(rawUser) : null;
        const userRoles = Array.isArray(parsedUser?.roles)
          ? parsedUser.roles
          : [];
        setIsAdminGeneral(
          userRoles.includes("ADMIN_GENERAL") ||
            userRoles.includes("admin_general"),
        );
      } catch (parseError) {
        console.warn("No se pudieron leer los roles del usuario.", parseError);
        setIsAdminGeneral(false);
      }
    } catch (error) {
      console.warn("No pudimos cargar el seguimiento del pedido.", error);
      setErrorMessage(
        getFriendlyErrorMessage(
          error,
          "No pudimos cargar el seguimiento de tu pedido.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    if (orderId) {
      void loadOrder(true);
      const intervalId = window.setInterval(() => {
        if (isMounted) {
          void loadOrder(false);
        }
      }, 10_000);

      return () => {
        isMounted = false;
        window.clearInterval(intervalId);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [orderId, router]);

  const steps = useMemo(() => {
    if (!order) return BASE_STEPS;
    return normalizeStatus(order.payment_method) === "transferencia"
      ? TRANSFER_STEPS
      : BASE_STEPS;
  }, [order]);

  const activeStepIndex = useMemo(() => {
    if (!order) return 0;
    const currentStepKey = getStepKey(order.status_name);
    return Math.max(
      steps.findIndex((step) => step.key === currentStepKey),
      0,
    );
  }, [order, steps]);

  if (loading) {
    return (
      <main className="min-h-[70vh] bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.12),transparent_24%),linear-gradient(180deg,#0b0b0b_0%,#111111_48%,#151515_100%)] px-4 py-12 text-[#f5f5f5]">
        <div className="mx-auto max-w-4xl">
          <SectionCard className="border-white/12 bg-[linear-gradient(180deg,rgba(28,28,28,0.96)_0%,rgba(16,16,16,0.96)_100%)] p-6">
            <p className="text-sm font-medium text-[#d4d4d4]">
              Cargando seguimiento del pedido...
            </p>
          </SectionCard>
        </div>
      </main>
    );
  }

  if (errorMessage || !order) {
    return (
      <main className="min-h-[70vh] bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.12),transparent_24%),linear-gradient(180deg,#0b0b0b_0%,#111111_48%,#151515_100%)] px-4 py-12 text-[#f5f5f5]">
        <div className="mx-auto max-w-4xl">
          <EmptyState
            icon={ReceiptText}
            title="No pudimos cargar tu pedido"
            description={errorMessage || "No encontramos este pedido."}
            actionLabel="Reintentar"
            onAction={() => void loadOrder(true)}
          />
          <div className="mt-4 flex justify-center">
            <Button asChild variant="outline">
              <Link href="/pedidos">Volver a mis pedidos</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const address = buildAddress(order);
  const transferPending =
    normalizeStatus(order.payment_method) === "transferencia" &&
    resolveCanonicalOrderStatus(order.status_name) === "payment_review";
  const transferRejected =
    normalizeStatus(order.payment_method) === "transferencia" &&
    resolveCanonicalOrderStatus(order.status_name) === "cancelled";
  const latestRejectionReason =
    order.notes
      ?.filter((note) => String(note.note_text ?? "").includes("Motivo:"))
      .at(-1)?.note_text ?? "";

  const transferAccount = {
    bank: "BBVA",
    holder: "Gogi Eats",
  };

  const handlePaymentValidation = async (action: "approve" | "reject") => {
    const token = getStoredToken();

    if (!token) {
      setErrorMessage("Tu sesión expiró. Inicia sesión nuevamente.");
      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
      return;
    }

    const reason =
      action === "reject"
        ? (window
            .prompt("Indica el motivo del rechazo del pago:", "")
            ?.trim() ?? "")
        : "";

    if (action === "reject" && !reason) {
      return;
    }

    try {
      setPaymentActionLoading(true);
      const response = await fetch(`/api/admin/orders/${order.id}/payment`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          reason: action === "reject" ? reason : undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (response.status === 401 || response.status === 403) {
        clearStoredSession();
        setErrorMessage("Tu sesión expiró. Inicia sesión nuevamente.");
        window.setTimeout(() => {
          router.replace("/login");
        }, 1200);
        return;
      }

      if (!response.ok || !data?.success) {
        setErrorMessage(
          formatApiError(
            response.status,
            data,
            "No pudimos validar el pago. Intenta nuevamente.",
          ),
        );
        return;
      }

      setOrder((current) =>
        current
          ? {
              ...current,
              status_name:
                typeof data?.status === "string"
                  ? data.status
                  : current.status_name,
              notes: [
                ...(current.notes ?? []),
                {
                  id: Date.now(),
                  note_type: "system",
                  note_text:
                    action === "approve"
                      ? "Tu pago por transferencia fue validado. Tu pedido podrá continuar con la preparación."
                      : `Tu pago por transferencia fue rechazado. Motivo: ${reason}`,
                  created_at: new Date().toISOString(),
                },
              ],
            }
          : current,
      );
    } catch (validationError) {
      console.warn("Error validando pago:", validationError);
      setErrorMessage(
        getFriendlyErrorMessage(
          validationError,
          "No pudimos validar el pago de transferencia.",
        ),
      );
    } finally {
      setPaymentActionLoading(false);
    }
  };

  return (
    <main className="min-h-[70vh] bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.12),transparent_24%),linear-gradient(180deg,#0b0b0b_0%,#111111_48%,#151515_100%)] px-4 py-12 text-[#f5f5f5]">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          eyebrow="Estado del pedido"
          title="Seguimiento del pedido"
          description={
            <>
              Pedido #{order.id} creado el{" "}
              {new Date(order.created_at).toLocaleString("es-MX", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </>
          }
          actions={
            <Button asChild variant="outline">
              <Link href="/pedidos">Volver a mis pedidos</Link>
            </Button>
          }
        />

        {transferPending ? (
          <SectionCard className="border-orange-400/25 bg-[linear-gradient(135deg,rgba(255,115,0,0.18),rgba(42,24,10,0.88)_55%,rgba(18,18,18,0.96)_100%)] p-4 text-sm text-orange-100">
            Estamos validando tu comprobante de transferencia.
          </SectionCard>
        ) : null}
        {transferRejected ? (
          <SectionCard className="border-rose-400/20 bg-[linear-gradient(135deg,rgba(127,29,29,0.32),rgba(26,26,26,0.96)_75%)] p-4 text-sm text-rose-100">
            El pago por transferencia fue rechazado.
            {latestRejectionReason ? ` ${latestRejectionReason}` : ""}
          </SectionCard>
        ) : null}
        {resolveCanonicalOrderStatus(order.status_name) === "delivered" ? (
          <SectionCard className="border-emerald-400/20 bg-[linear-gradient(135deg,rgba(5,150,105,0.22),rgba(18,18,18,0.96)_72%)] p-4 text-sm text-emerald-100">
            Tu pedido ya fue entregado. Gracias por pedir en Gogi Eats.
          </SectionCard>
        ) : null}
        {resolveCanonicalOrderStatus(order.status_name) === "cancelled" ? (
          <SectionCard className="border-rose-400/20 bg-[linear-gradient(135deg,rgba(127,29,29,0.32),rgba(26,26,26,0.96)_75%)] p-4 text-sm text-rose-100">
            Este pedido fue cancelado.
            {latestRejectionReason ? ` ${latestRejectionReason}` : ""}
          </SectionCard>
        ) : null}

        <SectionCard className="border-white/12 bg-[linear-gradient(180deg,rgba(28,28,28,0.96)_0%,rgba(16,16,16,0.96)_100%)] p-6 shadow-[0_22px_60px_rgba(0,0,0,0.34)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#f5f5f5]">
                Estado actual
              </h2>
              <p className="mt-1 text-sm text-[#cfcfcf]">
                Método de pago: {order.payment_method}
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full border border-orange-400/25 bg-orange-500/12 px-3 py-1 text-xs font-semibold text-orange-200">
              {getOrderStatusLabel(order.status_name)}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {steps.map((step, index) => {
              const isCompleted = index <= activeStepIndex;
              const isActive = index === activeStepIndex;
              const isLast = index === steps.length - 1;

              return (
                <div
                  key={step.key}
                  className="relative rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:min-h-[132px]"
                >
                  {!isLast ? (
                    <div
                      className={`absolute left-[calc(50%+1rem)] right-[-50%] top-6 hidden h-0.5 lg:block ${
                        index < activeStepIndex
                          ? "bg-orange-500"
                          : "bg-white/12"
                      }`}
                    />
                  ) : null}
                  <div className="flex items-start gap-3 text-left sm:flex-col sm:items-center sm:text-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 shadow-sm ${
                        isCompleted
                          ? "border-orange-500 bg-orange-500"
                          : "border-white/15 bg-[#1d1d1d]"
                      }`}
                    >
                      <div
                        className={`h-3 w-3 rounded-full ${
                          isCompleted ? "bg-white" : "bg-[#5d5d5d]"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-sm leading-5 ${
                          isActive
                            ? "font-bold text-orange-200"
                            : isCompleted
                              ? "font-semibold text-[#f5f5f5]"
                              : "text-[#b5b5b5]"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p
                        className={`mt-1 text-[11px] font-medium uppercase tracking-[0.18em] ${
                          isActive
                            ? "text-orange-300/90"
                            : isCompleted
                              ? "text-[#d4d4d4]"
                              : "text-[#7d7d7d]"
                        }`}
                      >
                        {isActive
                          ? "En curso"
                          : isCompleted
                            ? "Completado"
                            : "Pendiente"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {order.delivery_user_id ? (
          <SectionCard className="border-white/12 bg-[linear-gradient(180deg,rgba(27,27,27,0.96)_0%,rgba(15,15,15,0.96)_100%)] p-6">
            <div className="flex items-center gap-4">
              <UserAvatar
                name={order.delivery_name}
                src={order.delivery_profile_image_url}
                size={64}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-300">
                  Tu repartidor
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#f5f5f5]">
                  {order.delivery_name || "Repartidor asignado"}
                </h2>
                <p className="text-sm text-[#cfcfcf]">
                  {order.delivery_phone || "Teléfono no disponible"}
                </p>
                <p className="mt-2 inline-flex rounded-full border border-orange-400/25 bg-orange-500/12 px-3 py-1 text-xs font-semibold text-orange-200">
                  {order.delivery_status || "Asignado"}
                </p>
              </div>
            </div>
          </SectionCard>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <SectionCard className="border-white/12 bg-[linear-gradient(180deg,rgba(27,27,27,0.96)_0%,rgba(15,15,15,0.96)_100%)] p-6">
            <h2 className="text-lg font-semibold text-[#f5f5f5]">Resumen</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {isAdminGeneral ? (
                <>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
                      Cliente
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#f5f5f5]">
                      {order.customer_name || "Sin nombre"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
                      Correo
                    </p>
                    <p className="mt-2 break-all text-sm text-[#d0d0d0]">
                      {order.customer_email || "Sin correo"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:col-span-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
                      Teléfono
                    </p>
                    <p className="mt-2 text-sm text-[#d0d0d0]">
                      {order.customer_phone || "Sin teléfono"}
                    </p>
                  </div>
                </>
              ) : null}
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
                  Negocio
                </p>
                <p className="mt-2 text-sm font-semibold text-[#f5f5f5]">
                  {order.business_name || "Sin negocio"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
                  Método de pago
                </p>
                <p className="mt-2 text-sm text-[#d0d0d0]">
                  {order.payment_method || "No especificado"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
                  Dirección
                </p>
                <p className="mt-2 text-sm leading-6 text-[#d0d0d0]">
                  {address || "Sin dirección disponible"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#bdbdbd]">
                  Subtotal
                </p>
                <p className="mt-2 text-sm font-semibold text-[#f5f5f5]">
                  {formatMoney(Number(order.subtotal ?? 0))}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#bdbdbd]">
                  Envío
                </p>
                <p className="mt-2 text-sm font-semibold text-[#f5f5f5]">
                  {formatMoney(Number(order.delivery_fee ?? 0))}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#bdbdbd]">
                  Servicio
                </p>
                <p className="mt-2 text-sm font-semibold text-[#f5f5f5]">
                  {formatMoney(Number(order.service_fee ?? 0))}
                </p>
              </div>
              <div className="rounded-2xl border border-orange-400/20 bg-[linear-gradient(135deg,rgba(255,115,0,0.18),rgba(32,20,10,0.92)_72%)] p-4 shadow-[0_14px_35px_rgba(255,115,0,0.12)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-200">
                  Total
                </p>
                <p className="mt-2 text-xl font-black text-white">
                  {formatMoney(Number(order.total_amount ?? 0))}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard className="border-white/12 bg-[linear-gradient(180deg,rgba(27,27,27,0.96)_0%,rgba(15,15,15,0.96)_100%)] p-6">
            <h2 className="text-lg font-semibold text-[#f5f5f5]">Productos</h2>
            <div className="mt-4 space-y-3">
              {order.items.map((item, index) => (
                <div
                  key={`order-${order.id}-item-${item.id ?? index}`}
                  className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,115,0,0.08))] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#f5f5f5]">
                        {item.product_name}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                        {Number(item.quantity ?? 0)} unidad{Number(item.quantity ?? 0) === 1 ? "" : "es"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-orange-200">
                      {formatMoney(Number(item.subtotal ?? 0))}
                    </p>
                  </div>
                  {item.notes ? (
                    <p className="mt-3 text-xs leading-5 text-[#c7c7c7]">
                      {item.notes}
                    </p>
                  ) : null}
                  <div className="mt-3 border-t border-white/8 pt-3">
                    <p className="text-xs text-[#9f9f9f]">
                      Precio unitario:{" "}
                      <span className="font-semibold text-[#e3e3e3]">
                        {formatMoney(Number(item.unit_price ?? 0))}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </section>

        {normalizeStatus(order.payment_method) === "transferencia" ? (
          <SectionCard className="border-white/12 bg-[linear-gradient(180deg,rgba(27,27,27,0.96)_0%,rgba(15,15,15,0.96)_100%)] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#f5f5f5]">
                  Transferencia
                </h2>
                <p className="mt-1 text-sm text-[#cfcfcf]">
                  Datos bancarios y comprobante del pedido.
                </p>
              </div>
              {isAdminGeneral && transferPending ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handlePaymentValidation("approve")}
                    disabled={paymentActionLoading}
                    className="rounded-2xl border border-orange-400/20 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-100 transition hover:bg-orange-500/18 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {paymentActionLoading ? "Procesando..." : "Aprobar pago"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePaymentValidation("reject")}
                    disabled={paymentActionLoading}
                    className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {paymentActionLoading ? "Procesando..." : "Rechazar pago"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 text-sm text-[#d0d0d0]">
                <p>
                  <span className="font-semibold">Banco:</span>{" "}
                  {transferAccount.bank}
                </p>
                <p>
                  <span className="font-semibold">Titular:</span>{" "}
                  {transferAccount.holder}
                </p>
                <p>
                  <span className="font-semibold">Total del pedido:</span>{" "}
                  {formatMoney(Number(order.total_amount ?? 0))}
                </p>
                <p>
                  <span className="font-semibold">Fecha del pedido:</span>{" "}
                  {new Date(order.created_at).toLocaleString("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                {isAdminGeneral ? (
                  <p>
                    <span className="font-semibold">Cliente:</span>{" "}
                    {order.customer_name || "Sin nombre"}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 text-sm text-[#d0d0d0]">
                <p className="font-semibold text-[#f5f5f5]">Comprobante de transferencia</p>
                {order.payment_receipt_url || order.comprobante_pago_url ? (
                  <a
                    href={
                      order.payment_receipt_url ||
                      order.comprobante_pago_url ||
                      "#"
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-2xl border border-orange-400/20 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-100 transition hover:bg-orange-500/18"
                  >
                    Ver comprobante
                  </a>
                ) : (
                  <p className="text-[#bdbdbd]">
                    No hay comprobante cargado.
                  </p>
                )}
              </div>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </main>
  );
}
