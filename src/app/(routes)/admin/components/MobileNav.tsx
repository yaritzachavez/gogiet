"use client";

import Link from "next/link";
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

  return (
    <>
      {/* Mobile menu button - Hidden on md+ */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-col gap-1.5 rounded-lg p-2 transition-colors hover:bg-white/40 md:hidden dark:hover:bg-white/10"
        aria-label="Toggle menu"
      >
        <div className="h-0.5 w-5 bg-zinc-700 transition-all dark:bg-zinc-300" />
        <div className="h-0.5 w-5 bg-zinc-700 transition-all dark:bg-zinc-300" />
        <div className="h-0.5 w-5 bg-zinc-700 transition-all dark:bg-zinc-300" />
      </button>

      {/* Mobile menu - Visible when open */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 border-b border-white/25 bg-white/95 backdrop-blur-lg md:hidden dark:border-white/10 dark:bg-zinc-950/95">
          <nav className="flex flex-col gap-1 p-4 sm:p-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-rose-100/50 dark:hover:bg-white/5"
              >
                <span className="text-lg">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
