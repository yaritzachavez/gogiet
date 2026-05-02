"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";

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
  customer_notes?: string | null;
  delivery_user_id?: number | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  delivery_profile_image_url?: string | null;
  delivery_status?: string | null;
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
  { key: "preparando", label: "Preparando en tienda" },
  { key: "recogido", label: "Recogido por repartidor" },
  { key: "en_camino", label: "En camino" },
  { key: "entregado", label: "Entregado" },
];

const TRANSFER_STEPS: StepDefinition[] = [
  { key: "pedido_recibido", label: "Pedido recibido" },
  { key: "por_validar_pago", label: "Validando pago" },
  { key: "pago_validado", label: "Pago validado" },
  { key: "preparando", label: "Preparando en tienda" },
  { key: "recogido", label: "Recogido por repartidor" },
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

function getStepKey(statusName: string, paymentMethod: string) {
  const normalizedStatus = normalizeStatus(statusName);
  const normalizedPayment = normalizeStatus(paymentMethod);

  if (normalizedPayment === "transferencia") {
    if (normalizedStatus === "por_validar_pago") return "por_validar_pago";
    if (normalizedStatus === "pago_validado") return "pago_validado";
    if (
      normalizedStatus === "preparando" ||
      normalizedStatus === "en_preparacion" ||
      normalizedStatus === "preparacion"
    ) {
      return "preparando";
    }
  }

  if (normalizedStatus === "pendiente") return "pedido_recibido";
  if (
    normalizedStatus === "preparando" ||
    normalizedStatus === "en_preparacion" ||
    normalizedStatus === "preparacion"
  ) {
    return "preparando";
  }
  if (
    normalizedStatus === "recogido" ||
    normalizedStatus === "recogido_por_repartidor"
  ) {
    return "recogido";
  }
  if (
    normalizedStatus === "en_camino" ||
    normalizedStatus === "en_ruta" ||
    normalizedStatus === "saliendo"
  ) {
    return "en_camino";
  }
  if (normalizedStatus === "entregado") return "entregado";
  if (normalizedStatus === "por_validar_pago") return "por_validar_pago";
  if (normalizedStatus === "pago_validado") return "pago_validado";
  if (normalizedStatus === "pago_rechazado") return "por_validar_pago";

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

export default function PedidoDetallePage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAdminGeneral, setIsAdminGeneral] = useState(false);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);

  useEffect(() => {
    const loadOrder = async () => {
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
        const response = await fetch(`/api/orders/${params.orderId}`, {
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
            (typeof data?.error === "string" && data.error) ||
              "No pudimos cargar tu pedido.",
          );
          return;
        }

        setOrder(data.order as OrderDetail);
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
          console.error(
            "No se pudieron leer los roles del usuario.",
            parseError,
          );
          setIsAdminGeneral(false);
        }
      } catch (error) {
        console.error(error);
        setErrorMessage("No pudimos cargar el seguimiento de tu pedido.");
      } finally {
        setLoading(false);
      }
    };

    if (params.orderId) {
      loadOrder();
    }
  }, [params.orderId, router]);

  const steps = useMemo(() => {
    if (!order) return BASE_STEPS;
    return normalizeStatus(order.payment_method) === "transferencia"
      ? TRANSFER_STEPS
      : BASE_STEPS;
  }, [order]);

  const activeStepIndex = useMemo(() => {
    if (!order) return 0;
    const currentStepKey = getStepKey(order.status_name, order.payment_method);
    return Math.max(
      steps.findIndex((step) => step.key === currentStepKey),
      0,
    );
  }, [order, steps]);

  if (loading) {
    return (
      <main className="min-h-[70vh] bg-white/90 px-4 py-12 text-orange-950">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-orange-900/70">
              Cargando seguimiento del pedido...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (errorMessage || !order) {
    return (
      <main className="min-h-[70vh] bg-white/90 px-4 py-12 text-orange-950">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-orange-900/75">
              {errorMessage || "No encontramos este pedido."}
            </p>
          </div>
          <Link
            href="/pedidos"
            className="inline-flex rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
          >
            Volver a mis pedidos
          </Link>
        </div>
      </main>
    );
  }

  const address = buildAddress(order);
  const transferPending =
    normalizeStatus(order.payment_method) === "transferencia" &&
    normalizeStatus(order.status_name) === "por_validar_pago";
  const transferRejected =
    normalizeStatus(order.payment_method) === "transferencia" &&
    normalizeStatus(order.status_name) === "pago_rechazado";
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
          (typeof data?.error === "string" && data.error) ||
            "No se pudo validar el pago.",
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
      console.error("Error validando pago:", validationError);
      setErrorMessage("No se pudo validar el pago de transferencia.");
    } finally {
      setPaymentActionLoading(false);
    }
  };

  return (
    <main className="min-h-[70vh] bg-white/90 px-4 py-12 text-orange-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <Link
            href="/pedidos"
            className="inline-flex rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
          >
            Volver a mis pedidos
          </Link>
          <h1 className="text-3xl font-semibold">Seguimiento del pedido</h1>
          <p className="text-sm text-orange-900/70">
            Pedido #{order.id} creado el{" "}
            {new Date(order.created_at).toLocaleString("es-MX", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </header>

        {transferPending ? (
          <div className="rounded-3xl border border-orange-200 bg-orange-50/70 p-4 text-sm text-orange-900">
            Estamos validando tu comprobante de transferencia.
          </div>
        ) : null}
        {transferRejected ? (
          <div className="rounded-3xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
            El pago por transferencia fue rechazado.
            {latestRejectionReason ? ` ${latestRejectionReason}` : ""}
          </div>
        ) : null}

        <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-orange-950">
                Estado actual
              </h2>
              <p className="mt-1 text-sm text-orange-900/70">
                Método de pago: {order.payment_method}
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
              {order.status_name}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {steps.map((step, index) => {
              const isCompleted = index <= activeStepIndex;

              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                    isCompleted
                      ? "border-orange-200 bg-orange-50"
                      : "border-orange-100 bg-white"
                  }`}
                >
                  <div
                    className={`h-3 w-3 rounded-full ${
                      isCompleted ? "bg-orange-500" : "bg-orange-200"
                    }`}
                  />
                  <p
                    className={`text-sm ${
                      isCompleted
                        ? "font-semibold text-orange-950"
                        : "text-orange-900/60"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {order.delivery_user_id ? (
          <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <UserAvatar
                name={order.delivery_name}
                src={order.delivery_profile_image_url}
                size={64}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                  Tu repartidor
                </p>
                <h2 className="mt-1 text-lg font-semibold text-orange-950">
                  {order.delivery_name || "Repartidor asignado"}
                </h2>
                <p className="text-sm text-orange-900/70">
                  {order.delivery_phone || "Teléfono no disponible"}
                </p>
                <p className="mt-1 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                  {order.delivery_status || "Asignado"}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-orange-950">Resumen</h2>
            <div className="mt-4 space-y-2 text-sm text-orange-900">
              {isAdminGeneral ? (
                <>
                  <p>
                    <span className="font-semibold">Cliente:</span>{" "}
                    {order.customer_name || "Sin nombre"}
                  </p>
                  <p>
                    <span className="font-semibold">Correo:</span>{" "}
                    {order.customer_email || "Sin correo"}
                  </p>
                  <p>
                    <span className="font-semibold">Teléfono:</span>{" "}
                    {order.customer_phone || "Sin teléfono"}
                  </p>
                </>
              ) : null}
              <p>
                <span className="font-semibold">Subtotal:</span> MX$
                {Number(order.subtotal ?? 0).toFixed(2)}
              </p>
              <p>
                <span className="font-semibold">Cargo terminal:</span> MX$
                {Number(order.terminal_fee ?? 0).toFixed(2)}
              </p>
              <p>
                <span className="font-semibold">Envío:</span> MX$
                {Number(order.delivery_fee ?? 0).toFixed(2)}
              </p>
              <p>
                <span className="font-semibold">Servicio:</span> MX$
                {Number(order.service_fee ?? 0).toFixed(2)}
              </p>
              <p className="pt-2 text-base font-semibold text-orange-950">
                Total: MX${Number(order.total_amount ?? 0).toFixed(2)}
              </p>
              <p>
                <span className="font-semibold">Dirección:</span>{" "}
                {address || "Sin dirección disponible"}
              </p>
            </div>
          </article>

          <article className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-orange-950">Productos</h2>
            <div className="mt-4 space-y-3">
              {order.items.map((item, index) => (
                <div
                  key={`order-${order.id}-item-${item.id ?? index}`}
                  className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4"
                >
                  <p className="text-sm font-semibold text-orange-950">
                    {item.product_name}
                  </p>
                  <p className="mt-1 text-sm text-orange-900/75">
                    Cantidad: {Number(item.quantity ?? 0)} · MX$
                    {Number(item.subtotal ?? 0).toFixed(2)}
                  </p>
                  {item.notes ? (
                    <p className="mt-1 text-xs text-orange-900/65">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </section>

        {normalizeStatus(order.payment_method) === "transferencia" ? (
          <section className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-orange-950">
                  Transferencia
                </h2>
                <p className="mt-1 text-sm text-orange-900/70">
                  Datos bancarios y comprobante del pedido.
                </p>
              </div>
              {isAdminGeneral && transferPending ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handlePaymentValidation("approve")}
                    disabled={paymentActionLoading}
                    className="rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {paymentActionLoading ? "Procesando..." : "Aprobar pago"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePaymentValidation("reject")}
                    disabled={paymentActionLoading}
                    className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {paymentActionLoading ? "Procesando..." : "Rechazar pago"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 text-sm text-orange-900">
                <p>
                  <span className="font-semibold">Banco:</span>{" "}
                  {transferAccount.bank}
                </p>
                <p>
                  <span className="font-semibold">Titular:</span>{" "}
                  {transferAccount.holder}
                </p>
                <p>
                  <span className="font-semibold">Total del pedido:</span> MX$
                  {Number(order.total_amount ?? 0).toFixed(2)}
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

              <div className="space-y-2 text-sm text-orange-900">
                <p className="font-semibold">Comprobante de transferencia</p>
                {order.comprobante_pago_url ? (
                  <a
                    href={order.comprobante_pago_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
                  >
                    Ver comprobante
                  </a>
                ) : (
                  <p className="text-orange-900/70">
                    No hay comprobante cargado.
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
