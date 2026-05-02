"use client";

import { CalendarRange, PackageSearch, Store } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import LoadingRow from "../components/LoadingRow";
import SummaryCard from "../components/SummaryCard";

type BusinessOption = {
  id: number;
  name: string;
};

type OrderProduct = {
  id?: number;
  product_id: number | null;
  product_name: string;
  quantity: number;
};

type AdminOrder = {
  id: number;
  customer_name: string;
  customer_email: string;
  business_id: number | null;
  business_name: string;
  products: OrderProduct[];
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
  delivery_address: string;
  current_delivery: {
    id: number;
    driver_user_id: number | null;
    driver_name: string;
  } | null;
};

type CourierOption = {
  id: number;
  name: string;
  status: string;
};

type AdminOrdersResponse = {
  success: boolean;
  businesses: BusinessOption[];
  statuses: string[];
  payment_methods: string[];
  orders: AdminOrder[];
};

type CouriersResponse = {
  success: boolean;
  couriers: CourierOption[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AdminOrdersPage() {
  const [data, setData] = useState<AdminOrdersResponse | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigningOrderId, setAssigningOrderId] = useState<number | null>(null);
  const [selectedCouriers, setSelectedCouriers] = useState<
    Record<number, string>
  >({});
  const [period, setPeriod] = useState("day");
  const [businessId, setBusinessId] = useState("all");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");

  const loadOrders = useCallback(
    async (silent = false) => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        setError("Debes iniciar sesión nuevamente");
        setData(null);
        setLoading(false);
        return;
      }

      try {
        if (!silent) {
          setLoading(true);
        }
        setError("");

        const params = new URLSearchParams();
        params.set("period", period);

        if (businessId !== "all") {
          params.set("business_id", businessId);
        }

        if (status !== "all") {
          params.set("status", status);
        }

        if (paymentMethod !== "all") {
          params.set("payment_method", paymentMethod);
        }

        const [ordersResponse, couriersResponse] = await Promise.all([
          fetch(`/api/admin/orders?${params.toString()}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
          fetch("/api/admin/deliveries/repartidores", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }),
        ]);

        const payload = (await ordersResponse.json()) as AdminOrdersResponse & {
          error?: string;
        };
        const couriersPayload = (await couriersResponse.json()) as
          | (CouriersResponse & { error?: string })
          | { error?: string };

        if (!ordersResponse.ok || !payload.success) {
          console.error("Error real cargando pedidos admin:", {
            status: ordersResponse.status,
            body: payload,
          });
          setError(
            payload.error || "No se pudieron cargar los pedidos del panel.",
          );
          setData(null);
          return;
        }

        if (!couriersResponse.ok || !("success" in couriersPayload)) {
          console.error("Error real cargando repartidores para asignacion:", {
            status: couriersResponse.status,
            body: couriersPayload,
          });
          setError("No se pudieron cargar los repartidores.");
          setCouriers([]);
          setData(payload);
          return;
        }

        setData(payload);
        setCouriers(couriersPayload.couriers ?? []);
      } catch (fetchError) {
        console.error("Error cargando pedidos admin:", fetchError);
        setError("No se pudieron cargar los pedidos del panel.");
        setData(null);
        setCouriers([]);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [businessId, paymentMethod, period, status],
  );

  useEffect(() => {
    loadOrders();

    const intervalId = window.setInterval(() => {
      loadOrders(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadOrders]);

  useEffect(() => {
    if (!data?.orders) return;

    setSelectedCouriers((current) => {
      const next = { ...current };

      for (const order of data.orders) {
        next[order.id] = order.current_delivery?.driver_user_id
          ? String(order.current_delivery.driver_user_id)
          : current[order.id] || "";
      }

      return next;
    });
  }, [data?.orders]);

  const handleAssignCourier = async (orderId: number) => {
    const courierId = selectedCouriers[orderId];
    const token = window.localStorage.getItem("token");

    if (!token) {
      setError("Debes iniciar sesión nuevamente");
      return;
    }

    if (!courierId) {
      setError("Selecciona un repartidor antes de asignar.");
      return;
    }

    try {
      setAssigningOrderId(orderId);
      setError("");

      const response = await fetch(`/api/admin/orders/${orderId}/delivery`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          driver_user_id: Number(courierId),
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo asignar el repartidor.");
      }

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          orders: current.orders.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  current_delivery: {
                    id: order.current_delivery?.id ?? 0,
                    driver_user_id: Number(courierId),
                    driver_name:
                      couriers.find(
                        (courier) => courier.id === Number(courierId),
                      )?.name || "Repartidor asignado",
                  },
                }
              : order,
          ),
        };
      });
    } catch (assignError) {
      console.error("Error asignando repartidor:", assignError);
      setError("No se pudo asignar el repartidor.");
    } finally {
      setAssigningOrderId(null);
    }
  };

  const stats = useMemo(() => {
    const orders = data?.orders ?? [];

    return {
      totalOrders: orders.length,
      totalSales: orders.reduce((sum, order) => sum + order.total, 0),
      pendingOrders: orders.filter((order) =>
        [
          "pendiente",
          "por_validar_pago",
          "preparando",
          "listo_para_recoger",
          "recogido",
          "en_camino",
        ].includes(order.status.toLowerCase()),
      ).length,
    };
  }, [data?.orders]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-6 sm:px-6 sm:py-10">
      <header className="flex items-center gap-3">
        <PackageSearch className="h-6 w-6 text-red-600 sm:h-7 sm:w-7" />
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl">
            Pedidos
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-300">
            Vista global de pedidos de todas las tiendas para ADMIN_GENERAL.
          </p>
        </div>
      </header>

      <section className="space-y-5 rounded-2xl bg-white/90 p-4 shadow-md ring-1 ring-red-200/60 dark:bg-white/10 dark:ring-white/10">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-red-500" />
              Fecha
            </span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            >
              <option value="day">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center gap-2">
              <Store className="h-4 w-4 text-red-500" />
              Negocio
            </span>
            <select
              value={businessId}
              onChange={(event) => setBusinessId(event.target.value)}
              className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            >
              <option value="all">Todos los negocios</option>
              {data?.businesses.map((business) => (
                <option key={business.id} value={String(business.id)}>
                  {business.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <span>Estado</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            >
              <option value="all">Todos los estados</option>
              {data?.statuses.map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {formatLabel(statusOption)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <span>Método de pago</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            >
              <option value="all">Todos los métodos</option>
              {data?.payment_methods.map((method) => (
                <option key={method} value={method}>
                  {formatLabel(method)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard label="Pedidos encontrados" value={stats.totalOrders} />
          <SummaryCard
            label="Pedidos activos"
            value={stats.pendingOrders}
            accent="orange"
          />
          <SummaryCard
            label="Ventas del periodo"
            value={Math.round(stats.totalSales)}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-white/90 p-4 shadow-md ring-1 ring-red-200/60 dark:bg-white/10 dark:ring-white/10">
        <header>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Pedidos de todas las tiendas
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-300">
            El ADMIN_GENERAL puede revisar aquí todos los pedidos y entrar al
            detalle de seguimiento.
          </p>
        </header>

        <div className="overflow-x-auto rounded-2xl border border-red-100 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          <table className="w-full divide-y divide-red-100 text-xs sm:text-sm dark:divide-white/10">
            <thead className="bg-red-50 text-left font-semibold uppercase text-red-600 dark:bg-white/5 dark:text-red-200">
              <tr>
                <th className="px-3 py-2.5">Pedido</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Negocio</th>
                <th className="px-3 py-2.5">Productos</th>
                <th className="px-3 py-2.5">Total</th>
                <th className="px-3 py-2.5">Pago</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Dirección</th>
                <th className="px-3 py-2.5">Repartidor</th>
                <th className="px-3 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 dark:divide-white/10">
              {loading ? (
                <LoadingRow />
              ) : !data?.orders.length ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-6 text-center text-zinc-400"
                  >
                    No hay pedidos para mostrar con esos filtros.
                  </td>
                </tr>
              ) : (
                data.orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-red-50/40 dark:hover:bg-white/10"
                  >
                    <td className="px-3 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      #{order.id}
                    </td>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-200">
                      <p className="font-medium">{order.customer_name}</p>
                      <p className="text-xs text-zinc-400">
                        {order.customer_email || "Sin correo"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-200">
                      {order.business_name}
                    </td>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-200">
                      <div className="space-y-1">
                        {order.products.length ? (
                          order.products.slice(0, 3).map((product, index) => (
                            <p
                              key={`order-${order.id}-item-${product.id ?? index}`}
                              className="text-xs"
                            >
                              {product.quantity}x {product.product_name}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-zinc-400">Sin productos</p>
                        )}
                        {order.products.length > 3 ? (
                          <p className="text-xs text-zinc-400">
                            +{order.products.length - 3} más
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {formatMoney(order.total)}
                    </td>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-200">
                      {formatLabel(order.payment_method)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:border-white/10 dark:bg-white/5 dark:text-orange-200">
                        {formatLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-200">
                      {new Date(order.created_at).toLocaleString("es-MX", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-200">
                      {order.delivery_address}
                    </td>
                    <td className="px-3 py-3 text-zinc-600 dark:text-zinc-200">
                      <div className="space-y-2">
                        <p className="text-xs font-medium">
                          {order.current_delivery?.driver_name ||
                            "Sin repartidor asignado"}
                        </p>
                        <select
                          value={selectedCouriers[order.id] ?? ""}
                          onChange={(event) =>
                            setSelectedCouriers((current) => ({
                              ...current,
                              [order.id]: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-red-100 bg-white px-2.5 py-2 text-xs text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                        >
                          <option value="">Seleccionar</option>
                          {couriers.map((courier) => (
                            <option key={courier.id} value={String(courier.id)}>
                              {courier.name} · {courier.status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        {order.payment_method === "transferencia" &&
                        order.status === "por_validar_pago" ? (
                          <Link
                            href={`/pedidos/${order.id}`}
                            className="inline-flex items-center justify-center rounded-lg border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-50 dark:border-white/10 dark:text-orange-200 dark:hover:bg-white/10"
                          >
                            Validar pago
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleAssignCourier(order.id)}
                          disabled={
                            assigningOrderId === order.id ||
                            !selectedCouriers[order.id]
                          }
                          className="inline-flex items-center justify-center rounded-lg border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-orange-200 dark:hover:bg-white/10"
                        >
                          {assigningOrderId === order.id
                            ? "Asignando..."
                            : "Asignar repartidor"}
                        </button>
                        <Link
                          href={`/pedidos/${order.id}`}
                          className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-white/10 dark:text-red-200 dark:hover:bg-white/10"
                        >
                          Ver detalle
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
