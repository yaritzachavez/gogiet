import Link from "next/link";
import { notFound } from "next/navigation";

import { getBusinessById } from "../../data/businesses";
import { BusinessOrdersTable } from "../../components/BusinessOrdersTable";
import { BusinessOrder, BusinessStatus } from "@/types/Business";

interface PageProps {
  params: {
    id: string;
  };
}

export default async function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // 👈 Esperas la promesa
  const businessId = Number(id);
  const business = getBusinessById(businessId);

  if (!business) {
    notFound();
  }

  const formatCurrency = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  });

  const pedidosPorMes = getMonthlySummary(business.pedidos);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            Negocio #{business.id}
          </p>
          <h1 className="text-3xl font-semibold text-red-700">
            {business.nombre}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-300">
            {business.categoria} · {business.ciudad}
          </p>
        </div>
        <Link
          href="/admin/negocios"
          className="inline-flex items-center rounded-lg border border-red-200/60 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-white/20 dark:text-red-200 dark:hover:bg-white/10"
        >
          ← Volver a la lista
        </Link>
      </div>

      <section className="grid gap-4 rounded-3xl border border-red-200/60 bg-white/95 p-6 shadow-lg dark:border-white/10 dark:bg-white/10 md:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3 rounded-xl bg-red-50/60 p-5 dark:bg-white/5">
          <h2 className="text-base font-semibold text-red-600">Ubicación</h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-200">
            {business.direccion}
          </p>
          <p className="text-xs text-zinc-400">{business.referencias}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <a
              href={`tel:${business.telefono.replace(/\s+/g, "")}`}
              className="inline-flex items-center justify-center rounded-lg border border-red-200/60 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-red-100 dark:border-white/20 dark:text-zinc-200 dark:hover:bg-white/10"
            >
              Llamar contacto
            </a>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-red-200/60 bg-white/90 p-5 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
          <h2 className="text-base font-semibold text-red-600">
            Información general
          </h2>
          <dl className="grid grid-cols-1 gap-3 text-zinc-700 dark:text-zinc-200 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Dueño
              </dt>
              <dd>{business.contacto}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Teléfono
              </dt>
              <dd>{business.telefono}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Horario
              </dt>
              <dd>
                {business.horario.dias}
                <br />
                {business.horario.apertura} – {business.horario.cierre} hrs
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Estado
              </dt>
              <dd>
                <StatusBadge status={business.estado} />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Inicio en GogiEats
              </dt>
              <dd>
                {new Date(business.creadoEn).toLocaleDateString("es-MX", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <BusinessOrdersTable orders={business.pedidos} />

      <section className="space-y-4 rounded-3xl border border-red-200/60 bg-white/95 p-6 shadow-lg dark:border-white/10 dark:bg-white/10">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Resumen por mes</h2>
          <span className="text-xs text-zinc-400">
            {pedidosPorMes.length} meses con pedidos
          </span>
        </header>
        {pedidosPorMes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-red-200/60 bg-white/70 p-6 text-sm text-zinc-400 dark:border-white/20 dark:bg-white/5">
            Sin registros de pedidos mensuales.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pedidosPorMes.map((mes) => (
              <div
                key={mes.key}
                className="rounded-2xl border border-red-200/60 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/5"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  {mes.label}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatCurrency.format(mes.total)}
                </p>
                <p className="text-xs text-zinc-500">
                  {mes.count} pedidos registrados
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function getMonthlySummary(pedidos: BusinessOrder[]) {
  type MonthlySummary = {
    label: string;
    count: number;
    total: number;
    key: number;
  };

  const map = new Map<string, MonthlySummary>();

  pedidos.forEach((pedido) => {
    const fecha = new Date(pedido.fecha);
    const key = `${fecha.getFullYear()}-${fecha.getMonth()}`;

    if (!map.has(key)) {
      map.set(key, {
        label: fecha.toLocaleDateString("es-MX", {
          month: "short",
          year: "numeric",
        }),
        count: 0,
        total: 0,
        key: fecha.getFullYear() * 100 + fecha.getMonth(),
      });
    }

    const summary = map.get(key)!;
    summary.count += 1;
    summary.total += pedido.total;
  });

  return Array.from(map.values()).sort((a, b) => b.key - a.key);
}

function StatusBadge({ status }: { status: BusinessStatus }) {
  const palette =
    status === "Verificado"
      ? "bg-orange-100 text-orange-600"
      : status === "Activo"
        ? "bg-sky-100 text-sky-600"
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
