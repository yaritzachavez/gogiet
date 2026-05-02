"use client";

import { Heart } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

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
    <article className="group relative flex flex-col rounded-[22px] border border-[#e2d9d0] bg-gradient-to-br from-white via-[#faf7f2] to-[#f5efe8] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_14px_32px_rgba(0,0,0,0.12)]">
      <div className="relative h-40 w-full overflow-hidden rounded-[18px]">
        <Image src={image} alt={title} fill className="object-cover" />
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

      <div className="mt-3 flex flex-col gap-2 text-[#3e2f28]">
        <header>
          <h3 className="font-serif text-lg font-semibold">{title}</h3>
          <p className="font-sans text-sm text-[#57534e]">{description}</p>
        </header>

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-[#e05d2e]">
            ${salePrice ?? price}
          </span>
          {salePrice ? (
            <span className="text-sm text-[#907c6c] line-through">
              ${price}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between">
          <span className="text-xs font-semibold text-[#6d8b74]">
            Hecho con amor local
          </span>
          <button
            type="button"
            className="rounded-full bg-[#6d8b74] px-4 py-2 text-xs font-semibold text-white transition hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d8b74]"
          >
            Agregar
          </button>
        </div>
      </div>
    </article>
  );
}
