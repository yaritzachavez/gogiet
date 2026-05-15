"use client";

import { useEffect, useState } from "react";

type Business = {
  id: number | string;
  name: string;
  city?: string;
  category?: string;
};

type ApiStore = {
  id: number | string;
  name?: string;
  nombre?: string;
  city?: string;
  ciudad?: string;
  category?: string;
  category_name?: string;
  giro?: string;
  business_category_name?: string;
  categories?: string[];
};

type Ally = {
  name: string;
  category: string;
  city: string;
};

export function ReviewRotator() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [isFading, setIsFading] = useState(false);

  // Fetch business list
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/stores");
        const data = await res.json();

        const parsed: Business[] = (data.stores ?? []).map((n: ApiStore) => ({
          id: n.id,
          name: n.name ?? n.nombre,
          city: n.city ?? n.ciudad,
          category:
            n.category ??
            n.category_name ??
            (Array.isArray(n.categories) ? n.categories[0] : undefined) ??
            n.giro ??
            n.business_category_name,
        }));

        setBusinesses(parsed);
      } catch (err) {
        console.error("Error fetching businesses:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const allies: Ally[] = businesses.slice(0, 5).map((b) => ({
    name: toCapitalCase(b.name),
    category: toCapitalCase(b.category ?? "General"),
    city: toCapitalCase(b.city ?? "Mazamitla"),
  }));

  // Rotator animation
  useEffect(() => {
    if (allies.length === 0) return;

    let fadeTimeout: number | undefined;
    const interval = window.setInterval(() => {
      setIsFading(true);
      fadeTimeout = window.setTimeout(() => {
        setActive((prev) => (prev + 1) % allies.length);
        setIsFading(false);
      }, 350);
    }, 6000);

    return () => {
      window.clearInterval(interval);
      if (fadeTimeout) window.clearTimeout(fadeTimeout);
    };
  }, [allies.length]);

  if (loading || allies.length === 0) return null;

  const ally = allies[active];

  return (
    <div className="mx-auto max-w-xl rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(32,32,32,0.96)_0%,rgba(18,18,18,0.96)_100%)] px-5 py-4 text-center text-[#f5f5f5] shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-6 sm:py-4">
      <p className="text-sm uppercase tracking-[0.5em] text-[#b3b3b3]">
        Negocios de la comunidad
      </p>

      <p
        className={`mt-2 text-base font-serif italic text-[#f5f5f5]/86 transition-opacity duration-500 sm:text-lg ${
          isFading ? "opacity-0" : "opacity-100"
        }`}
      >
        {ally.name}
      </p>

      <p className="mt-1.5 text-sm font-semibold text-orange-300">
        {ally.category}
      </p>

      <p className="mt-0.5 text-[11px] uppercase tracking-[0.35em] text-[#8f8f8f]">
        {ally.city}
      </p>

      <div className="mt-3 flex items-center justify-center gap-1">
        {allies.map((item, index) => (
          <span
            key={`${item.name}-${item.category}-${item.city}`}
            className={`h-1.5 w-6 rounded-full transition-all ${
              index === active ? "bg-[#ff6b00]" : "bg-white/12"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default ReviewRotator;

function toCapitalCase(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
