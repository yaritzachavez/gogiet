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

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import BusinessCard from "./components/BusinessCard";

type Business = {
  id: number | string;
  name: string;
  city?: string;
  category?: string;
  categories?: string[];
  productNames?: string[];
  productCategories?: string[];
  rating: number;
  etaMinutes: number;
  deliveryFee: number;
  priceTier: string;
  badge: string;
  discount?: string;
  mainPhoto?: string | null;
  imageUrl?: string | null;
  avatar_url?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  cover_image_url?: string | null;
  profile_image_url?: string | null;
  photo_url?: string | null;
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
  product_names?: string[];
  product_categories?: string[];
  avatar_url?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  cover_image_url?: string | null;
  profile_image_url?: string | null;
  photo_url?: string | null;
};

type ActiveOrder = {
  id: number;
  status: string;
  total: number;
  businessName?: string;
};

type SafeFetchResult<T> = {
  success: boolean;
  data: T | null;
  status: number;
  error?: string;
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
const DELIVERY_LOCATION_STORAGE_KEY = "gogi:selected-delivery-location";
const DELIVERY_LOCATIONS = [
  "Mazamitla",
  "Epenche Chico",
  "La Cofradía",
  "El Chorro",
  "La Estacada",
  "Puerta del Zapatero",
  "Llano de los Toros",
  "Las Colonias",
  "El Pandito",
  "El Tigre",
  "El Charco",
  "El Orito",
  "La Gloria",
  "Barrio Alto",
] as const;

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

function matchesSearchTerm(
  search: string,
  ...values: Array<string | string[] | null | undefined>
) {
  if (!search) return true;

  return values.some((value) => {
    if (Array.isArray(value)) {
      return value.some((entry) => normalizeText(entry).includes(search));
    }

    return normalizeText(value ?? "").includes(search);
  });
}

function normalizeBusinessImageCandidate(value?: string | null) {
  const candidate = String(value ?? "").trim();

  if (!candidate) {
    return null;
  }

  if (
    candidate.startsWith("https://") ||
    candidate.startsWith("http://") ||
    candidate.startsWith("/")
  ) {
    return candidate;
  }

  return null;
}

function getSelectedDeliveryLocation() {
  if (typeof window === "undefined") {
    return "Mazamitla";
  }

  const storedLocation = window.localStorage.getItem(
    DELIVERY_LOCATION_STORAGE_KEY,
  );

  return storedLocation && DELIVERY_LOCATIONS.includes(storedLocation as never)
    ? storedLocation
    : "Mazamitla";
}

async function fetchJsonSafely<T>(
  url: string,
  init?: RequestInit,
): Promise<SafeFetchResult<T>> {
  try {
    const response = await fetch(url, init);
    let data: T | null = null;

    try {
      data = (await response.json()) as T;
    } catch (jsonError) {
      console.error("Error parseando JSON:", {
        url,
        error: jsonError,
      });
    }

    const payload =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};

    if (!response.ok || payload?.success === false) {
      console.error("Error en endpoint:", {
        url,
        status: response.status,
        statusText: response.statusText,
        response: data,
      });

      return {
        success: false,
        data,
        status: response.status,
        error:
          typeof payload?.error === "string"
            ? payload.error
            : "No se pudo completar la solicitud.",
      };
    }

    return {
      success: true,
      data,
      status: response.status,
    };
  } catch (error) {
    console.error("Fetch error:", {
      url,
      error,
    });

    return {
      success: false,
      data: null,
      status: 0,
      error: "No se pudo conectar con el servidor.",
    };
  }
}

export default function ShopPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedFilter, setSelectedFilter] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [activeOrdersLoading, setActiveOrdersLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState("Mazamitla");
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [favoriteBusinessIds, setFavoriteBusinessIds] = useState<number[]>([]);
  const [storesWarning, setStoresWarning] = useState("");
  const [activeOrdersWarning, setActiveOrdersWarning] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setStoresWarning("");
        const query = searchQuery.trim();
        const url = `/api/stores${query ? `?q=${encodeURIComponent(query)}` : ""}`;
        const result = await fetchJsonSafely<{ stores?: ApiBusiness[] }>(
          url,
          {
            cache: "no-store",
          },
        );

        if (!result.success) {
          setBusinesses([]);
          setStoresWarning("No pudimos cargar los aliados por ahora.");
          return;
        }

        const data = result.data;

        const parsedBusinesses: Business[] = (data?.stores ?? []).map(
          (business: ApiBusiness, index: number) => {
            const logoUrl = normalizeBusinessImageCandidate(business.logo_url);
            const imageUrl = normalizeBusinessImageCandidate(
              business.image_url,
            );
            const coverImageUrl = normalizeBusinessImageCandidate(
              business.cover_image_url,
            );
            const profileImageUrl = normalizeBusinessImageCandidate(
              business.profile_image_url,
            );
            const photoUrl = normalizeBusinessImageCandidate(business.photo_url);
            const avatarUrl = normalizeBusinessImageCandidate(
              business.avatar_url,
            );

            return {
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
              categories: Array.isArray(business.categories)
                ? business.categories
                : [],
              productNames: Array.isArray(business.product_names)
                ? business.product_names
                : [],
              productCategories: Array.isArray(business.product_categories)
                ? business.product_categories
                : [],
              rating: getRating(business.id, index),
              etaMinutes: getEta(index),
              deliveryFee: getDeliveryFee(index),
              priceTier: getPriceTier(index),
              badge: getBadge(index),
              discount: getDiscount(index),
              mainPhoto:
                logoUrl ??
                imageUrl ??
                coverImageUrl ??
                profileImageUrl ??
                photoUrl ??
                avatarUrl,
              imageUrl,
              avatar_url: avatarUrl,
              logo_url: logoUrl,
              image_url: imageUrl,
              cover_image_url: coverImageUrl,
              profile_image_url: profileImageUrl,
              photo_url: photoUrl,
            };
          },
        );

        setBusinesses(parsedBusinesses);
      } catch (err) {
        console.error("Error al obtener negocios:", err);
        setBusinesses([]);
        setStoresWarning("No pudimos cargar los aliados por ahora.");
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [searchQuery]);

  useEffect(() => {
    setSelectedLocation(getSelectedDeliveryLocation());
  }, []);

  useEffect(() => {
    async function fetchFavorites() {
      if (typeof window === "undefined") return;

      const token = window.localStorage.getItem("token");

      if (!token) {
        setFavoriteBusinessIds([]);
        return;
      }

      try {
        const result = await fetchJsonSafely<{
          favorites?: Array<{ target_id?: number }>;
        }>("/api/favorites?type=business", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!result.success) {
          setFavoriteBusinessIds([]);
          return;
        }

        const data = result.data;

        setFavoriteBusinessIds(
          Array.isArray(data?.favorites)
            ? data.favorites
                .map((favorite) => Number(favorite.target_id ?? 0))
                .filter((id) => id > 0)
            : [],
        );
      } catch (error) {
        console.error("Error cargando favoritos:", error);
        setFavoriteBusinessIds([]);
      }
    }

    void fetchFavorites();
  }, []);

  useEffect(() => {
    async function fetchActiveOrders() {
      if (typeof window === "undefined") return;

      const token = window.localStorage.getItem("token");

      if (!token) {
        setActiveOrders([]);
        setActiveOrdersLoading(false);
        setActiveOrdersWarning("");
        return;
      }

      try {
        setActiveOrdersWarning("");
        const url = "/api/orders/active";
        const result = await fetchJsonSafely<{ orders?: ActiveOrder[] }>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!result.success) {
          setActiveOrders([]);
          setActiveOrdersWarning("No pudimos actualizar tus pedidos activos.");
          return;
        }

        const data = result.data;
        setActiveOrders(
          Array.isArray(data?.orders) ? (data.orders as ActiveOrder[]) : [],
        );
      } catch (error) {
        console.error("Error cargando pedidos activos:", error);
        setActiveOrders([]);
        setActiveOrdersWarning("No pudimos actualizar tus pedidos activos.");
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

  const favoriteBusinessIdsSet = useMemo(
    () => new Set(favoriteBusinessIds),
    [favoriteBusinessIds],
  );

  const filteredBusinesses = useMemo(() => {
    const normalizedSearch = normalizeText(searchQuery.trim());
    const normalizedSelectedFilter = selectedFilter.trim();

    return businesses.filter((business) => {
      const matchesSearch = matchesSearchTerm(
        normalizedSearch,
        business.name,
        business.city,
        business.category,
        business.categories,
        business.productNames,
        business.productCategories,
      );

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

  const favoriteBusinesses = useMemo(
    () =>
      businesses.filter((business) =>
        favoriteBusinessIdsSet.has(Number(business.id)),
      ),
    [businesses, favoriteBusinessIdsSet],
  );

  const handleToggleFavorite = async (businessId: number | string) => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("token");

    if (!token) {
      window.alert("Inicia sesión para guardar favoritos.");
      return;
    }

    const numericBusinessId = Number(businessId);
    const isFavorite = favoriteBusinessIds.includes(numericBusinessId);

    try {
      const result = await fetchJsonSafely<{
        success?: boolean;
        error?: string;
      }>("/api/favorites", {
        method: isFavorite ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          favorite_type: "business",
          target_id: numericBusinessId,
        }),
      });

      if (!result.success) {
        console.error("Error actualizando favorito:", {
          businessId: numericBusinessId,
          error: result.error,
          status: result.status,
        });
        window.alert(result.error || "No se pudo actualizar el favorito.");
        return;
      }

      setFavoriteBusinessIds((prev) =>
        isFavorite
          ? prev.filter((id) => id !== numericBusinessId)
          : [...prev, numericBusinessId],
      );
    } catch (error) {
      console.error("Error actualizando favorito:", error);
      window.alert("No se pudo actualizar el favorito.");
    }
  };

  const handleSelectLocation = (location: string) => {
    setSelectedLocation(location);
    setLocationMenuOpen(false);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(DELIVERY_LOCATION_STORAGE_KEY, location);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,107,0,0.08),transparent_22%),linear-gradient(180deg,#0b0b0b_0%,#111111_42%,#151515_100%)] text-slate-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
              <Store className="h-5 w-5" />
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setLocationMenuOpen((current) => !current)}
                className="rounded-xl px-2.5 py-1.5 text-left transition hover:bg-white/6"
              >
                <p className="text-xs font-black text-white/45">Entregar en</p>
                <span className="inline-flex items-center gap-1.5 text-lg font-black text-white">
                  {selectedLocation}
                  <ChevronRight
                    className={`h-4 w-4 rotate-90 transition ${
                      locationMenuOpen ? "rotate-[270deg]" : ""
                    }`}
                  />
                </span>
              </button>

              {locationMenuOpen ? (
                <div className="absolute left-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#181818]/96 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  <div className="max-h-72 overflow-y-auto p-2">
                    {DELIVERY_LOCATIONS.map((location) => (
                      <button
                        key={location}
                        type="button"
                        onClick={() => handleSelectLocation(location)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                          selectedLocation === location
                            ? "bg-orange-500/14 text-orange-300"
                            : "text-[#d7d7d7] hover:bg-white/6"
                        }`}
                      >
                        <span>{location}</span>
                        {selectedLocation === location ? (
                          <MapPin className="h-4 w-4" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <PageHeader
          eyebrow="Marketplace local"
          title="Descubre negocios que sí antojan"
          description="Explora aliados cercanos con entregas rápidas, promociones del día y favoritos listos para volver a pedir."
          actions={
            <div className="rounded-2xl border border-[#efcfaf] bg-[linear-gradient(180deg,#fff7ee_0%,#f8ecdf_100%)] px-4 py-3 text-sm font-bold text-[#c7641a] shadow-[0_12px_28px_rgba(255,107,0,0.10)]">
              {filteredBusinesses.length} aliados disponibles
            </div>
          }
        />

        <section>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#a18d7b]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar restaurantes, comidas..."
              className="h-12 w-full rounded-xl border border-[#e7dac8] bg-[linear-gradient(180deg,#fffdfa_0%,#f6efe6_100%)] pl-12 pr-4 text-base font-semibold text-[#2a1d14] shadow-[0_14px_32px_rgba(0,0,0,0.18)] outline-none transition placeholder:text-[#aa9788] focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
            />
          </label>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(22,22,22,0.92)_0%,rgba(15,15,15,0.94)_100%)] px-4 py-5 shadow-[0_18px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl">
          <div className="flex gap-6 overflow-x-auto pb-1">
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
                    isActive ? "text-white" : "text-white/58"
                  }`}
                >
                  {item}
                </span>
              </button>
            );
          })}
          </div>
        </section>

        {!activeOrdersLoading && activeOrders.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white">
                Pedidos activos
              </h2>
              <p className="text-sm font-semibold text-white/62">
                Sigue el estado de tus pedidos en curso.
              </p>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {activeOrders.map((order) => (
                <article
                  key={order.id}
                  className="min-w-[280px] shrink-0 rounded-[18px] border border-[#eadfce] bg-[linear-gradient(180deg,#fffdfa_0%,#f6efe6_100%)] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.18)]"
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

        <section className="overflow-hidden rounded-[18px] bg-gradient-to-r from-orange-600 to-red-500 px-6 py-5 text-white shadow-[0_20px_44px_rgba(255,107,0,0.18)] ring-1 ring-white/10">
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

        {favoriteBusinesses.length > 0 ? (
          <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                Tus favoritos
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/62">
                Regresa rápido a los negocios que más te gustan.
              </p>
            </div>
            <button
              type="button"
                className="inline-flex items-center gap-1.5 text-sm font-black text-orange-600 transition hover:text-orange-700"
              >
                {favoriteBusinesses.length} guardados
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {favoriteBusinesses.map((business, index) => (
                <BusinessCard
                  key={`favorite-${business.id}-${index}`}
                  businessId={business.id}
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
                  imagen={
                    business.mainPhoto ??
                    business.imageUrl ??
                    business.logo_url ??
                    business.image_url ??
                    business.cover_image_url ??
                    business.profile_image_url ??
                    business.photo_url ??
                    business.avatar_url ??
                    undefined
                  }
                  href={`/shop/${business.id ?? index}`}
                  isFavorite={favoriteBusinessIdsSet.has(Number(business.id))}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                Más populares
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/62">
                Tiendas destacadas por velocidad, variedad y favoritos del día.
              </p>
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
                  className="h-48 rounded-[18px] bg-white/10 shadow-sm"
                />
              ))}
            </div>
          ) : storesWarning ? (
            <EmptyState
              icon={Store}
              title="No pudimos cargar los aliados"
              description={storesWarning}
            />
          ) : filteredBusinesses.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredBusinesses.map((business, index) => (
                <BusinessCard
                  key={`${business.id ?? "business"}-${index}`}
                  businessId={business.id}
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
                  imagen={
                    business.mainPhoto ??
                    business.imageUrl ??
                    business.logo_url ??
                    business.image_url ??
                    business.cover_image_url ??
                    business.profile_image_url ??
                    business.photo_url ??
                    business.avatar_url ??
                    undefined
                  }
                  href={`/shop/${business.id ?? index}`}
                  isFavorite={favoriteBusinessIdsSet.has(Number(business.id))}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Store}
              title="No encontramos aliados"
              description="Prueba con otra búsqueda o cambia el filtro seleccionado para descubrir negocios cercanos."
              actionLabel="Ver todo"
              onAction={() => {
                setSelectedFilter("Todos");
                setSearchQuery("");
              }}
            />
          )}
        </section>
      </div>
    </main>
  );
}
