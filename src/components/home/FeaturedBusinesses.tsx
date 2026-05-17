"use client";

import { ChevronRight, MapPin, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";
import { AppImage } from "@/components/ui/app-image";
import { EmptyState } from "@/components/ui/empty-state";

type FeaturedBusiness = {
  id: number;
  name: string;
  city: string | null;
  district: string | null;
  category: string;
  categories: string[];
  logoUrl: string | null;
  imageUrl: string | null;
  ratingAverage: number;
  productCount: number;
  isOpen: boolean;
};

type FeaturedBusinessesResponse = {
  success: boolean;
  businesses?: FeaturedBusiness[];
  error?: string;
  details?: string;
};

function FeaturedBusinessesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`featured-skeleton-${index + 1}`}
          className="overflow-hidden rounded-[24px] border border-white/8 bg-[#1a1a1a] shadow-[0_18px_45px_rgba(0,0,0,0.28)]"
        >
          <div className="h-28 animate-pulse bg-gradient-to-br from-[#202020] via-[#181818] to-[#111111] sm:h-36" />
          <div className="space-y-2.5 p-3 sm:p-5">
            <div className="h-3 w-20 animate-pulse rounded-full bg-orange-500/20" />
            <div className="h-5 w-3/4 animate-pulse rounded-full bg-white/8" />
            <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-white/6" />
            <div className="h-9 animate-pulse rounded-2xl bg-white/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FeaturedBusinesses() {
  const [businesses, setBusinesses] = useState<FeaturedBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadFeaturedBusinesses() {
      try {
        const response = await fetch("/api/public/featured-businesses", {
          cache: "no-store",
        });
        const payload: FeaturedBusinessesResponse = await response.json();

        if (!active) {
          return;
        }

        if (!response.ok || !payload.success) {
          setError(
            payload.details ??
              payload.error ??
              "No se pudieron cargar los negocios destacados.",
          );
          setBusinesses([]);
          return;
        }

        setBusinesses(payload.businesses ?? []);
        setError(null);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudieron cargar los negocios destacados.",
        );
        setBusinesses([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadFeaturedBusinesses();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="px-4 py-8 sm:py-18">
      <div className="mx-auto max-w-7xl">
        <HomeSectionHeader
          eyebrow="Negocios destacados"
          title="Sabores que ya están moviendo Mazamitla"
          description="Explora negocios activos con identidad local, buena presentación y productos listos para pedir sin salir de casa."
        />

        {loading ? <FeaturedBusinessesSkeleton /> : null}

        {!loading && error ? (
          <EmptyState
            icon={Store}
            title="Todavía no pudimos cargar los negocios"
            description={error}
          />
        ) : null}

        {!loading && !error && businesses.length === 0 ? (
          <EmptyState
            icon={Store}
            title="Aún no hay negocios destacados"
            description="En cuanto los primeros aliados publiquen su menú, aquí verás una selección viva y lista para descubrir."
          />
        ) : null}

        {!loading && !error && businesses.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
            {businesses.map((business) => (
              <article
                key={business.id}
                className="group flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(32,32,32,0.98)_0%,rgba(22,22,22,0.96)_100%)] shadow-[0_18px_36px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1 hover:border-orange-500/30 hover:shadow-[0_28px_65px_rgba(255,107,0,0.16)] sm:rounded-[26px]"
              >
                <div className="relative h-28 overflow-hidden bg-gradient-to-br from-[#1b1b1b] via-[#111111] to-black sm:h-36">
                  <AppImage
                    src={business.imageUrl}
                    alt={business.name}
                    width={640}
                    height={480}
                    aspectClassName="aspect-[4/3]"
                    className="h-full w-full"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    imageClassName="transition duration-500 group-hover:scale-105"
                    fallbackLabel="Negocio"
                  />
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[10px] font-bold text-[#f5f5f5] shadow-lg backdrop-blur-md sm:left-3 sm:top-3 sm:px-2.5 sm:py-1.5 sm:text-[11px]">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        business.isOpen ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    {business.isOpen ? "Abierto ahora" : "Cerrado"}
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-3 sm:p-4">
                  <div className="mb-2.5 flex items-center gap-2.5 sm:mb-3 sm:gap-3">
                    <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-[16px] border border-white/8 bg-[#202020] sm:h-14 sm:w-14 sm:rounded-2xl">
                      <AppImage
                        src={business.logoUrl}
                        alt={`${business.name} logo`}
                        width={112}
                        height={112}
                        aspectClassName="aspect-square"
                        className="h-full w-full"
                        objectFit="contain"
                        imageClassName="p-2"
                        fallbackLabel={business.name.slice(0, 2).toUpperCase()}
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-300 sm:text-xs sm:tracking-[0.18em]">
                        {business.category}
                      </p>
                      <h3 className="line-clamp-2 text-sm font-black leading-5 text-[#f5f5f5] sm:text-lg">
                        {business.name}
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-[#b3b3b3] sm:space-y-1.5 sm:text-sm">
                    <p className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-400 sm:h-4 sm:w-4" />
                      {business.city ?? "Mazamitla"}
                      {business.district ? `, ${business.district}` : ""}
                    </p>
                    <p className="font-medium text-[#8c8c8c]">
                      {business.productCount} productos disponibles
                    </p>
                  </div>

                  <Link
                    href={`/shop/${business.id}`}
                    className="mt-3 inline-flex items-center justify-between rounded-2xl border border-orange-500/30 bg-orange-500/12 px-3 py-2 text-xs font-bold text-[#f5f5f5] transition hover:bg-orange-500 hover:text-white sm:mt-4 sm:px-4 sm:py-2.5 sm:text-sm"
                  >
                    Ver negocio
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
