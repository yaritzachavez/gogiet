"use client";

import { Bike, Clock3, Heart, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

interface BusinessCardProps {
  id: number | string;
  name: string;
  city?: string;
  category?: string;
  rating?: number;
  imagen?: string;
  badge?: string;
  etaMinutes?: number;
  deliveryFee?: number;
  priceTier?: string;
  discount?: string;
  href?: string;
  onClick?: () => void;
}

const CardShell = ({
  children,
  className,
  href,
  onClick,
}: {
  children: ReactNode;
  className: string;
  href?: string;
  onClick?: () => void;
}) => {
  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
};

export default function BusinessCard({
  name,
  city,
  category,
  rating = 4.5,
  imagen,
  badge,
  etaMinutes,
  deliveryFee,
  priceTier = "$$",
  discount,
  href,
  onClick,
}: BusinessCardProps) {
  const thumbnailPath = imagen
    ? imagen.startsWith("/public/")
      ? imagen.replace(/^\/public/, "")
      : imagen
    : "/default-business.png";

  function normalizeName(name: string) {
    let clean = name.toLowerCase();
    clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    clean = clean.replace(/ñ/g, "n");
    clean = clean.replace(/[^a-z0-9 ]/g, "");
    clean = clean.trim().replace(/\s+/g, " ");
    clean = clean.replace(/\b\w/g, (c) => c.toUpperCase());

    return clean;
  }

  const normalizedName = normalizeName(name);
  const cityLower = city?.toLocaleLowerCase();

  return (
    <CardShell
      href={href}
      onClick={onClick}
      className="group relative flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
    >
      <div className="relative overflow-hidden bg-slate-100">
        <div className="relative aspect-[4/3] w-full">
          <Image
            src={thumbnailPath}
            alt={name}
            fill
            unoptimized={Boolean(imagen)}
            className="object-cover transition duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/20" />
        </div>
        {discount ? (
          <span className="absolute left-2 top-2 rounded-lg bg-orange-600 px-2.5 py-1 text-[11px] font-black text-white">
            {discount}
          </span>
        ) : null}
        <button
          type="button"
          className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm transition hover:text-orange-600"
          aria-label="Guardar favorito"
          onClick={(event) => {
            event.preventDefault();
          }}
        >
          <Heart className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-3 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-black text-slate-950">
            {normalizedName}
          </h2>
          <p className="mt-1 truncate text-sm font-semibold text-slate-500">
            {category ?? "Local aliado"}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-1 font-black text-slate-950">
            <Star className="h-4 w-4 fill-orange-500 text-orange-500" />
            {rating.toFixed(1)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-4 w-4" />
            {etaMinutes ? `${etaMinutes} min` : "25 min"}
          </span>
          <span
            className={`inline-flex items-center gap-1 ${
              deliveryFee === 0 ? "text-emerald-600" : "text-slate-700"
            }`}
          >
            <Bike className="h-4 w-4" />
            {deliveryFee === 0 ? "Gratis" : `$${deliveryFee}`}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="min-w-0 truncate text-xs font-semibold text-slate-500">
            {cityLower?.replace(/\b\w/g, (c) => c.toUpperCase()) ??
              "Cerca de ti"}
          </span>
          <span className="shrink-0 text-xs font-black text-slate-900">
            {priceTier}
          </span>
        </div>
        {badge ? (
          <span className="mt-2 w-fit rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-black text-orange-600">
            {badge}
          </span>
        ) : null}
      </div>
    </CardShell>
  );
}
