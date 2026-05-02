"use client";

import { useMemo, useState } from "react";

import { BusinessOrdersTableProps, BusinessOrder } from "@/types/Business";

type MonthOption = {
  key: string;
  label: string;
};

const monthFormatter = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
});

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function BusinessOrdersTable({ orders }: BusinessOrdersTableProps) {
  const monthOptions = useMemo<MonthOption[]>(() => {
    const map = new Map<string, MonthOption>();

    orders.forEach((order) => {
      const date = new Date(order.fecha);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: capitalize(monthFormatter.format(date)),
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => (a.key > b.key ? -1 : 1));
  }, [orders]);

  const [selectedMonth, setSelectedMonth] = useState<string>("Todos");

  const filteredOrders = useMemo(() => {
    if (selectedMonth === "Todos") {
      return orders;
    }

    return orders.filter((order) => {
      const date = new Date(order.fecha);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      return key === selectedMonth;
    });
  }, [orders, selectedMonth]);

  return (
    <section className="space-y-4 rounded-3xl border border-red-200/60 bg-white/95 p-6 shadow-lg dark:border-white/10 dark:bg-white/10">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Pedidos recientes</h2>
          <p className="text-xs text-zinc-400">
            Total: {filteredOrders.length} (de {orders.length})
          </p>
        </div>
        {monthOptions.length > 0 ? (
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="w-full max-w-[220px] rounded-xl border border-red-200/60 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-white/20 dark:bg-white/5"
          >
            <option value="Todos">Todos los meses</option>
            {monthOptions.map((month) => (
              <option key={month.key} value={month.key}>
                {month.label}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      {filteredOrders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-red-200/60 bg-white/70 p-6 text-sm text-zinc-400 dark:border-white/20 dark:bg-white/5">
          No hay pedidos registrados para este mes.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-red-200/60 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          <table className="min-w-full divide-y divide-red-100/80 text-sm">
            <thead className="bg-red-50/70 text-left text-xs font-semibold uppercase tracking-[0.2em] text-red-500">
              <tr>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100/40 bg-white dark:bg-white/5">
              {filteredOrders.map((pedido) => (
                <tr
                  key={pedido.id}
                  className="transition hover:bg-red-50/40 dark:hover:bg-white/10"
                >
                  <td className="px-4 py-3 font-medium">{pedido.id}</td>
                  <td className="px-4 py-3">{pedido.cliente}</td>
                  <td className="px-4 py-3">
                    {currencyFormatter.format(pedido.total)}
                  </td>
                  <td className="px-4 py-3">{pedido.metodo}</td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={pedido.estado} />
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {new Date(pedido.fecha).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OrderStatusBadge({ status }: { status: BusinessOrder["estado"] }) {
  const palette =
    status === "Entregado"
      ? "bg-orange-100 text-orange-600"
      : status === "En camino"
        ? "bg-amber-100 text-amber-600"
        : "bg-rose-100 text-rose-600";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${palette}`}
    >
      <span className="size-2 rounded-full bg-current" />
      {status}
    </span>
  );
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
