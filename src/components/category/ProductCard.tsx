"use client";

import { Heart } from "lucide-react";
import { useState } from "react";

import { AppImage } from "@/components/ui/app-image";
import type { CategoryKey } from "@/lib/categoryTheme";
import { getCategoryTheme } from "@/lib/categoryTheme";

type ProductCardProps = {
  category: CategoryKey;
  title: string;
  description: string;
  price: number;
  salePrice?: number;
  badge?: string;
  image: string;
};

export function ProductCard({
  category,
  title,
  description,
  price,
  salePrice,
  badge,
  image,
}: ProductCardProps) {
  const theme = getCategoryTheme(category);
  const [fav, setFav] = useState(false);
  const discount = salePrice ? Math.round((1 - salePrice / price) * 100) : null;

  return (
    <article className="group relative flex h-full max-w-full flex-col rounded-[18px] border border-[#e2d9d0] bg-gradient-to-br from-white via-[#faf7f2] to-[#f5efe8] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(0,0,0,0.12)] sm:rounded-[22px] sm:p-3">
      <div className="relative h-28 w-full overflow-hidden rounded-[14px] sm:h-36 sm:rounded-[18px]">
        <AppImage
          src={image}
          alt={title}
          width={640}
          height={480}
          aspectClassName="h-full"
          className="h-full w-full"
          imageClassName="object-cover"
          fallbackLabel="Sin foto"
        />
        <div className="absolute inset-0 bg-black/15" />
        {badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[#6d8b74]">
            {badge}
          </span>
        ) : null}
        {discount ? (
          <span
            className="absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: theme.discountColor }}
          >
            -{discount}%
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Favorito"
          onClick={() => setFav((prev) => !prev)}
          className={`absolute right-3 top-3 translate-y-10 rounded-full bg-white/80 p-2 text-[#c27b5a] transition active:scale-90 ${
            fav ? "animate-[pulse_0.4s] text-[#e05d2e]" : ""
          }`}
        >
          <Heart className="h-4 w-4" fill={fav ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-1.5 text-[#3e2f28] sm:mt-3 sm:gap-2">
        <header>
          <h3 className="line-clamp-2 font-serif text-sm font-semibold sm:text-lg">
            {title}
          </h3>
          <p className="line-clamp-2 font-sans text-[11px] leading-4 text-[#57534e] sm:text-sm">
            {description}
          </p>
        </header>

        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[#e05d2e] sm:text-lg">
            ${salePrice ?? price}
          </span>
          {salePrice ? (
            <span className="text-[11px] text-[#907c6c] line-through sm:text-sm">
              ${price}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="min-w-0 text-[10px] font-semibold text-[#6d8b74] sm:text-xs">
            Hecho con amor local
          </span>
          <button
            type="button"
            className="shrink-0 rounded-full bg-[#6d8b74] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d8b74] sm:px-3.5 sm:py-2 sm:text-xs"
          >
            Agregar
          </button>
        </div>
      </div>
    </article>
  );
}
