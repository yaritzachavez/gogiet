"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavLink {
  href: string;
  label: string;
  icon: string;
}

interface MobileNavProps {
  links: NavLink[];
}

export function MobileNav({ links }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6 transition-colors hover:bg-white/12 lg:hidden"
        aria-label="Toggle menu"
      >
        <div className="flex flex-col gap-1.5">
          <div className="h-0.5 w-5 bg-zinc-100 transition-all" />
          <div className="h-0.5 w-5 bg-zinc-100 transition-all" />
          <div className="h-0.5 w-5 bg-zinc-100 transition-all" />
        </div>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            aria-label="Cerrar menú"
            onClick={() => setIsOpen(false)}
          />
          <nav className="safe-bottom absolute left-0 top-0 flex h-full w-[min(22rem,100%-2rem)] flex-col gap-1 overflow-y-auto border-r border-white/10 bg-black/95 p-4 backdrop-blur-xl touch-scroll sm:p-6">
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
                Panel admin
              </p>
              <p className="mt-2 text-sm text-zinc-300">
                Navegación optimizada para pantallas pequeñas.
              </p>
            </div>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-300 ${
                  pathname === link.href
                    ? "border-orange-400/40 bg-gradient-to-r from-orange-500/25 via-orange-500/15 to-transparent text-white"
                    : "border-transparent text-zinc-100/92 hover:border-orange-400/15 hover:bg-white/8 hover:text-white"
                }`}
              >
                <span
                  className={`text-lg ${
                    pathname === link.href
                      ? "text-orange-300"
                      : "text-zinc-200/90"
                  }`}
                >
                  {link.icon}
                </span>
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
