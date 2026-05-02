"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type BusinessOption = {
  id: number;
  name: string;
};

type DeliveredOrder = {
  delivery_id: number;
  order_id: number;
  business_id: number | null;
  business_name: string;
  total: number;
  courier_gain: number;
  payment_method: string;
  status: string;
  delivered_at: string | null;
  delivery_address: string;
};

type CourierDetailResponse = {
  success: boolean;
  courier: {
    id: number;
    name: string;
    phone: string;
    email: string;
    status: "Activo" | "En descanso" | "Suspendido";
    vehicle: string;
    zone: string;
    total_deliveries: number;
    deliveries_today: number;
    deliveries_week: number;
    deliveries_month: number;
    earnings: number;
    businesses: BusinessOption[];
    delivered_orders: DeliveredOrder[];
  };
  filtered_summary: {
    total_deliveries: number;
    earnings: number;
  };
  error?: string;
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

export default function CourierDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<CourierDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("day");
  const [businessId, setBusinessId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const loadCourierDetail = async () => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        setError("Debes iniciar sesión nuevamente");
        setData(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const queryParams = new URLSearchParams();
        queryParams.set("period", period);

        if (businessId !== "all") {
          queryParams.set("business_id", businessId);
        }

        if (period === "custom") {
          if (startDate) queryParams.set("start_date", startDate);
          if (endDate) queryParams.set("end_date", endDate);
        }

        const response = await fetch(
          `/api/admin/deliveries/repartidores/${params.id}?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const payload = (await response.json()) as CourierDetailResponse;

        if (!response.ok || !payload.success) {
          console.error("Error real cargando detalle de repartidor:", {
            status: response.status,
            body: payload,
          });
          setError(
            payload.error || "No se pudo cargar el detalle del repartidor.",
          );
          setData(null);
          return;
        }

        setData(payload);
      } catch (fetchError) {
        console.error("Error cargando detalle de repartidor:", fetchError);
        setError("No se pudo cargar el detalle del repartidor.");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    if (params?.id) {
      loadCourierDetail();
    }
  }, [businessId, endDate, params?.id, period, startDate]);

  const businessNames = useMemo(() => {
    if (!data?.courier.businesses.length) {
      return "Sin negocios registrados";
    }

    return data.courier.businesses.map((business) => business.name).join(" · ");
  }, [data]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Repartidor #{data?.courier.id ?? params?.id}
          </p>
          <h1 className="text-3xl font-semibold text-red-700">
            {data?.courier.name || "Detalle de repartidor"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-300">
            Operación real, métricas y pedidos entregados.
          </p>
        </div>
        <Link
          href="/admin/deliveries"
          className="inline-flex items-center rounded-lg border border-red-200/60 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-white/20 dark:text-red-200 dark:hover:bg-white/10"
        >
          ← Volver a la lista
        </Link>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-3xl border border-red-200/60 bg-white/95 p-6 shadow-lg dark:border-white/10 dark:bg-white/10 md:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3 rounded-xl bg-red-50/60 p-5 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
          <h2 className="text-base font-semibold text-red-600">Contacto</h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Nombre del repartidor
              </dt>
              <dd>{data?.courier.name || "Sin nombre"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Teléfono
              </dt>
              <dd>{data?.courier.phone || "Sin teléfono"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Correo
              </dt>
              <dd>{data?.courier.email || "Sin correo"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Negocios donde ha recogido pedidos
              </dt>
              <dd>{businessNames}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3 rounded-xl border border-red-200/60 bg-white/90 p-5 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="text-base font-semibold text-red-600">Operación</h2>
          <dl className="grid grid-cols-1 gap-3 text-zinc-700 dark:text-zinc-200">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Estado
              </dt>
              <dd>{data?.courier.status || "Sin estado"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Vehículo
              </dt>
              <dd>{data?.courier.vehicle || "Sin vehículo"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Zona
              </dt>
              <dd>{data?.courier.zone || "Sin zona"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Ganancia del repartidor
              </dt>
              <dd>{formatMoney(data?.courier.earnings ?? 0)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Repartos realizados"
          value={String(data?.courier.total_deliveries ?? 0)}
        />
        <MetricCard
          label="Repartos del día"
          value={String(data?.courier.deliveries_today ?? 0)}
        />
        <MetricCard
          label="Repartos de la semana"
          value={String(data?.courier.deliveries_week ?? 0)}
        />
        <MetricCard
          label="Repartos del mes"
          value={String(data?.courier.deliveries_month ?? 0)}
        />
        <MetricCard
          label="Ganancia filtrada"
          value={formatMoney(data?.filtered_summary.earnings ?? 0)}
        />
      </section>

      <section className="space-y-5 rounded-3xl border border-red-200/60 bg-white/95 p-6 shadow-lg dark:border-white/10 dark:bg-white/10">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold">Filtros operativos</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-300">
            Filtra repartos entregados por periodo o por negocio.
          </p>
        </header>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <span>Periodo</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            >
              <option value="day">Hoy</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="custom">Rango personalizado</option>
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <span>Negocio</span>
            <select
              value={businessId}
              onChange={(event) => setBusinessId(event.target.value)}
              className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            >
              <option value="all">Todos los negocios</option>
              {data?.courier.businesses.map((business) => (
                <option key={business.id} value={String(business.id)}>
                  {business.name}
                </option>
              ))}
            </select>
          </label>

          {period === "custom" ? (
            <>
              <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                <span>Fecha inicial</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                />
              </label>

              <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                <span>Fecha final</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
                />
              </label>
            </>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-red-200/60 bg-white/95 p-6 shadow-lg dark:border-white/10 dark:bg-white/10">
        <header>
          <h2 className="text-xl font-semibold">Lista de pedidos entregados</h2>
          <p className="text-xs text-zinc-400">
            Mostrando {data?.filtered_summary.total_deliveries ?? 0} pedidos
            entregados en el periodo seleccionado.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-red-200/60 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          <table className="min-w-full divide-y divide-red-100/80 text-sm">
            <thead className="bg-red-50/70 text-left text-xs font-semibold uppercase tracking-[0.2em] text-red-500">
              <tr>
                <th className="px-4 py-3">Entrega</th>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Ganancia</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Dirección</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100/40 bg-white dark:bg-white/5">
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-6 text-center text-zinc-400"
                  >
                    Cargando detalle operativo...
                  </td>
                </tr>
              ) : !data?.courier.delivered_orders.length ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-6 text-center text-zinc-400"
                  >
                    No hay pedidos entregados para mostrar.
                  </td>
                </tr>
              ) : (
                data.courier.delivered_orders.map((order) => (
                  <tr
                    key={order.delivery_id}
                    className="transition hover:bg-red-50/40 dark:hover:bg-white/10"
                  >
                    <td className="px-4 py-3 font-medium">
                      #{order.delivery_id}
                    </td>
                    <td className="px-4 py-3">#{order.order_id}</td>
                    <td className="px-4 py-3">{order.business_name}</td>
                    <td className="px-4 py-3">{formatMoney(order.total)}</td>
                    <td className="px-4 py-3">
                      {formatMoney(order.courier_gain)}
                    </td>
                    <td className="px-4 py-3">
                      {formatLabel(order.payment_method)}
                    </td>
                    <td className="px-4 py-3">{formatLabel(order.status)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {order.delivered_at
                        ? new Date(order.delivered_at).toLocaleString("es-MX", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "Sin fecha"}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-300">
                      {order.delivery_address}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-red-200/60 bg-white/95 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}
