"use client";

import { Bike, Clock3, Heart, MapPin, Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppImage } from "@/components/ui/app-image";

interface BusinessCardProps {
  businessId: number | string;
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
  isFavorite?: boolean;
  onToggleFavorite?: (businessId: number | string) => void;
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
  businessId,
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
  isFavorite = false,
  onToggleFavorite,
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
      className="group relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200/90 bg-white text-left shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(15,23,42,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 sm:rounded-[24px]"
    >
      <div className="relative overflow-hidden bg-slate-100">
        <div className="relative aspect-[4/3] w-full">
          <AppImage
            src={thumbnailPath}
            alt={name}
            width={640}
            height={480}
            aspectClassName="aspect-[4/3]"
            className="h-full w-full"
            imageClassName="object-cover transition duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            fallbackLabel="Sin foto"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/5 to-black/30" />
        </div>
        {discount ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-orange-600 px-2 py-1 text-[10px] font-black text-white shadow-lg shadow-orange-600/25 sm:left-3 sm:top-3 sm:px-3 sm:text-[11px]">
            {discount}
          </span>
        ) : null}
        <button
          type="button"
          className={`absolute right-2.5 top-2.5 inline-flex size-8 items-center justify-center rounded-full bg-white/95 shadow-lg shadow-slate-900/10 transition hover:text-orange-600 sm:right-3 sm:top-3 sm:size-9 ${
            isFavorite ? "text-orange-600" : "text-slate-500"
          }`}
          aria-label={isFavorite ? "Quitar favorito" : "Guardar favorito"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite?.(businessId);
          }}
        >
          <Heart
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
              isFavorite ? "fill-current" : ""
            }`}
          />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-sm font-black leading-5 tracking-tight text-slate-950 sm:text-lg">
            {normalizedName}
          </h2>
          <p className="mt-1 truncate text-[11px] font-semibold text-slate-500 sm:text-sm">
            {category ?? "Local aliado"}
          </p>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-600 sm:mt-3 sm:gap-x-2 sm:gap-y-2 sm:text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-black text-slate-950 sm:px-2.5">
            <Star className="h-3.5 w-3.5 fill-orange-500 text-orange-500 sm:h-4 sm:w-4" />
            {rating.toFixed(1)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 sm:px-2.5">
            <Clock3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {etaMinutes ? `${etaMinutes} min` : "25 min"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 sm:px-2.5 ${
              deliveryFee === 0 ? "text-emerald-600" : "text-slate-700"
            } ${deliveryFee === 0 ? "bg-emerald-50" : "bg-slate-100"}`}
          >
            <Bike className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {deliveryFee === 0 ? "Gratis" : `$${deliveryFee}`}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 sm:pt-3">
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-slate-500 sm:gap-1.5 sm:text-xs">
            <MapPin className="h-3.5 w-3.5 text-orange-500" />
            {cityLower?.replace(/\b\w/g, (c) => c.toUpperCase()) ??
              "Cerca de ti"}
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-900 sm:px-2.5 sm:text-xs">
            {priceTier}
          </span>
        </div>
        {badge ? (
          <span className="mt-2.5 w-fit rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-600 sm:mt-3 sm:px-2.5 sm:text-[11px]">
            {badge}
          </span>
        ) : null}
      </div>
    </CardShell>
  );
}
