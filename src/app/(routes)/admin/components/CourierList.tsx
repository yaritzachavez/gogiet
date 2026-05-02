"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CourierStatus = "Activo" | "En descanso" | "Suspendido";
type EstadoFiltro = "Todos" | CourierStatus;

type Courier = {
  id: number;
  name: string;
  profile_image_url: string | null;
  phone: string;
  email: string;
  status: CourierStatus;
  vehicle: string;
  zone: string;
  total_deliveries: number;
  deliveries_today: number;
  deliveries_week: number;
  deliveries_month: number;
  earnings: number;
};

type CourierResponse = {
  success: boolean;
  couriers: Courier[];
  summary: {
    total: number;
    activos: number;
    descanso: number;
    suspendidos: number;
  };
  error?: string;
};

export function CourierList() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("Todos");

  useEffect(() => {
    const loadCouriers = async () => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        setError("Debes iniciar sesión nuevamente");
        setCouriers([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/admin/deliveries/repartidores", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = (await response.json()) as CourierResponse;

        if (!response.ok || !payload.success) {
          console.error("Error real cargando repartidores:", {
            status: response.status,
            body: payload,
          });
          setError(payload.error || "No se pudieron cargar los repartidores.");
          setCouriers([]);
          return;
        }

        setCouriers(payload.couriers ?? []);
      } catch (fetchError) {
        console.error("Error cargando repartidores:", fetchError);
        setError("No se pudieron cargar los repartidores.");
        setCouriers([]);
      } finally {
        setLoading(false);
      }
    };

    loadCouriers();
  }, []);

  const filteredCouriers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return couriers.filter((courier) => {
      const matchesSearch =
        query.length === 0 ||
        courier.name.toLowerCase().includes(query) ||
        courier.phone.replace(/\s+/g, "").includes(query.replace(/\s+/g, "")) ||
        courier.vehicle.toLowerCase().includes(query) ||
        courier.zone.toLowerCase().includes(query);

      const matchesStatus =
        estadoFiltro === "Todos" || courier.status === estadoFiltro;

      return matchesSearch && matchesStatus;
    });
  }, [couriers, search, estadoFiltro]);

  const summary = useMemo(() => {
    const total = couriers.length;
    const activos = couriers.filter((courier) => courier.status === "Activo");
    const descanso = couriers.filter(
      (courier) => courier.status === "En descanso",
    );
    const suspendidos = couriers.filter(
      (courier) => courier.status === "Suspendido",
    );

    return {
      total,
      activos: activos.length,
      descanso: descanso.length,
      suspendidos: suspendidos.length,
    };
  }, [couriers]);

  return (
    <section className="w-full rounded-3xl bg-white/95 px-6 py-8 shadow-lg ring-1 ring-red-200/60 backdrop-blur-sm dark:bg-white/10 dark:ring-white/10 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-red-700">
            Repartidores activos
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-300">
            Revisa disponibilidad, métricas y acceso al detalle operativo de
            cada repartidor.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, teléfono, vehículo o zona"
            className="min-w-[240px] rounded-xl border border-red-200/60 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-white/20 dark:bg-white/5"
          />
          <select
            value={estadoFiltro}
            onChange={(event) =>
              setEstadoFiltro(event.target.value as EstadoFiltro)
            }
            className="rounded-xl border border-red-200/60 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-white/20 dark:bg-white/5"
          >
            <option value="Todos">Todos los estados</option>
            <option value="Activo">Activos</option>
            <option value="En descanso">En descanso</option>
            <option value="Suspendido">Suspendidos</option>
          </select>
        </div>
      </header>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Repartidores totales" value={summary.total} />
        <SummaryCard label="Activos" value={summary.activos} accent="orange" />
        <SummaryCard
          label="En descanso"
          value={summary.descanso}
          accent="sky"
        />
        <SummaryCard
          label="Suspendidos"
          value={summary.suspendidos}
          accent="rose"
        />
      </section>

      <div className="mt-6 overflow-hidden rounded-2xl border border-red-200/60 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        <table className="min-w-full divide-y divide-red-100/80 text-sm">
          <thead className="bg-red-50/70 text-left text-xs font-semibold uppercase tracking-[0.2em] text-red-500">
            <tr>
              <th className="px-6 py-3">Repartidor</th>
              <th className="px-6 py-3">Contacto</th>
              <th className="px-6 py-3">Vehículo</th>
              <th className="px-6 py-3">Zona</th>
              <th className="px-6 py-3">Estado</th>
              <th className="px-6 py-3">Métrica rápida</th>
              <th className="px-6 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-100/60 bg-white text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-8 text-center text-sm text-zinc-400"
                >
                  Cargando repartidores...
                </td>
              </tr>
            ) : filteredCouriers.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-8 text-center text-sm text-zinc-400"
                >
                  No se encontraron repartidores con los filtros actuales.
                </td>
              </tr>
            ) : (
              filteredCouriers.map((courier) => (
                <tr
                  key={courier.id}
                  className="transition hover:bg-red-50/40 dark:hover:bg-white/10"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      {courier.profile_image_url ? (
                        <Image
                          src={courier.profile_image_url}
                          alt={courier.name}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full object-cover ring-2 ring-red-100"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-sm font-semibold text-red-600 ring-2 ring-red-100">
                          {courier.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium">{courier.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span>{courier.phone || "Sin teléfono"}</span>
                      <span className="text-xs text-zinc-400">
                        {courier.email || "Sin correo"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3">{courier.vehicle}</td>
                  <td className="px-6 py-3">{courier.zone}</td>
                  <td className="px-6 py-3">
                    <CourierStatusBadge status={courier.status} />
                  </td>
                  <td className="px-6 py-3 text-xs text-zinc-500 dark:text-zinc-300">
                    <p>Total: {courier.total_deliveries}</p>
                    <p>Hoy: {courier.deliveries_today}</p>
                    <p>Semana: {courier.deliveries_week}</p>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <Link
                      href={`/admin/deliveries/${courier.id}`}
                      className="rounded-lg border border-red-200/60 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-white/20 dark:text-red-200 dark:hover:bg-white/10"
                    >
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  accent = "rose",
}: {
  label: string;
  value: number;
  accent?: "rose" | "orange" | "sky";
}) {
  const palette =
    accent === "orange"
      ? "from-orange-200/80 to-orange-400/60 text-orange-700"
      : accent === "sky"
        ? "from-sky-200/80 to-sky-400/60 text-sky-700"
        : "from-rose-200/80 to-red-400/60 text-red-700";

  return (
    <div className={`rounded-[18px] bg-gradient-to-br ${palette} p-0.5`}>
      <div className="rounded-[16px] bg-white/95 px-4 py-5 shadow-sm ring-1 ring-white/60 dark:bg-zinc-900/80">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

function CourierStatusBadge({ status }: { status: CourierStatus }) {
  const palette =
    status === "Activo"
      ? "bg-orange-100 text-orange-600"
      : status === "En descanso"
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
