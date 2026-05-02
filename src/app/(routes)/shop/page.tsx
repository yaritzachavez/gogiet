"use client";

import {
  Bike,
  ChevronRight,
  Coffee,
  Flame,
  Flower2,
  IceCreamBowl,
  MapPin,
  Pizza,
  Search,
  Sparkles,
  Store,
  Tag,
  Utensils,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import BusinessCard from "./components/BusinessCard";

type Business = {
  id: number | string;
  name: string;
  city?: string;
  category?: string;
  rating: number;
  etaMinutes: number;
  deliveryFee: number;
  priceTier: string;
  badge: string;
  discount?: string;
  mainPhoto?: string | null;
  avatar_url?: string | null;
};

type ApiBusiness = {
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
  avatar_url?: string | null;
};

type ActiveOrder = {
  id: number;
  status: string;
  total: number;
  businessName?: string;
};

const PLACEHOLDER_IDS = Array.from(
  { length: 10 },
  (_, i) => `placeholder-${i}`,
);

const STATIC_FILTERS = [
  { label: "Popular", icon: Flame, color: "bg-red-500", match: "popular" },
  { label: "Ofertas", icon: Tag, color: "bg-emerald-400", match: "offers" },
  { label: "Rápido", icon: Bike, color: "bg-blue-400", match: "fast" },
  {
    label: "Restaurante",
    icon: Utensils,
    color: "bg-orange-400",
    match: "category",
    terms: ["restaurante", "restaurantes", "comida", "cocina"],
  },
  {
    label: "Cantina",
    icon: Coffee,
    color: "bg-amber-400",
    match: "category",
    terms: ["cantina", "cantinas", "bar", "bebidas", "cafeteria", "cafe"],
  },
  {
    label: "Postres",
    icon: IceCreamBowl,
    color: "bg-pink-400",
    match: "category",
    terms: ["postre", "postres", "pasteleria", "heladeria", "dulces"],
  },
  {
    label: "Flores",
    icon: Flower2,
    color: "bg-purple-400",
    match: "category",
    terms: ["flor", "flores", "floreria"],
  },
  {
    label: "Pizza",
    icon: Pizza,
    color: "bg-yellow-400",
    match: "category",
    terms: ["pizza", "pizzeria"],
  },
];

const CARD_IMAGES = [5, 6, 7, 8, 9, 10];

function stableNumber(value: string | number, offset = 0) {
  const source = String(value);
  return (
    source.split("").reduce((total, char) => total + char.charCodeAt(0), 0) +
    offset
  );
}

function getRating(id: string | number, index: number) {
  return 4.5 + (stableNumber(id, index) % 5) / 10;
}

function getEta(index: number) {
  return 14 + ((index * 5) % 22);
}

function getDeliveryFee(index: number) {
  return index % 4 === 0 ? 0 : 18 + (index % 3) * 7;
}

function getPriceTier(index: number) {
  return "$".repeat(1 + (index % 3));
}

function getBadge(index: number) {
  if (index % 3 === 0) return "Popular";
  if (index % 3 === 1) return "Más vendido";
  return "Nuevo";
}

function getDiscount(index: number) {
  if (index % 4 === 0) return "20% OFF";
  if (index % 4 === 2) return "15% OFF";
  return undefined;
}

function normalizeText(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesCategoryTerms(category: string | undefined, terms: string[]) {
  const normalizedCategory = normalizeText(category);

  return terms.some((term) => normalizedCategory.includes(term));
}

export default function ShopPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedFilter, setSelectedFilter] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [activeOrdersLoading, setActiveOrdersLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/stores", {
          cache: "no-store",
        });
        const data = await res.json();

        const parsedBusinesses: Business[] = (data.stores ?? []).map(
          (business: ApiBusiness, index: number) => ({
            id: business.id,
            name: business.name ?? business.nombre ?? "Negocio local",
            city: business.city ?? business.ciudad,
            category:
              business.category ??
              business.category_name ??
              (Array.isArray(business.categories)
                ? business.categories[0]
                : undefined) ??
              business.giro ??
              business.business_category_name ??
              "Restaurante",
            rating: getRating(business.id, index),
            etaMinutes: getEta(index),
            deliveryFee: getDeliveryFee(index),
            priceTier: getPriceTier(index),
            badge: getBadge(index),
            discount: getDiscount(index),
            avatar_url:
              typeof business.avatar_url === "string"
                ? business.avatar_url
                : null,
          }),
        );

        setBusinesses(parsedBusinesses);
      } catch (err) {
        console.error("Error al obtener negocios:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    async function fetchActiveOrders() {
      if (typeof window === "undefined") return;

      const token = window.localStorage.getItem("token");

      if (!token) {
        setActiveOrders([]);
        setActiveOrdersLoading(false);
        return;
      }

      try {
        const url = "/api/orders/active";
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const responseText = await response.text();
        let data: Record<string, unknown> = {};

        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok || data.success === false) {
          console.error("Error en endpoint:", {
            url,
            status: response.status,
            statusText: response.statusText,
            responseText,
            data,
          });
          setActiveOrders([]);
          return;
        }

        setActiveOrders(
          Array.isArray(data.orders) ? (data.orders as ActiveOrder[]) : [],
        );
      } catch (error) {
        console.error("Error cargando pedidos activos:", error);
        setActiveOrders([]);
      } finally {
        setActiveOrdersLoading(false);
      }
    }

    fetchActiveOrders();
  }, []);

  const categoryFilters = useMemo(() => {
    const categories = Array.from(
      new Set(
        businesses
          .map((business) => business.category)
          .filter((category): category is string => Boolean(category)),
      ),
    );

    return [
      "Todos",
      ...STATIC_FILTERS.map((filter) => filter.label),
      ...categories,
    ];
  }, [businesses]);

  const filteredBusinesses = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const normalizedSelectedFilter = selectedFilter.trim();

    return businesses.filter((business) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        business.name.toLowerCase().includes(normalizedSearch) ||
        business.city?.toLowerCase().includes(normalizedSearch) ||
        business.category?.toLowerCase().includes(normalizedSearch);

      if (!normalizedSelectedFilter || normalizedSelectedFilter === "Todos") {
        return matchesSearch;
      }

      const selectedStaticFilter = STATIC_FILTERS.find(
        (filter) => filter.label === normalizedSelectedFilter,
      );

      let matchesFilter = false;

      if (selectedStaticFilter?.match === "popular") {
        matchesFilter = business.rating >= 4.8 || business.badge === "Popular";
      } else if (selectedStaticFilter?.match === "offers") {
        matchesFilter = Boolean(business.discount);
      } else if (selectedStaticFilter?.match === "fast") {
        matchesFilter = business.etaMinutes <= 25 || business.deliveryFee === 0;
      } else if (selectedStaticFilter?.match === "category") {
        matchesFilter = matchesCategoryTerms(
          business.category,
          selectedStaticFilter.terms ?? [selectedStaticFilter.label],
        );
      } else if (!selectedStaticFilter) {
        matchesFilter = business.category === normalizedSelectedFilter;
      }

      return matchesSearch && matchesFilter;
    });
  }, [businesses, searchQuery, selectedFilter]);

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
              <Store className="h-5 w-5" />
            </span>
            <button
              type="button"
              className="rounded-xl px-2.5 py-1.5 text-left transition hover:bg-white"
            >
              <p className="text-xs font-black text-slate-400">Entregar en</p>
              <span className="inline-flex items-center gap-1.5 text-lg font-black">
                Ciudad Óptica
                <ChevronRight className="h-4 w-4 rotate-90" />
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="relative inline-flex size-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-950"
              aria-label="Notificaciones"
            >
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-500" />
              <Sparkles className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-950"
              aria-label="Perfil"
            >
              <MapPin className="h-4 w-4" />
            </button>
          </div>
        </header>

        <section>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar restaurantes, comidas..."
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-base font-semibold text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
            />
          </label>
        </section>

        <section className="flex gap-6 overflow-x-auto border-b border-slate-200 pb-5">
          {categoryFilters.slice(0, 9).map((item) => {
            const isActive = selectedFilter === item;
            const staticFilter = STATIC_FILTERS.find(
              (filter) => filter.label === item,
            );
            const Icon = staticFilter?.icon ?? Store;

            return (
              <button
                key={item}
                type="button"
                onClick={() => setSelectedFilter(item)}
                aria-pressed={isActive}
                className="group flex shrink-0 flex-col items-center gap-2"
              >
                <span
                  className={`inline-flex size-14 items-center justify-center rounded-full text-white shadow-md transition group-hover:-translate-y-0.5 sm:size-16 ${
                    staticFilter?.color ?? "bg-orange-500"
                  } ${isActive ? "ring-4 ring-orange-100" : ""}`}
                >
                  <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                </span>
                <span
                  className={`text-sm font-black ${
                    isActive ? "text-slate-950" : "text-slate-500"
                  }`}
                >
                  {item}
                </span>
              </button>
            );
          })}
        </section>

        {!activeOrdersLoading && activeOrders.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-950">
                Pedidos activos
              </h2>
              <p className="text-sm font-semibold text-slate-500">
                Sigue el estado de tus pedidos en curso.
              </p>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {activeOrders.map((order) => (
                <article
                  key={order.id}
                  className="min-w-[280px] shrink-0 rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        Pedido #{order.id}
                      </p>
                      <p className="mt-1 text-xs font-black uppercase tracking-[0.08em] text-orange-600">
                        {order.status}
                      </p>
                    </div>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-600">
                      MX${Number(order.total ?? 0).toFixed(2)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    {order.businessName || "Tienda asignada"}
                  </p>

                  <button
                    type="button"
                    onClick={() => router.push(`/pedidos/${order.id}`)}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-orange-200 px-4 text-sm font-black text-orange-600 transition hover:bg-orange-50"
                  >
                    Ver seguimiento
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-[18px] bg-gradient-to-r from-orange-600 to-red-500 px-6 py-5 text-white shadow-lg shadow-orange-900/10">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em]">
            <Sparkles className="h-4 w-4" />
            Oferta especial
          </p>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
            Descuentos de hasta 30%
          </h1>
          <p className="mt-2 text-sm font-semibold text-white/90 sm:text-base">
            En restaurantes seleccionados. Válido hoy.
          </p>
          <button
            type="button"
            onClick={() => setSelectedFilter("Ofertas")}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-white px-6 text-sm font-black text-orange-600 shadow-lg transition hover:bg-orange-50"
          >
            Ver ofertas
          </button>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                Más populares
              </h1>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-black text-orange-600 transition hover:text-orange-700"
            >
              {filteredBusinesses.length} aliados
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {PLACEHOLDER_IDS.map((placeholder) => (
                <div
                  key={placeholder}
                  className="h-48 rounded-[18px] bg-white shadow-sm"
                />
              ))}
            </div>
          ) : filteredBusinesses.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredBusinesses.map((business, index) => (
                <BusinessCard
                  key={`${business.id ?? "business"}-${index}`}
                  id={CARD_IMAGES[index % CARD_IMAGES.length]}
                  name={business.name}
                  city={business.city}
                  category={business.category}
                  rating={business.rating}
                  etaMinutes={business.etaMinutes}
                  deliveryFee={business.deliveryFee}
                  priceTier={business.priceTier}
                  badge={business.badge}
                  discount={business.discount}
                  imagen={business.avatar_url ?? undefined}
                  href={`/shop/${business.id ?? index}`}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <Store className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-xl font-black text-slate-900">
                No encontramos aliados
              </h2>
              <p className="mt-2 font-semibold text-slate-500">
                Prueba con otra búsqueda o cambia el filtro seleccionado.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
