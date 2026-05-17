"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarLinkProps {
  href: string;
  label: string;
  icon: string;
}

export function SidebarLink({ href, label, icon }: SidebarLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-300 hover:scale-[1.01] md:px-4 md:py-3 ${
        isActive
          ? "border-orange-400/40 bg-gradient-to-r from-orange-500/30 via-orange-500/18 to-transparent text-white shadow-[0_18px_40px_-24px_rgba(255,107,0,0.9)]"
          : "border-transparent text-zinc-100/92 hover:border-orange-400/20 hover:bg-white/8 hover:text-white"
      }`}
    >
      <span
        className={`text-base transition-transform duration-300 md:text-lg ${
          isActive
            ? "scale-110 text-orange-300"
            : "text-zinc-200/90 group-hover:scale-105 group-hover:text-orange-300"
        }`}
      >
        {icon}
      </span>
      <span
        className={`tracking-[0.01em] ${
          isActive ? "text-white" : "text-zinc-100/92 group-hover:text-white"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}
