"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { businesses } from "@/app/(routes)/admin/data/businesses";

import { BusinessRecord, BusinessStatus } from "@/types/Business";

type EstadoFiltro = "Todos" | BusinessStatus;

export function BusinessList() {
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("Todos");

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return businesses.filter((business) => {
      const matchesSearch =
        query.length === 0 ||
        business.nombre.toLowerCase().includes(query) ||
        business.categoria.toLowerCase().includes(query) ||
        business.ciudad.toLowerCase().includes(query);

      const matchesStatus =
        estadoFiltro === "Todos" || business.estado === estadoFiltro;

      return matchesSearch && matchesStatus;
    });
  }, [search, estadoFiltro]);

  const summary = useMemo(() => {
    const total = businesses.length;
    const verificados = businesses.filter(
      (b) => b.estado === "Verificado",
    ).length;
    const activos = businesses.filter((b) => b.estado === "Activo").length;
    const suspendidos = businesses.filter(
      (b) => b.estado === "Suspendido",
    ).length;
    return { total, verificados, activos, suspendidos };
  }, []);

  return (
    <section className="w-full rounded-[28px] border border-white/40 bg-white/65 px-6 py-8 shadow-[0_40px_120px_-60px_rgba(244,63,94,0.3)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:shadow-none sm:px-8 lg:px-12 lg:py-10">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-red-600 sm:text-[28px]">Negocios registrados</h2>
          <p className="max-w-2xl text-sm text-zinc-500 dark:text-zinc-300">
            Gestiona comercios aliados, revisa documentación y estado de verificación en una sola vista.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, categoría o ciudad"
            className="w-full min-w-[240px] rounded-2xl border border-white/50 bg-white/60 px-4 py-2 text-sm shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-white/20 dark:bg-white/5"
          />
          <select
            value={estadoFiltro}
            onChange={(event) => setEstadoFiltro(event.target.value as EstadoFiltro)}
            className="rounded-xl border border-red-200/60 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-white/20 dark:bg-white/5"
          >
            <option value="Todos">Todos los estados</option>
            <option value="Verificado">Verificados</option>
            <option value="Activo">Activos</option>
            <option value="Suspendido">Suspendidos</option>
          </select>
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Negocios totales" value={summary.total} />
        <SummaryCard
          label="Verificados"
          value={summary.verificados}
          accent="orange"
        />
        <SummaryCard label="Activos" value={summary.activos} accent="sky" />
        <SummaryCard
          label="Suspendidos"
          value={summary.suspendidos}
          accent="rose"
        />
      </section>

      <div className="mt-8 overflow-hidden rounded-[26px] border border-white/40 bg-white/75 shadow-lg ring-1 ring-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        <table className="min-w-full divide-y divide-white/60 text-sm dark:divide-white/10">
          <thead className="bg-gradient-to-r from-rose-50/80 via-white/85 to-sky-50/80 text-left text-[11px] font-semibold uppercase tracking-[0.3em] text-red-500 dark:from-white/10 dark:via-white/5 dark:to-white/10">
            <tr>
              <th className="px-6 py-3">Negocio</th>
              <th className="px-6 py-3">Categoría</th>
              <th className="px-6 py-3">Ciudad</th>
              <th className="px-6 py-3">Contacto</th>
              <th className="px-6 py-3">Estado</th>
              <th className="px-6 py-3">Registro</th>
              <th className="px-6 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/45 bg-white/80 text-zinc-700 backdrop-blur dark:divide-white/10 dark:bg-white/5 dark:text-zinc-200">
            {filteredBusinesses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-zinc-400">
                  No se encontraron negocios con los filtros actuales.
                </td>
              </tr>
            ) : (
              filteredBusinesses.map((business) => (
                <BusinessRow key={business.id} business={business} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Esta vista utiliza datos simulados. Conecta tu API cuando tengas la tabla de negocios lista.
      </p>
    </section>
  );
}

function BusinessRow({ business }: { business: BusinessRecord }) {
  const [status, setStatus] = useState<BusinessStatus>(business.estado);
  return (
    <tr className="transition hover:bg-rose-50/40 dark:hover:bg-white/10">
      <td className="px-6 py-4 font-medium">{business.nombre}</td>
      <td className="px-6 py-4 text-zinc-500 dark:text-zinc-300">{business.categoria}</td>
      <td className="px-6 py-4">{business.ciudad}</td>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-0.5">
          <span>{business.contacto}</span>
          <span className="text-xs text-zinc-400">{business.telefono}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <StatusBadge status={status} />
      </td>
      <td className="px-6 py-4 text-xs text-zinc-400">
        {new Date(business.creadoEn).toLocaleDateString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className="px-6 py-4 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/admin/negocios/${business.id}`}
            className="rounded-xl border border-white/60 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-700 dark:border-white/20 dark:text-red-200 dark:hover:bg-white/10"
          >
            Revisar
          </Link>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as BusinessStatus)}
            className="rounded-lg border border-red-200/60 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 transition focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-200 dark:border-white/20 dark:bg-white/5 dark:text-zinc-200"
          >
            <option value="Verificado">Verificado</option>
            <option value="Activo">Activo</option>
            <option value="Suspendido">Suspendido</option>
          </select>
        </div>
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  accent = "rose",
}: {
  label: string;
  value: number;
  accent?: "rose" | "orange" | "amber" | "sky";
}) {
  const palette =
    accent === "orange"
      ? "from-orange-200/80 via-orange-300/60 to-orange-400/40 text-orange-700"
      : accent === "amber"
        ? "from-amber-200/80 via-amber-300/60 to-amber-400/40 text-amber-700"
        : accent === "sky"
          ? "from-sky-200/80 via-sky-300/60 to-sky-400/40 text-sky-700"
          : "from-rose-200/80 via-rose-300/60 to-red-400/40 text-red-700";

  return (
    <div className={`rounded-[20px] bg-gradient-to-br ${palette} p-[1px]`}>
      <div className="rounded-[18px] bg-white/95 px-4 py-5 shadow-sm ring-1 ring-white/70 backdrop-blur dark:bg-zinc-900/80">
        <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-400">
          {label}
        </p>
        <p className="mt-3 text-3xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BusinessStatus }) {
  const theme =
    status === "Verificado"
      ? "bg-orange-100/70 text-orange-700"
      : status === "Activo"
        ? "bg-sky-100/70 text-sky-700"
        : "bg-rose-100/70 text-rose-700";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${theme}`}>
      <span className="size-2 rounded-full bg-current" />
      {status}
    </span>
  );
}
