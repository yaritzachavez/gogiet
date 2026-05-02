import Link from "next/link";
import type { ReactNode } from "react";

import { type AdminNavLink, DesktopMenu, MobileMenu } from "./components/nav";
import { AdminChatBubble } from "./components/AdminChatBubble";

const NAV_LINKS: AdminNavLink[] = [
  {
    href: "/admin",
    label: "Resumen",
    description: "Metricas del día",
    icon: "🏡",
  },
  {
    href: "/admin/users",
    label: "Usuarios",
    description: "Repartidores y productores",
    icon: "👥",
  },
  {
    href: "/admin/negocios",
    label: "Tiendas",
    description: "Huertos, co-ops y aliados",
    icon: "🛒",
  },
  {
    href: "/admin/repartos",
    label: "Repartos",
    description: "Rutas activas y pendientes",
    icon: "🚜",
  },
  {
    href: "/admin/ajustes",
    label: "Ajustes",
    description: "Permisos y catálogos",
    icon: "⚙️",
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fdfbf6] text-stone-700">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#f8f4ea] via-[#fefdf8] to-white" />
        <div className="absolute inset-x-0 top-[-40%] h-[55%] translate-y-[40%] bg-[radial-gradient(circle,_rgba(251,_146,_60,_0.32)_0%,_rgba(255,_255,_255,_0)_65%)] blur-3xl" />
        <div className="absolute right-[-12%] top-1/4 h-52 w-52 rounded-full bg-gradient-to-br from-amber-200/60 via-transparent to-transparent blur-[80px]" />
        <div className="absolute left-[-10%] bottom-0 h-64 w-64 rounded-full bg-gradient-to-br from-orange-200/60 via-transparent to-transparent blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:grid lg:grid-cols-[320px_1fr]">
        <aside className="rounded-[32px] border border-orange-100/70 bg-white/80 p-6 shadow-[0_15px_45px_rgba(74,107,55,0.08)] ring-1 ring-white/60 backdrop-blur-xl">
          <Link
            href="/admin"
            className="flex items-center gap-4 rounded-3xl border border-orange-100/80 bg-gradient-to-r from-white via-orange-50/80 to-white px-4 py-3 text-left shadow-inner"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-2xl">
              🌾
            </span>
            <span className="leading-tight">
              <span className="block text-xs uppercase tracking-[0.35em] text-orange-500">
                Gogi Eats
              </span>
              <span className="text-base font-semibold text-orange-900">
                Centro Rural
              </span>
            </span>
          </Link>

          <p className="mt-4 text-sm text-stone-500">
            Coordina usuarios, tiendas y rutas con una interfaz ligera inspirada
            en los mercados rurales. Nada de ruido, solo los datos esenciales.
          </p>

          <DesktopMenu links={NAV_LINKS} />

          <div className="mt-6 rounded-3xl border border-orange-50 bg-gradient-to-br from-orange-50/90 via-white to-orange-50/80 p-4 text-sm text-orange-900 shadow-inner">
            <p className="text-xs uppercase tracking-[0.2em] text-orange-400">
              Consejo del día
            </p>
            <p className="mt-1 font-semibold">
              Mantén actualizados los catálogos para que cada productor reciba
              pedidos en línea con la cosecha.
            </p>
          </div>
        </aside>

        <section className="flex flex-col rounded-[40px] border border-orange-50/80 bg-white/95 shadow-[0_30px_80px_rgba(66,77,46,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-orange-100/70 px-6 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-orange-400">
                Panel rural
              </p>
              <h1 className="text-2xl font-semibold text-orange-900">
                Operaciones del día
              </h1>
            </div>
            <MobileMenu links={NAV_LINKS} />
          </div>

          <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
            <div className="rounded-[32px] border border-orange-50/80 bg-white/90 p-4 shadow-inner">
              {children}
            </div>
          </main>

          <footer className="border-t border-orange-100/70 px-6 py-4 text-xs text-stone-400">
            Actualizado cada amanecer • Gogi Eats {new Date().getFullYear()}
          </footer>
        </section>
      </div>
      <AdminChatBubble />
    </div>
  );
}
