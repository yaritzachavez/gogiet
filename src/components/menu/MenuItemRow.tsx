"use client";

import clsx from "clsx";
import { Heart } from "lucide-react";
import Image from "next/image";
import { useState, type MouseEvent } from "react";
import { useScrollFadeIn } from "@/hooks/useScrollFadeIn";
import type { SectionTheme } from "./sectionThemes";

type MenuItemRowProps = {
  name: string;
  subtitle?: string;
  price?: number;
  oldPrice?: number;
  imageSrc: string;
  theme: SectionTheme;
  onSelect?: () => void;
  popular?: boolean;
};

export function MenuItemRow({
  name,
  subtitle,
  price,
  oldPrice,
  imageSrc,
  theme,
  onSelect,
  popular,
}: MenuItemRowProps) {
  const { ref, isVisible } = useScrollFadeIn<HTMLDivElement>();
  const [favorite, setFavorite] = useState(false);

  const handleSelect = () => {
    onSelect?.();
  };

  const handleFavoriteToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setFavorite((prev) => !prev);
  };

  const handleQuickAdd = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSelect?.();
  };

  return (
    <article
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelect();
        }
      }}
      className={clsx(
        "group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-3xl border px-4 py-4 text-left transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "bg-gradient-to-r from-white to-[#fff9f2] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.08)]",
        isVisible ? "reveal-visible" : "reveal",
      )}
      style={{ borderColor: theme.border }}
      aria-label={`Abrir detalles de ${name}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40 transition group-hover:opacity-60"
        style={{
          backgroundImage: theme.texture
            ? `${theme.texture}, linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`
            : `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        }}
      />
      <div className="relative flex flex-1 items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{theme.icon}</span>
            <p className="font-serif text-lg font-semibold text-[#3E2F28]">
              {name}
            </p>
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.3em] text-[#907C70]">
            {subtitle ?? "Especialidad de la casa"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[#3E2F28]">
            <span
              className="inline-flex items-center gap-1 rounded-full px-3 py-1"
              style={{
                backgroundColor: theme.accentMuted,
                border: `1px solid ${theme.border}`,
              }}
            >
              {theme.badgeEmoji} {theme.badgeLabel}
            </span>
            {popular ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-amber-600 shadow-sm">
                🔸 Favorito local
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-2">
              <span
                className="soft-pop font-serif text-xl font-semibold"
                style={{ color: theme.accent }}
              >
                {price ? `$${price.toFixed(2)}` : "—"}
              </span>
              {oldPrice ? (
                <span className="text-sm text-[#A08C80] line-through">
                  ${oldPrice.toFixed(2)}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleQuickAdd}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white transition duration-300 hover:scale-[1.03]"
              style={{
                backgroundColor: theme.accent,
                boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
              }}
            >
              Agregar
            </button>
          </div>
        </div>
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border bg-white/80 transition group-hover:-translate-y-0.5 group-hover:brightness-105">
          <Image
            src={imageSrc}
            alt={name}
            fill
            sizes="80px"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-0 bg-black/10 opacity-0 transition group-hover:opacity-100" />
        </div>
      </div>
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
        onClick={handleFavoriteToggle}
        className={clsx(
          "absolute right-4 top-4 rounded-full border bg-white/80 p-2 text-[#C6864A] transition",
          favorite ? "heartbeat" : "",
        )}
        style={{ borderColor: theme.border }}
      >
        <Heart
          className={clsx(
            "h-4 w-4",
            favorite ? "fill-current text-[#C6864A]" : "text-[#C6864A]",
          )}
        />
      </button>
    </article>
  );
}

export default MenuItemRow;
