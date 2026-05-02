"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type AdminNavLink = {
  href: string;
  label: string;
  description?: string;
  icon?: string;
};

export function DesktopMenu({ links }: { links: AdminNavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden flex-col gap-2 lg:flex">
      {links.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/admin" && pathname.startsWith(link.href));

        return (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              "flex gap-3 rounded-2xl border px-3.5 py-3 transition-all",
              "border-orange-200/60 bg-white/70 text-left text-sm text-stone-500 shadow-sm ring-1 ring-orange-50/80 hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-900 hover:shadow-md",
              active &&
                "border-orange-400/80 bg-gradient-to-r from-orange-50 to-orange-50 text-orange-900 ring-orange-200 shadow-lg",
            )}
          >
            {link.icon ? (
              <span
                aria-hidden
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-xl text-orange-700 shadow-inner",
                  active && "bg-orange-100 text-orange-900",
                )}
              >
                {link.icon}
              </span>
            ) : null}
            <span className="flex flex-col leading-tight">
              <span className="font-semibold text-stone-600">{link.label}</span>
              {link.description ? (
                <span className="text-xs text-stone-400">
                  {link.description}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMenu({ links }: { links: AdminNavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (!pathname) return;
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menú"
        className="inline-flex items-center gap-2 rounded-2xl border border-orange-200/70 bg-white/80 px-4 py-2 text-sm font-medium text-orange-800 shadow-sm ring-1 ring-orange-50 transition hover:-translate-y-0.5 hover:shadow-md lg:hidden"
        onClick={() => setOpen(true)}
      >
        <span className="text-lg">☰</span>
        Menú
      </button>

      <div
        className={clsx(
          "fixed inset-0 z-40 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          className={clsx(
            "relative h-full w-full transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
        >
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 z-0 h-full w-full cursor-pointer bg-stone-950/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navegación del panel rural"
            className={clsx(
              "absolute left-0 top-0 z-10 h-full w-[85vw] max-w-xs border-r border-orange-100/80 bg-gradient-to-b from-white/95 to-orange-50/90 p-5 text-stone-600 shadow-2xl transition-transform duration-300 ease-out",
              open ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-orange-900">
                Panel rural
              </p>
              <button
                type="button"
                className="rounded-full p-2 text-lg text-stone-400 transition hover:rotate-90 hover:text-orange-700"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              {links.map((link) => {
                const active =
                  pathname === link.href ||
                  (link.href !== "/admin" && pathname.startsWith(link.href));

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={clsx(
                      "rounded-2xl border px-3.5 py-3 text-sm transition",
                      "border-orange-100/70 bg-white/90 text-stone-500 shadow-sm hover:border-orange-200 hover:text-orange-900",
                      active &&
                        "border-orange-300 bg-orange-50 text-orange-900 shadow-md",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {link.icon ? (
                        <span className="text-lg" aria-hidden>
                          {link.icon}
                        </span>
                      ) : null}
                      <div className="flex flex-col">
                        <span className="font-semibold">{link.label}</span>
                        {link.description ? (
                          <span className="text-xs text-stone-400">
                            {link.description}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
