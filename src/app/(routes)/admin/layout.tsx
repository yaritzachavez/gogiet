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
      {/* Background decorative elements */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[url('/fondo-bosque.jpg')] bg-cover bg-center bg-fixed" />
        <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px] dark:bg-zinc-950/85" />

        <div className="absolute -left-40 top-[-18rem] h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-orange-200/60 via-orange-200/50 to-orange-300/10 blur-3xl sm:-left-20 sm:top-[-22rem] md:-left-32 lg:-left-40" />
        <div className="absolute inset-x-8 top-16 h-40 rounded-3xl bg-gradient-to-r from-orange-100/50 via-transparent to-orange-100/40 blur-2xl sm:inset-x-16 sm:top-24 md:inset-x-24 md:top-32 md:h-52" />
        <div className="absolute -right-20 bottom-[-14rem] h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-orange-200/50 via-orange-300/30 to-transparent blur-3xl md:-right-32 lg:-right-40" />
      </div>

      <div className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        {/* Sidebar - Hidden on mobile, visible on tablet+ */}
        <aside className="hidden border-b border-white/25 bg-white/20 p-4 shadow-lg ring-1 ring-white/40 backdrop-blur-3xl md:flex md:flex-col md:border-b-0 md:border-r md:p-5 lg:p-6 dark:border-white/10 dark:bg-white/5 dark:ring-white/10">
          <div className="rounded-2xl bg-gradient-to-br from-orange-500/50 to-orange-500/50 p-[1px] shadow-lg">
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-[14px] bg-white/55 px-3 py-2 text-left text-xs font-semibold text-orange-600 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/70 hover:shadow-md md:gap-3 md:px-4 md:py-3 md:text-sm dark:bg-zinc-900/70 dark:text-orange-200"
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

          <nav className="mt-3 grid gap-1.5 md:mt-4">
            {NAV_LINKS.map((link) => (
              <SidebarLink key={link.href} {...link} />
            ))}
          </nav>

          <div className="mt-auto space-y-2 pt-4 text-xs text-zinc-400">
            <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-zinc-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              <p className="font-semibold text-zinc-600 dark:text-zinc-200">
                v1.0.0
              </p>
              <p>Seguro y rápido</p>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <div className="relative flex flex-col">
          {/* Header - Responsive across all sizes */}
          <header className="sticky top-0 z-20 border-b border-white/60 bg-white/70 backdrop-blur-xl transition-shadow dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 md:py-4 lg:px-8">
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
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white/80 px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-white hover:text-zinc-900 dark:border-white/15 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
              >
                ← Ir al inicio
              </Link>
            </div>
          </header>

          {/* Main content - Optimized padding for each breakpoint */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 md:py-8 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
