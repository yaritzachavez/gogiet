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
    city: toCapitalCase(b.city ?? "—"),
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
    <div className="mx-auto mt-10 max-w-2xl rounded-[28px] border border-[#E2D9D0] bg-white/90 px-6 py-5 text-center text-[#3E2F28] shadow-[0_15px_45px_rgba(0,0,0,0.12)]">
      <p className="text-sm uppercase tracking-[0.5em] text-[#8C766B]">
        Partner Businesses
      </p>

      <p
        className={`mt-3 text-lg font-serif italic text-[#3E2F28]/80 transition-opacity duration-500 ${
          isFading ? "opacity-0" : "opacity-100"
        }`}
      >
        {ally.name}
      </p>

      <p className="mt-2 text-sm font-semibold text-[#6D4C41]">
        {ally.category}
      </p>

      <p className="text-xs uppercase tracking-[0.4em] text-[#8C766B]">
        {ally.city}
      </p>

      <div className="mt-4 flex items-center justify-center gap-1">
        {allies.map((item, index) => (
          <span
            key={`${item.name}-${item.category}-${item.city}`}
            className={`h-1.5 w-6 rounded-full transition-all ${
              index === active ? "bg-[#6D8B74]" : "bg-[#E2D9D0]"
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
