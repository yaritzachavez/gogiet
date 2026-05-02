"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AdminUser = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type DashboardOrder = {
  id: number;
  total: number;
  status: string;
};

type DashboardBusiness = {
  id: number;
  status_id?: number;
  is_open_now?: boolean;
};

export default function AdminDashboardPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminsError, setAdminsError] = useState("");
  const [username, setUsername] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const [ordersToday, setOrdersToday] = useState<DashboardOrder[]>([]);
  const [ordersMonth, setOrdersMonth] = useState<DashboardOrder[]>([]);
  const [businesses, setBusinesses] = useState<DashboardBusiness[]>([]);
  const [openSupportCount, setOpenSupportCount] = useState(0);
  const [chatFocusToken] = useState(0);
  const chatSectionRef = useRef<HTMLDivElement | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No se encontró token para cargar el dashboard admin.");
        setAdmins([]);
        setAdminsError("Inicia sesión para ver los administradores.");
        setDashboardError("Inicia sesión para ver el resumen.");
        return;
      }

      const [
        adminsResponse,
        ordersTodayResponse,
        ordersMonthResponse,
        businessesResponse,
        supportResponse,
      ] = await Promise.all([
        fetch("/api/users/admins", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/admin/orders?period=day", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/admin/orders?period=month", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/business", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/admin/support/threads?status=open", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const adminsData = await adminsResponse.json();
      const ordersTodayData = await ordersTodayResponse.json();
      const ordersMonthData = await ordersMonthResponse.json();
      const businessesData = await businessesResponse.json();
      const supportData = await supportResponse.json();

      if (!adminsResponse.ok || !adminsData.success) {
        console.error("Error real al cargar administradores:", {
          status: adminsResponse.status,
          body: adminsData,
        });
        setAdmins([]);
        setAdminsError(
          adminsData?.error || "No pudimos cargar los administradores.",
        );
      } else {
        setAdmins(
          Array.isArray(adminsData.users)
            ? (adminsData.users as AdminUser[])
            : [],
        );
        setAdminsError("");
      }

      if (!ordersTodayResponse.ok || !ordersTodayData.success) {
        console.error("Error real al cargar pedidos del día:", {
          status: ordersTodayResponse.status,
          body: ordersTodayData,
        });
        setOrdersToday([]);
      } else {
        setOrdersToday(
          Array.isArray(ordersTodayData.orders)
            ? (ordersTodayData.orders as DashboardOrder[])
            : [],
        );
      }

      if (!ordersMonthResponse.ok || !ordersMonthData.success) {
        console.error("Error real al cargar pedidos del mes:", {
          status: ordersMonthResponse.status,
          body: ordersMonthData,
        });
        setOrdersMonth([]);
      } else {
        setOrdersMonth(
          Array.isArray(ordersMonthData.orders)
            ? (ordersMonthData.orders as DashboardOrder[])
            : [],
        );
      }

      if (!businessesResponse.ok) {
        console.error("Error real al cargar negocios del dashboard:", {
          status: businessesResponse.status,
          body: businessesData,
        });
        setBusinesses([]);
      } else {
        setBusinesses(
          Array.isArray(businessesData.negocios)
            ? (businessesData.negocios as DashboardBusiness[])
            : [],
        );
      }

      if (!supportResponse.ok || !supportData.success) {
        console.error("Error real al cargar soporte del dashboard:", {
          status: supportResponse.status,
          body: supportData,
        });
        setOpenSupportCount(0);
      } else {
        setOpenSupportCount(
          Array.isArray(supportData.threads) ? supportData.threads.length : 0,
        );
      }

      setDashboardError("");
    } catch (error) {
      console.error("Error cargando resumen admin:", error);
      setDashboardError("No pudimos actualizar el resumen en tiempo real.");
    }
  }, []);

  useEffect(() => {
    loadDashboard();

    const intervalId = window.setInterval(() => {
      loadDashboard();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadDashboard]);

  useEffect(() => {
    const user = localStorage.getItem("user");

    if (user) {
      const parsed = JSON.parse(user);
      setUsername(parsed.name); // ⬅️ AQUÍ está la clave
    }
  }, []);

  useEffect(() => {
    if (!chatFocusToken) return;
    chatSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [chatFocusToken]);

  const dashboardStats = useMemo(() => {
    const ingresos30d = ordersMonth.reduce(
      (sum, order) => sum + Number(order.total ?? 0),
      0,
    );
    const pedidosHoy = ordersToday.length;
    const negociosActivos = businesses.filter(
      (business) => Number(business.status_id ?? 0) === 1,
    ).length;
    const entregados = ordersMonth.filter(
      (order) => String(order.status ?? "").toLowerCase() === "entregado",
    ).length;
    const tasaExito = ordersMonth.length
      ? (entregados / ordersMonth.length) * 100
      : 0;

    return {
      ingresos30d,
      pedidosHoy,
      negociosActivos,
      tasaExito,
    };
  }, [businesses, ordersMonth, ordersToday]);

  const BAR_DATA = [
    { id: "h0", hourLabel: "0h", value: 2 },
    { id: "h1", hourLabel: "1h", value: 5 },
    { id: "h2", hourLabel: "2h", value: 7 },
    { id: "h3", hourLabel: "3h", value: 6 },
    { id: "h4", hourLabel: "4h", value: 8 },
    { id: "h5", hourLabel: "5h", value: 9 },
    { id: "h6", hourLabel: "6h", value: 11 },
    { id: "h7", hourLabel: "7h", value: 13 },
    { id: "h8", hourLabel: "8h", value: 10 },
    { id: "h9", hourLabel: "9h", value: 12 },
    { id: "h10", hourLabel: "10h", value: 9 },
    { id: "h11", hourLabel: "11h", value: 8 },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 pb-8 pt-3 sm:space-y-6 sm:px-4 md:space-y-8 md:px-6 md:pb-12 md:pt-8 lg:space-y-10 lg:px-8">
      {/* HERO BANNER - Optimized for all screen sizes */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 via-red-500 to-red-600 p-4 text-white shadow-[0px_32px_80px_-32px_rgba(244,63,94,0.7)] ring-1 ring-white/20 sm:rounded-3xl sm:p-6 md:rounded-[32px] md:p-8 lg:p-9">
        <div className="absolute -right-16 -top-16 size-44 rounded-full bg-white/25 blur-3xl sm:-right-20 sm:-top-20 sm:size-48 lg:-right-24 lg:size-60" />
        <div className="absolute -bottom-14 left-[-48px] size-56 rounded-full bg-red-300/35 blur-3xl sm:-bottom-16 sm:size-60 lg:-bottom-20 lg:size-72" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_65%)]" />

        <div className="relative z-10 space-y-3 sm:space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/80 sm:px-3 sm:text-xs">
            Panel Admin
          </span>
          <h2 className="text-xl font-bold leading-tight sm:text-2xl md:text-3xl lg:text-4xl">
            ¡Hola, {username}!
          </h2>
          <p className="text-sm text-white/85 sm:text-base md:max-w-2xl">
            Este es tu panel de control. Revisa el rendimiento, acciones rápidas
            y actividad reciente.
          </p>
        </div>
      </div>

      {/* KPI SECTION - Responsive grid: 1 col mobile, 2 col tablet, 4 col desktop */}
      <section aria-label="Indicadores clave">
        {dashboardError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
            {dashboardError}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4 lg:gap-6">
          <KPI
            label="Ingresos (30d)"
            value={new Intl.NumberFormat("es-MX", {
              style: "currency",
              currency: "MXN",
              maximumFractionDigits: 0,
            }).format(dashboardStats.ingresos30d)}
            delta="Actualización cada 5s"
          />
          <KPI
            label="Pedidos hoy"
            value={String(dashboardStats.pedidosHoy)}
            delta={`${openSupportCount} chats abiertos`}
          />
          <KPI
            label="Negocios activos"
            value={String(dashboardStats.negociosActivos)}
            delta={`${businesses.length} registrados`}
          />
          <KPI
            label="Tasa de éxito"
            value={`${dashboardStats.tasaExito.toFixed(0)}%`}
            delta={`${ordersMonth.length} pedidos este mes`}
          />
        </div>
      </section>

      {/* PERFORMANCE & TEAM SECTION - Single column on mobile/tablet, 2-column on desktop */}
      <section
        aria-label="Resúmenes"
        className="grid gap-4 md:gap-6 lg:grid-cols-[1.6fr_1fr]"
      >
        {/* DAILY PERFORMANCE */}
        <Card title="Rendimiento diario">
          <div className="grid gap-4 lg:grid-cols-[1fr,minmax(240px,1fr)]">
            {/* LEFT STATS */}
            <div className="space-y-3 sm:space-y-4">
              <div className="rounded-xl sm:rounded-[22px] border border-white/70 bg-white/95 p-3 sm:p-4 shadow-md ring-1 ring-white/60 dark:border-white/10 dark:bg-white/10 dark:ring-white/10">
                <p className="text-xs sm:text-sm font-medium text-red-600">
                  Tráfico en vivo
                </p>
                <p className="mt-1 text-2xl sm:text-3xl font-bold">+32%</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  vs promedio de la última semana
                </p>
              </div>
              <div className="rounded-xl sm:rounded-[22px] border border-white/70 bg-white/95 p-3 sm:p-4 shadow-md ring-1 ring-white/60 dark:border-white/10 dark:bg-white/10 dark:ring-white/10">
                <p className="text-xs sm:text-sm font-medium text-orange-600">
                  Tiempo promedio de entrega
                </p>
                <p className="mt-1 text-2xl sm:text-3xl font-bold">28 min</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Meta: 30 min
                </p>
              </div>
            </div>

            {/* RIGHT CHART */}
            <div className="rounded-xl sm:rounded-[22px] border border-white/70 bg-white/95 p-3 sm:p-4 shadow-md ring-1 ring-white/60 dark:border-white/10 dark:bg-white/10 dark:ring-white/10">
              <p className="text-xs sm:text-sm font-medium text-red-600">
                Pedidos por hora
              </p>
              <div className="mt-3 grid grid-cols-12 gap-1">
                {BAR_DATA.map((item) => (
                  <div key={item.id} className="space-y-1 text-center">
                    <div
                      className="mx-auto w-2 sm:w-3 rounded-full bg-gradient-to-t from-red-400 to-rose-300"
                      style={{ height: `${item.value * 8}px` }}
                    />
                    <span className="text-[8px] sm:text-[10px] text-zinc-400">
                      {item.hourLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* RIGHT COLUMN: TEAM + BUSINESSES */}
        <div className="space-y-4 md:space-y-6">
          {/* ACTIVE TEAM */}
          <Card title="Equipo activo">
            {adminsError ? (
              <div className="rounded-lg sm:rounded-[18px] border border-white/70 bg-white/95 p-3 text-sm text-zinc-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                {adminsError}
              </div>
            ) : admins.length === 0 ? (
              <div className="rounded-lg sm:rounded-[18px] border border-white/70 bg-white/95 p-3 text-sm text-zinc-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                No hay administradores registrados
              </div>
            ) : (
              <ul className="space-y-2 sm:space-y-3 text-sm">
                {admins.slice(0, 4).map((user) => {
                  const initials =
                    `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase();
                  return (
                    <li
                      key={user.id}
                      className="flex items-center justify-between gap-2 rounded-lg sm:rounded-[18px] border border-white/70 bg-white/95 p-2 sm:p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {/* Avatar */}
                        <div className="flex size-8 sm:size-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-red-500 text-xs font-semibold text-white shadow-md">
                          {initials}
                        </div>

                        {/* User Info */}
                        <div className="min-w-0">
                          <p className="font-medium truncate text-xs sm:text-sm">
                            {user.first_name} {user.last_name}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {user.email || user.phone}
                          </p>
                        </div>
                      </div>

                      {/* Button */}
                      <button
                        type="button"
                        className="flex-shrink-0 rounded-lg bg-gradient-to-r from-rose-500/15 to-red-500/20 px-2 py-1 text-xs font-semibold whitespace-nowrap text-red-600 transition hover:from-rose-500/30 hover:to-red-500/30 dark:text-red-200 sm:px-3"
                      >
                        Contactar
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* RECENT BUSINESSES TABLE - Simplified for mobile with horizontal scroll */}
          <Card title="Negocios recientes">
            <div className="overflow-x-auto rounded-lg sm:rounded-[22px] border border-white/70 bg-white/95 shadow-md dark:border-white/10 dark:bg-white/5">
              <table className="min-w-full divide-y divide-white/70 text-xs sm:text-sm dark:divide-white/10">
                <thead className="bg-gradient-to-r from-rose-50/90 to-red-50/50 text-left font-semibold uppercase tracking-[0.3em] text-red-500 dark:from-white/5 dark:to-white/5 dark:text-red-200">
                  <tr>
                    <th className="px-3 py-2 sm:px-4">Negocio</th>
                    <th className="px-3 py-2 sm:px-4 hidden sm:table-cell">
                      Ciudad
                    </th>
                    <th className="px-3 py-2 sm:px-4 hidden md:table-cell">
                      Giro
                    </th>
                    <th className="px-3 py-2 sm:px-4">Estado</th>
                    <th className="px-3 py-2 sm:px-4 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/70 bg-white/95 text-zinc-700 dark:divide-white/10 dark:bg-white/5 dark:text-zinc-200">
                  {/* {RECENT_BUSINESSES.map((business) => (
                    <tr key={business.id}>
                      <td className="px-3 py-2 sm:px-4 font-medium">{business.nombre}</td>
                      <td className="px-3 py-2 sm:px-4 hidden sm:table-cell">{business.ciudad}</td>
                      <td className="px-3 py-2 sm:px-4 hidden md:table-cell">{business.giro}</td>
                      <td className="px-3 py-2 sm:px-4">
                        <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-600">
                          {business.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 sm:px-4 text-right">
                        <button className="text-xs sm:text-sm text-red-600 hover:underline">Ver</button>
                      </td>
                    </tr>
                  ))} */}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>

      {/* ACTIVITY & QUICK ACTIONS - Stack on mobile/tablet, 2-column on desktop */}
      <section className="grid gap-4 md:gap-6 lg:grid-cols-[2fr_1fr]">
        {/* RECENT ACTIVITY */}
        <Card title="Actividad reciente">
          <ul className="space-y-2 sm:space-y-3 text-sm">
            {/* {ACTIVITY.map((item, index) => (
              <li
                key={index}
                className="flex gap-2 sm:gap-3 rounded-lg sm:rounded-[18px] border border-white/70 bg-white/95 p-2 sm:p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <span className="mt-1 inline-flex size-2 sm:size-3 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 text-[8px] sm:text-[10px] text-white">
                  ●
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-xs sm:text-sm">{item.title}</p>
                  <p className="text-xs opacity-70">{item.time}</p>
                </div>
              </li>
            ))} */}
          </ul>
        </Card>

        {/* QUICK ACTIONS & SYSTEM HEALTH */}
        <div className="space-y-4">
          <Card title="Acciones rápidas">
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <QuickAction>Generar reporte</QuickAction>
              <QuickAction>Nuevo cupón</QuickAction>
              <QuickAction>Revisión KYC</QuickAction>
              <QuickAction>Configurar tarifas</QuickAction>
            </div>
          </Card>

          <Card title="Salud del sistema">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="relative size-14 sm:size-16 flex-shrink-0">
                <div className="absolute inset-0 rounded-full border-8 border-orange-500/80" />
                <div className="absolute inset-1 rounded-full bg-orange-100/40 dark:bg-orange-500/10" />
              </div>
              <div className="text-xs sm:text-sm">
                <p className="font-medium">99.96% uptime</p>
                <p className="opacity-70">Todo funcionando correctamente</p>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

function KPI({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg sm:rounded-[22px] bg-gradient-to-br from-rose-100/80 via-red-200/70 to-red-300/40 p-[1px] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
      <div className="relative h-full rounded-lg sm:rounded-[20px] bg-white/95 p-3 sm:p-4 md:p-5 shadow-lg ring-1 ring-white/70 backdrop-blur-sm dark:bg-zinc-900/80 dark:ring-white/10">
        <div className="pointer-events-none absolute -top-10 right-0 h-16 w-16 rounded-full bg-rose-200/60 blur-3xl" />
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-red-400">
          {label}
        </p>
        <div className="mt-2 text-2xl sm:text-3xl md:text-[2.25rem] font-semibold text-zinc-800 dark:text-white">
          {value}
        </div>
        {delta ? (
          <span className="mt-2 sm:mt-3 inline-flex items-center gap-1 rounded-full bg-orange-100/80 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
            <span className="size-1.5 rounded-full bg-orange-500 dark:bg-orange-300" />
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full max-w-full overflow-hidden rounded-lg sm:rounded-[24px] bg-white/95 p-3 sm:p-4 md:p-6 shadow-xl ring-1 ring-white/70 backdrop-blur-sm dark:bg-zinc-900/80 dark:ring-white/10">
      <div className="pointer-events-none absolute inset-x-4 sm:inset-x-6 top-0 h-20 rounded-full bg-gradient-to-br from-red-100/50 via-transparent to-transparent blur-3xl sm:h-24" />
      <div className="relative z-10">
        <h3 className="text-base sm:text-lg font-semibold text-zinc-700 dark:text-zinc-100">
          {title}
        </h3>
        <div className="mt-1.5 h-0.5 sm:h-1 w-10 sm:w-12 rounded-full bg-gradient-to-r from-rose-400/70 to-red-400/70" />
      </div>
      <div className="relative z-10 mt-3 sm:mt-4 md:mt-5">{children}</div>
    </div>
  );
}

function QuickAction({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="group w-full rounded-lg border border-white/70 bg-white/95 px-2 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:text-red-600 hover:shadow-md dark:border-white/10 dark:bg-white/10 dark:text-zinc-200 dark:hover:text-red-200 sm:rounded-xl sm:px-3 sm:text-sm"
    >
      <span className="transition group-hover:opacity-100 group-hover:brightness-110">
        {children}
      </span>
    </button>
  );
}
