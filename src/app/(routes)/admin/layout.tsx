import Link from "next/link";
import type { ReactNode } from "react";

import { MobileNav } from "./components/MobileNav";
import { SidebarLink } from "./components/SidebarLink";

const NAV_LINKS = [
  { href: "/admin", label: "Resumen", icon: "📊" },
  { href: "/admin/users", label: "Usuarios", icon: "👥" },
  { href: "/admin/business", label: "Negocios", icon: "🏪" },
  { href: "/admin/orders", label: "Pedidos", icon: "📦" },
  { href: "/admin/support", label: "Soporte", icon: "💬" },
  { href: "/admin/deliveries", label: "Repartos", icon: "🛵" },
  { href: "/admin/settings", label: "Ajustes", icon: "⚙️" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden text-zinc-900 dark:text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[url('/fondo.png')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" />

        <div className="absolute -left-40 top-[-18rem] h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-orange-500/20 via-orange-500/15 to-transparent blur-3xl sm:-left-20 sm:top-[-22rem] md:-left-32 lg:-left-40" />
        <div className="absolute inset-x-8 top-16 h-40 rounded-3xl bg-gradient-to-r from-white/5 via-transparent to-white/5 blur-2xl sm:inset-x-16 sm:top-24 md:inset-x-24 md:top-32 md:h-52" />
        <div className="absolute -right-20 bottom-[-14rem] h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-transparent blur-3xl md:-right-32 lg:-right-40" />
      </div>

      <div className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-black/55 p-5 shadow-lg ring-1 ring-white/10 backdrop-blur-3xl lg:flex lg:flex-col lg:p-6 dark:border-white/10 dark:bg-white/5 dark:ring-white/10">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500/50 to-orange-500/50 p-[1px] shadow-lg">
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-[14px] bg-black/70 px-3 py-2 text-left text-xs font-semibold text-orange-300 backdrop-blur transition hover:-translate-y-0.5 hover:bg-black/90 hover:shadow-md md:gap-3 md:px-4 md:py-3 md:text-sm dark:bg-zinc-900/70 dark:text-orange-200"
            >
              <span className="text-lg md:text-xl">🚀</span>
              <div className="leading-tight">
                <span className="block text-[10px] uppercase tracking-[0.2em] text-orange-400 md:text-xs md:tracking-[0.3em]">
                  Gogi Eats
                </span>
                <span className="text-xs md:text-sm">Panel Admin</span>
              </div>
            </Link>
          </div>

          <nav className="mt-4 grid gap-2">
            {NAV_LINKS.map((link) => (
              <SidebarLink key={link.href} {...link} />
            ))}
          </nav>

          <div className="mt-auto space-y-2 pt-4 text-xs text-zinc-400">
            <div className="rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-zinc-300 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              <p className="font-semibold text-zinc-600 dark:text-zinc-200">
                v1.0.0
              </p>
              <p>Seguro y rápido</p>
            </div>
          </div>
        </aside>

        <div className="relative flex flex-col">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-black/70 backdrop-blur-xl transition-shadow dark:border-white/10 dark:bg-white/5">
            <div className="app-shell flex items-center justify-between gap-3 py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <MobileNav links={NAV_LINKS} />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-orange-400 sm:text-xs sm:tracking-[0.3em]">
                    Panel
                  </p>
                  <h1 className="text-base font-bold text-zinc-700 sm:text-lg md:text-xl dark:text-zinc-100">
                    Dashboard
                  </h1>
                </div>
              </div>
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-white/10 bg-black/70 px-3 py-2 text-xs font-semibold text-zinc-200 shadow-sm transition hover:bg-black max-sm:hidden dark:border-white/15 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
              >
                ← Ir al inicio
              </Link>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="app-shell w-full py-4 sm:py-6 md:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
