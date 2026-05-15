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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`featured-skeleton-${index + 1}`}
          className="overflow-hidden rounded-[30px] border border-white/8 bg-[#1a1a1a] shadow-[0_18px_45px_rgba(0,0,0,0.28)]"
        >
          <div className="h-44 animate-pulse bg-gradient-to-br from-[#202020] via-[#181818] to-[#111111]" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-24 animate-pulse rounded-full bg-orange-500/20" />
            <div className="h-7 w-3/4 animate-pulse rounded-full bg-white/8" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-white/6" />
            <div className="h-11 animate-pulse rounded-2xl bg-white/6" />
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
    <section className="px-4 py-14 sm:py-18">
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
          <div className="-mx-4 overflow-x-auto px-4 pb-2">
            <div className="flex snap-x gap-4 pb-3 md:grid md:min-w-0 md:grid-cols-2 xl:grid-cols-4">
              {businesses.map((business) => (
                <article
                  key={business.id}
                  className="group flex min-w-[240px] max-w-[270px] snap-start flex-col overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(32,32,32,0.98)_0%,rgba(22,22,22,0.96)_100%)] shadow-[0_22px_50px_rgba(0,0,0,0.32)] transition duration-300 hover:-translate-y-1 hover:border-orange-500/30 hover:shadow-[0_28px_65px_rgba(255,107,0,0.16)] md:min-w-0 md:max-w-none"
                >
                  <div className="relative h-36 overflow-hidden bg-gradient-to-br from-[#1b1b1b] via-[#111111] to-black">
                    <AppImage
                      src={business.imageUrl}
                      alt={business.name}
                      width={640}
                      height={480}
                      aspectClassName="aspect-[4/3]"
                      className="h-full w-full"
                      imageClassName="transition duration-500 group-hover:scale-105"
                      fallbackLabel="Negocio"
                    />
                    <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-2.5 py-1.5 text-[11px] font-bold text-[#f5f5f5] shadow-lg backdrop-blur-md">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          business.isOpen ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      {business.isOpen ? "Abierto ahora" : "Cerrado"}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-[#202020]">
                        <AppImage
                          src={business.logoUrl}
                          alt={`${business.name} logo`}
                          width={112}
                          height={112}
                          aspectClassName="aspect-square"
                          className="h-full w-full"
                          objectFit="contain"
                          imageClassName="p-2"
                          fallbackLabel={business.name
                            .slice(0, 2)
                            .toUpperCase()}
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                          {business.category}
                        </p>
                        <h3 className="truncate text-lg font-black text-[#f5f5f5]">
                          {business.name}
                        </h3>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-sm text-[#b3b3b3]">
                      <p className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-orange-400" />
                        {business.city ?? "Mazamitla"}
                        {business.district ? `, ${business.district}` : ""}
                      </p>
                      <p className="font-medium text-[#8c8c8c]">
                        {business.productCount} productos listos para explorar
                      </p>
                    </div>

                    <Link
                      href={`/shop/${business.id}`}
                      className="mt-4 inline-flex items-center justify-between rounded-2xl border border-orange-500/30 bg-orange-500/12 px-4 py-2.5 text-sm font-bold text-[#f5f5f5] transition hover:bg-orange-500 hover:text-white"
                    >
                      Ver negocio
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
