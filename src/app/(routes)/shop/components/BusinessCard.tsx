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
      className="group relative flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white text-left shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(15,23,42,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
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
          <span className="absolute left-3 top-3 rounded-full bg-orange-600 px-3 py-1 text-[11px] font-black text-white shadow-lg shadow-orange-600/25">
            {discount}
          </span>
        ) : null}
        <button
          type="button"
          className={`absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-white/95 shadow-lg shadow-slate-900/10 transition hover:text-orange-600 ${
            isFavorite ? "text-orange-600" : "text-slate-500"
          }`}
          aria-label={isFavorite ? "Quitar favorito" : "Guardar favorito"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite?.(businessId);
          }}
        >
          <Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-4 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-black tracking-tight text-slate-950 sm:text-lg">
            {normalizedName}
          </h2>
          <p className="mt-1 truncate text-sm font-semibold text-slate-500">
            {category ?? "Local aliado"}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-black text-slate-950">
            <Star className="h-4 w-4 fill-orange-500 text-orange-500" />
            {rating.toFixed(1)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            <Clock3 className="h-4 w-4" />
            {etaMinutes ? `${etaMinutes} min` : "25 min"}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
              deliveryFee === 0 ? "text-emerald-600" : "text-slate-700"
            } ${deliveryFee === 0 ? "bg-emerald-50" : "bg-slate-100"}`}
          >
            <Bike className="h-4 w-4" />
            {deliveryFee === 0 ? "Gratis" : `$${deliveryFee}`}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-orange-500" />
            {cityLower?.replace(/\b\w/g, (c) => c.toUpperCase()) ??
              "Cerca de ti"}
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-900">
            {priceTier}
          </span>
        </div>
        {badge ? (
          <span className="mt-3 w-fit rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-black text-orange-600">
            {badge}
          </span>
        ) : null}
      </div>
    </CardShell>
  );
}
