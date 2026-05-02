"use client";

import { useEffect, useState } from "react";

import type { CategoryKey } from "@/lib/categoryTheme";
import { getCategoryTheme } from "@/lib/categoryTheme";

type CategoryHeroProps = {
  category: CategoryKey;
};

export function CategoryHero({ category }: CategoryHeroProps) {
  const theme = getCategoryTheme(category);
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % theme.microcopy.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [theme.microcopy.length]);

  return (
    <section
      className={`rounded-[38px] border border-[#e2d9d0] bg-gradient-to-br ${theme.heroGradient} p-6 shadow-[0_30px_80px_rgba(62,47,40,0.12)] backdrop-blur`}
    >
      <p className="text-xs uppercase tracking-[0.4em] text-[#c9a46a]">
        {theme.emoji} {theme.name}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-semibold text-[#3e2f28]">
            {theme.microcopy[0]}
          </h1>
          <p
            key={`${category}-${phraseIndex}`}
            className="font-sans text-sm text-[#57534e] transition-opacity duration-500"
          >
            {theme.microcopy[phraseIndex]}
          </p>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/70 px-4 py-2 text-sm text-[#5c4c43] shadow-inner backdrop-blur">
          Descubre algo nuevo hoy ✨
        </div>
      </div>
    </section>
  );
}
