"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

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
      {/* Mobile menu button - Hidden on md+ */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-col gap-1.5 rounded-lg p-2 transition-colors hover:bg-white/10 md:hidden"
        aria-label="Toggle menu"
      >
        <div className="h-0.5 w-5 bg-zinc-100 transition-all" />
        <div className="h-0.5 w-5 bg-zinc-100 transition-all" />
        <div className="h-0.5 w-5 bg-zinc-100 transition-all" />
      </button>

      {/* Mobile menu - Visible when open */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 border-b border-white/10 bg-black/95 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-1 p-4 sm:p-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-all duration-300 ${
                  pathname === link.href
                    ? "border-orange-400/40 bg-gradient-to-r from-orange-500/25 via-orange-500/15 to-transparent text-white"
                    : "border-transparent text-zinc-100/92 hover:border-orange-400/15 hover:bg-white/8 hover:text-white"
                }`}
              >
                <span
                  className={`text-lg ${
                    pathname === link.href ? "text-orange-300" : "text-zinc-200/90"
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
