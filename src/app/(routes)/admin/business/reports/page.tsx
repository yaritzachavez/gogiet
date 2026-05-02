"use client";

import { BarChart3, CalendarRange, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import LoadingRow from "../../components/LoadingRow";
import SummaryCard from "../../components/SummaryCard";

type ReportBusiness = {
  id: number;
  name: string;
};

type PaymentMethodSummary = {
  name: string;
  total_orders: number;
};

type ReportOrder = {
  id: number;
  business_name: string;
  customer_name: string;
  status_name: string;
  payment_method: string;
  subtotal: number;
  service_fee: number;
  shipping_total: number;
  total_amount: number;
  created_at: string;
};

type ReportSummary = {
  total_orders: number;
  completed_orders: number;
  pending_orders: number;
  gross_sales: number;
  service_fees: number;
  shipping_total: number;
  business_earnings: number;
};

type ReportResponse = {
  success: boolean;
  businesses: ReportBusiness[];
  summary: ReportSummary;
  payment_methods: PaymentMethodSummary[];
  orders: ReportOrder[];
  filters: {
    business_id: number | null;
    period: string;
    start_date: string;
    end_date: string;
  };
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function AdminBusinessReportsPage() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("day");
  const [businessId, setBusinessId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const loadReports = async () => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        setError("Debes iniciar sesión nuevamente");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams();
        params.set("period", period);

        if (businessId !== "all") {
          params.set("business_id", businessId);
        }

        if (period === "custom") {
          if (startDate) params.set("start_date", startDate);
          if (endDate) params.set("end_date", endDate);
        }

        const response = await fetch(
          `/api/admin/reports/business?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          console.error("Error real cargando reportes:", {
            status: response.status,
            body: data,
          });
          setError(
            data?.error || "No se pudieron cargar los reportes del negocio.",
          );
          setReport(null);
          return;
        }

        setReport(data as ReportResponse);
      } catch (fetchError) {
        console.error("Error cargando reportes de negocio:", fetchError);
        setError("No se pudieron cargar los reportes del negocio.");
        setReport(null);
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, [businessId, endDate, period, startDate]);

  const paymentMethodsLabel = useMemo(() => {
    if (!report?.payment_methods?.length) {
      return "Sin métodos registrados";
    }

    return report.payment_methods
      .map((item) => `${item.name} (${item.total_orders})`)
      .join(" · ");
  }, [report]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-red-600 sm:h-7 sm:w-7" />
          <div>
            <h1 className="text-2xl font-semibold dark:text-white">
              Reportes por negocio
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-300">
              Analiza pedidos, ventas y comisiones por periodo y negocio.
            </p>
          </div>
        </div>

        <Link
          href="/admin/business"
          className="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-white/10 dark:text-red-300 dark:hover:bg-white/10"
        >
          Volver a negocios
        </Link>
      </header>

      <section className="space-y-5 rounded-2xl bg-white/90 p-4 shadow-md dark:bg-white/10">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1fr]">
          <label className="space-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-red-500" />
              Periodo
            </span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-full rounded-lg border border-red-100 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-red-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
            >
              <option value="day">Hoy</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
              <option value="custom">Rango personalizado</option>
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
              {report?.businesses?.map((business) => (
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

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Pedidos recibidos"
            value={report?.summary.total_orders ?? 0}
          />
          <SummaryCard
            label="Pedidos pendientes"
            value={report?.summary.pending_orders ?? 0}
            accent="orange"
          />
          <SummaryCard
            label="Pedidos completados"
            value={report?.summary.completed_orders ?? 0}
          />
          <SummaryCard
            label="Ventas totales"
            value={Math.round(report?.summary.gross_sales ?? 0)}
            accent="orange"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Ganancia del negocio"
            value={formatMoney(report?.summary.business_earnings ?? 0)}
          />
          <MetricCard
            label="Comisión de Gogi Eats"
            value={formatMoney(report?.summary.service_fees ?? 0)}
          />
          <MetricCard
            label="Envíos cobrados"
            value={formatMoney(report?.summary.shipping_total ?? 0)}
          />
          <MetricCard
            label="Métodos de pago usados"
            value={paymentMethodsLabel}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-white/90 p-4 shadow-md dark:bg-white/10">
        <header>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Pedidos del periodo
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-300">
            Vista detallada de los pedidos filtrados.
          </p>
        </header>

        <div className="overflow-x-auto rounded-2xl border border-red-100 bg-white dark:border-white/10 dark:bg-white/5">
          <table className="w-full divide-y divide-red-100 text-xs sm:text-sm dark:divide-white/10">
            <thead className="bg-red-50 text-left font-semibold uppercase text-red-600 dark:bg-white/5 dark:text-red-200">
              <tr>
                <th className="px-3 py-2.5">Pedido</th>
                <th className="px-3 py-2.5">Negocio</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Pago</th>
                <th className="px-3 py-2.5">Total</th>
                <th className="px-3 py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 dark:divide-white/10">
              {loading ? (
                <LoadingRow />
              ) : !report?.orders?.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-zinc-400"
                  >
                    No hay pedidos para mostrar en este periodo.
                  </td>
                </tr>
              ) : (
                report.orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-red-50/40 dark:hover:bg-white/10"
                  >
                    <td className="px-3 py-2.5 font-medium">#{order.id}</td>
                    <td className="px-3 py-2.5">{order.business_name}</td>
                    <td className="px-3 py-2.5">{order.customer_name}</td>
                    <td className="px-3 py-2.5">{order.status_name}</td>
                    <td className="px-3 py-2.5">{order.payment_method}</td>
                    <td className="px-3 py-2.5">
                      {formatMoney(order.total_amount)}
                    </td>
                    <td className="px-3 py-2.5">
                      {new Date(order.created_at).toLocaleString("es-MX", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-red-100/60 bg-red-50/50 p-4 dark:border-white/10 dark:bg-white/5 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 sm:text-sm">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white sm:mt-3 sm:text-base">
        {value}
      </p>
    </div>
  );
}
