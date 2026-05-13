"use client";

import { ChevronRight, Package } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";
import { AppImage } from "@/components/ui/app-image";
import { EmptyState } from "@/components/ui/empty-state";

type PopularProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  imageUrl: string | null;
  businessId: number;
  businessName: string;
  category: string;
};

type PopularProductsResponse = {
  success: boolean;
  products?: PopularProduct[];
  error?: string;
  details?: string;
};

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function PopularProductsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`product-skeleton-${index + 1}`}
          className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
        >
          <div className="h-48 animate-pulse bg-gradient-to-br from-slate-100 to-orange-50" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-20 animate-pulse rounded-full bg-orange-100" />
            <div className="h-7 w-4/5 animate-pulse rounded-full bg-slate-200" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-slate-100" />
            <div className="h-10 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PopularProducts() {
  const [products, setProducts] = useState<PopularProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        const response = await fetch("/api/public/popular-products", {
          cache: "no-store",
        });
        const payload: PopularProductsResponse = await response.json();

        if (!active) {
          return;
        }

        if (!response.ok || !payload.success) {
          setError(
            payload.details ??
              payload.error ??
              "No se pudieron cargar los productos populares.",
          );
          setProducts([]);
          return;
        }

        setProducts(payload.products ?? []);
        setError(null);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudieron cargar los productos populares.",
        );
        setProducts([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="bg-[linear-gradient(180deg,_rgba(255,247,237,0.7),_rgba(255,255,255,1))] px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <HomeSectionHeader
          eyebrow="Productos populares"
          title="Lo que más antojo está provocando hoy"
          description="Una selección visual de productos activos para que descubras rápido qué pedir y desde qué negocio local hacerlo."
        />

        {loading ? <PopularProductsSkeleton /> : null}

        {!loading && error ? (
          <EmptyState
            icon={Package}
            title="No pudimos cargar los productos por ahora"
            description={error}
          />
        ) : null}

        {!loading && !error && products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Todavía no hay productos destacados"
            description="Cuando los negocios publiquen su menú, aquí verás opciones listas para explorar y pedir."
          />
        ) : null}

        {!loading && !error && products.length > 0 ? (
          <div className="-mx-4 overflow-x-auto px-4 pb-2">
            <div className="flex snap-x gap-4 pb-3 md:grid md:min-w-0 md:grid-cols-2 xl:grid-cols-4">
              {products.map((product) => (
                <article
                  key={product.id}
                  className="group flex min-w-[285px] snap-start flex-col overflow-hidden rounded-[30px] border border-orange-100/70 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_65px_rgba(249,115,22,0.16)] md:min-w-0"
                >
                  <div className="relative h-52 overflow-hidden bg-gradient-to-br from-orange-50 to-slate-100">
                    <AppImage
                      src={product.imageUrl}
                      alt={product.name}
                      width={640}
                      height={640}
                      aspectClassName="aspect-square"
                      className="h-full w-full"
                      imageClassName="transition duration-500 group-hover:scale-105"
                      fallbackLabel="Producto"
                    />
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
                      {product.category}
                    </p>
                    <h3 className="mt-2 line-clamp-2 text-xl font-black text-slate-950">
                      {product.name}
                    </h3>
                    <p className="mt-2 line-clamp-2 min-h-[3rem] text-sm leading-6 text-slate-500">
                      {product.description ??
                        `Disponible en ${product.businessName}.`}
                    </p>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {product.businessName}
                      </p>
                      <div className="mt-2 flex items-end gap-2">
                        <span className="text-2xl font-black text-slate-950">
                          {formatMoney(product.price, product.currency)}
                        </span>
                        {product.originalPrice != null &&
                        product.originalPrice > product.price ? (
                          <span className="text-sm font-semibold text-slate-400 line-through">
                            {formatMoney(
                              product.originalPrice,
                              product.currency,
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <Link
                      href={`/shop/${product.businessId}`}
                      className="mt-5 inline-flex items-center justify-between rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
                    >
                      Ver producto
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
