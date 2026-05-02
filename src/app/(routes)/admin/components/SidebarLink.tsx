"use client";

import Link from "next/link";
import { usePathname } from 'next/navigation';

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
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 md:px-4 md:py-3 ${
        isActive
          ? "bg-gradient-to-r from-rose-400/80 to-red-400/80 text-white shadow-md dark:from-rose-500/80 dark:to-red-500/80"
          : "text-zinc-600 hover:bg-white/40 dark:text-zinc-300 dark:hover:bg-white/10"
      }`}
    >
      <span className="text-base md:text-lg">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
