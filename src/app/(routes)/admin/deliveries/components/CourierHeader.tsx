"use client";

import Link from "next/link";

import { CourierHeaderProps } from "@/types/Couriers";



export function CourierHeader({
  courierId,
  name,
  zone,
  shift,
  status,
}: CourierHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
          Repartidor #{courierId}
        </p>
        <h1 className="text-3xl font-semibold text-red-700">{name}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          {shift} · {zone}
        </p>
      </div>
      <Link
        href="/admin/repartos"
        className="inline-flex items-center rounded-lg border border-red-200/60 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-white/20 dark:text-red-200 dark:hover:bg-white/10"
      >
        ← Volver a la lista
      </Link>
    </header>
  );
}
