"use client";

import {
  Clock3,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Store,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AddressRequiredDialog, {
  type SavedAddress,
} from "@/components/address/AddressRequiredDialog";
import { AppImage } from "@/components/ui/app-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/context/AuthContext";
import { useNotify } from "@/context/NotificationContext";
import {
  CART_UPDATED_EVENT,
  getStoredCartCount,
  readStoredCartSnapshot,
  writeStoredCartSnapshot,
} from "@/lib/cart-storage";
import { fetchWithSession } from "@/lib/client-auth";

// --- Constantes y Helpers ---
const ITEMS_PER_PAGE = 12;
const PRODUCT_PLACEHOLDER_IMAGE = "/placeholder-product.png";
const BUSINESS_PLACEHOLDER_IMAGE = "/generic-shop.png";

type BusinessDetail = {
  name?: string | null;
  description_long?: string | null;
  estimated_delivery_minutes?: number | null;
  is_open_now?: boolean | null;
  logo_url?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  avatar_url?: string | null;
};

type ProductDetail = {
  id: number;
  name: string;
  description_short?: string | null;
  description_long?: string | null;
  category_name?: string | null;
  product_category_id: number;
  image_url?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  photo_url?: string | null;
  photoUrl?: string | null;
  picture_url?: string | null;
  pictureUrl?: string | null;
  price?: number | string | null;
  base_price?: number | string | null;
  unit_price?: number | string | null;
  sale_price?: number | string | null;
  offer_price?: number | string | null;
  price_mxn?: number | string | null;
  discount_price?: number | string | null;
};

type CustomizationOption = {
  id: number | string;
  name: string;
  extraPrice?: number;
};

type CustomizationGroup = {
  id: number | string;
  name: string;
  options: CustomizationOption[];
};

const getProductImage = (product: {
  image_url?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  photo_url?: string | null;
  photoUrl?: string | null;
  picture_url?: string | null;
  pictureUrl?: string | null;
}) => {
  const image =
    product.image_url ||
    product.imageUrl ||
    product.image ||
    product.photo_url ||
    product.photoUrl ||
    product.picture_url ||
    product.pictureUrl ||
    "";

  if (!image) return PRODUCT_PLACEHOLDER_IMAGE;

  const normalizedUrl = image.trim();

  if (!normalizedUrl) return PRODUCT_PLACEHOLDER_IMAGE;
  if (normalizedUrl.startsWith("/uploads")) return PRODUCT_PLACEHOLDER_IMAGE;
  if (normalizedUrl.includes("public/uploads"))
    return PRODUCT_PLACEHOLDER_IMAGE;
  if (normalizedUrl.includes("/var/task")) return PRODUCT_PLACEHOLDER_IMAGE;
  if (normalizedUrl.startsWith("/public/")) return PRODUCT_PLACEHOLDER_IMAGE;

  return normalizedUrl;
};

const getBusinessImage = (business: {
  logo_url?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  avatar_url?: string | null;
}) => {
  const image =
    business.logo_url ||
    business.image_url ||
    business.imageUrl ||
    business.avatar_url ||
    "";

  if (!image) return BUSINESS_PLACEHOLDER_IMAGE;

  const normalizedUrl = image.trim();

  if (!normalizedUrl) return BUSINESS_PLACEHOLDER_IMAGE;
  if (normalizedUrl.startsWith("/uploads")) return BUSINESS_PLACEHOLDER_IMAGE;
  if (normalizedUrl.includes("public/uploads"))
    return BUSINESS_PLACEHOLDER_IMAGE;
  if (normalizedUrl.includes("/var/task")) return BUSINESS_PLACEHOLDER_IMAGE;
  if (normalizedUrl.startsWith("/public/")) return BUSINESS_PLACEHOLDER_IMAGE;

  return normalizedUrl;
};

function getProductPrice(product: {
  price?: number | string | null;
  base_price?: number | string | null;
  unit_price?: number | string | null;
  sale_price?: number | string | null;
  offer_price?: number | string | null;
  price_mxn?: number | string | null;
  discount_price?: number | string | null;
}) {
  return Number(
    product.discount_price ??
      product.sale_price ??
      product.offer_price ??
      product.price ??
      product.base_price ??
      product.unit_price ??
      product.price_mxn ??
      0,
  );
}

function getOriginalProductPrice(product: {
  price?: number | string | null;
  base_price?: number | string | null;
  unit_price?: number | string | null;
  price_mxn?: number | string | null;
}) {
  return Number(
    product.price ??
      product.base_price ??
      product.unit_price ??
      product.price_mxn ??
      0,
  );
}

export default function BusinessDetailPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = Number(params?.id ?? NaN);

  // --- Estados de Datos ---
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);

  // --- Estados de UI / Filtros ---
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [currentPage, _setCurrentPage] = useState(1);

  // --- Estados de Personalización ---
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(
    null,
  );
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [loadingCustomizations, setLoadingCustomizations] = useState(false);
  const [customizationGroups, setCustomizationGroups] = useState<
    CustomizationGroup[]
  >([]);
  const [modalQuantity, setModalQuantity] = useState(1);

  // --- Estados de Carrito / Mensajes ---
  const [addingProductId, setAddingProductId] = useState<number | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [isSearchDocked, setIsSearchDocked] = useState(false);

  // ✅ 1. Mapeo de dirección inicial para evitar error de tipos en build
  const initialAddress = useMemo(() => {
    if (!user?.address) return null;

    return {
      id: user.address.id,
      fullAddress: user.address.fullAddress,
      neighborhood: user.address.neighborhood,
      phone: user.address.phone,
      // Campos requeridos por SavedAddress pero que no vienen en el user simplificado
      placeType: "home",
      placeName: "Mi dirección",
      street: "",
      externalNumber: "",
      internalNumber: "",
      city: "",
      state: "",
      zipCode: "",
      references: "",
      lat: 0,
      lng: 0,
    } as unknown as SavedAddress;
  }, [user?.address]);

  const [savedAddress, setSavedAddress] = useState<SavedAddress | null>(
    initialAddress,
  );

  // ✅ 2. Sincronizar estado local si el usuario carga después del montaje inicial
  useEffect(() => {
    if (initialAddress) {
      setSavedAddress(initialAddress);
    }
  }, [initialAddress]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncCartCount = () => {
      setCartCount(getStoredCartCount());
    };

    syncCartCount();
    window.addEventListener("storage", syncCartCount);
    window.addEventListener(CART_UPDATED_EVENT, syncCartCount);

    return () => {
      window.removeEventListener("storage", syncCartCount);
      window.removeEventListener(CART_UPDATED_EVENT, syncCartCount);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      setIsSearchDocked(window.scrollY > 72);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // --- Carga de Datos del Negocio ---
  const fetchBusinessData = useCallback(async () => {
    if (Number.isNaN(businessId)) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/shop/business/${businessId}`);
      if (!res.ok) throw new Error("Error al cargar negocio");
      const data = await res.json();
      setBusiness(data.business);
      setProducts(data.products || []);
    } catch (_err) {
      setError("No pudimos cargar el menú.");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchBusinessData();
  }, [fetchBusinessData]);

  // --- Lógica de Personalización ---
  const openCustomizationModal = async (product: ProductDetail) => {
    setSelectedProduct(product);
    setCustomizationGroups([]);
    setModalQuantity(1);
    setCustomizeModalOpen(true);
    setLoadingCustomizations(true);

    try {
      const res = await fetch(`/api/products/${product.id}/customizations`);
      const data = await res.json();
      if (data.success) setCustomizationGroups(data.groups);
    } catch (_e) {
      const message = "No pudimos cargar las opciones de este producto.";
      notify.error(message, "Intenta de nuevo");
    } finally {
      setLoadingCustomizations(false);
    }
  };

  // ✅ 3. Validación de dirección antes de agregar al carrito
  const handleAddToCart = async () => {
    if (!selectedProduct || !user) {
      if (!user) {
        const message = "Necesitas iniciar sesión para comprar.";
        notify.warning(message, "Acceso requerido");
      }
      return;
    }

    // Si no tiene dirección, abrir diálogo obligatorio
    if (!savedAddress) {
      setAddressDialogOpen(true);
      return;
    }

    setAddingProductId(selectedProduct.id);
    try {
      const createCartPayload = { user_id: user.id };

      const createCartResponse = await fetchWithSession("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createCartPayload),
      });

      const createCartData = await createCartResponse.json();

      if (!createCartResponse.ok || !createCartData.success) {
        throw new Error(
          createCartData.error || "No se pudo preparar el carrito",
        );
      }

      const cartId = Number(createCartData.cart_id ?? createCartData.cart?.id);

      if (!cartId) {
        throw new Error("No se pudo obtener el carrito activo");
      }

      const payload = {
        cart_id: cartId,
        product_id: selectedProduct.id,
        quantity: modalQuantity,
        business_id: businessId,
        price: getProductPrice(selectedProduct),
      };

      const response = await fetchWithSession("/api/cart/add-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.success) {
        throw new Error(
          responseData.error || "No se pudo agregar el producto al carrito",
        );
      }

      const existingCart = readStoredCartSnapshot();
      const existingItem = existingCart.find(
        (item) => Number(item.product_id) === Number(selectedProduct.id),
      );
      const nextCart = existingItem
        ? existingCart.map((item) =>
            Number(item.product_id) === Number(selectedProduct.id)
              ? {
                  ...item,
                  quantity: Number(item.quantity ?? 0) + modalQuantity,
                  price:
                    Number(item.price ?? 0) > 0
                      ? Number(item.price ?? 0)
                      : getProductPrice(selectedProduct),
                  image_url: item.image_url || getProductImage(selectedProduct),
                  business_name:
                    item.business_name || String(business?.name ?? ""),
                  description:
                    item.description ||
                    String(
                      selectedProduct.description_short ??
                        selectedProduct.description_long ??
                        "",
                    ),
                  category_name:
                    item.category_name ||
                    String(selectedProduct.category_name ?? ""),
                  unit_price:
                    Number(item.unit_price ?? 0) > 0
                      ? Number(item.unit_price ?? 0)
                      : getProductPrice(selectedProduct),
                  subtotal: Number(
                    (
                      (Number(item.unit_price ?? item.price ?? 0) > 0
                        ? Number(item.unit_price ?? item.price ?? 0)
                        : getProductPrice(selectedProduct)) *
                      (Number(item.quantity ?? 0) + modalQuantity)
                    ).toFixed(2),
                  ),
                }
              : item,
          )
        : [
            ...existingCart,
            {
              id: String(selectedProduct.id),
              product_id: Number(selectedProduct.id),
              business_id: Number(businessId) || null,
              business_name: String(business?.name ?? ""),
              name: String(selectedProduct.name ?? ""),
              description: String(
                selectedProduct.description_short ??
                  selectedProduct.description_long ??
                  "",
              ),
              category_name: String(selectedProduct.category_name ?? ""),
              price: getProductPrice(selectedProduct),
              unit_price: getProductPrice(selectedProduct),
              image_url: getProductImage(selectedProduct),
              quantity: modalQuantity,
              subtotal: Number(
                (getProductPrice(selectedProduct) * modalQuantity).toFixed(2),
              ),
            },
          ];

      writeStoredCartSnapshot(nextCart);

      const message = "Producto agregado al carrito.";
      notify.success(message, "Listo");
      setCustomizeModalOpen(false);
    } catch (error) {
      console.error("ADD TO CART ERROR:", error);
      const message =
        error instanceof Error ? error.message : "No se pudo agregar";
      notify.error(message, "No pudimos agregarlo");
    } finally {
      setAddingProductId(null);
    }
  };

  // --- Filtrado y Paginación ---
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCat =
        activeCategory === "all" ||
        p.product_category_id.toString() === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, activeCategory]);

  const availableCategories = useMemo(
    () =>
      Array.from(
        new Map(
          products
            .filter(
              (product) =>
                product.product_category_id &&
                String(product.category_name ?? "").trim(),
            )
            .map((product) => [
              String(product.product_category_id),
              String(product.category_name),
            ]),
        ).entries(),
      )
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [products],
  );

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  if (loading)
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,107,0,0.08),transparent_24%),linear-gradient(180deg,#0b0b0b_0%,#111111_42%,#151515_100%)] px-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-orange-600" />
          <p className="mt-4 font-medium text-white/70">Cargando menú...</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,107,0,0.08),transparent_22%),linear-gradient(180deg,#0b0b0b_0%,#111111_42%,#151515_100%)]">
      <main className="section-shell overflow-x-hidden pb-36 pt-2 sm:pb-32 sm:pt-5 xl:pb-10">
        {/* Header del Negocio */}
        <SectionCard className="mb-2.5 overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(14,14,14,0.92)_0%,rgba(12,12,12,0.98)_100%)] p-0 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:mb-6">
          <div className="relative">
            <div className="relative h-24 overflow-hidden sm:h-32 lg:h-40">
              <AppImage
                src={getBusinessImage(business ?? {})}
                alt={business?.name ? `Imagen de ${business.name}` : "Logo"}
                width={1280}
                height={480}
                aspectClassName="aspect-[16/7]"
                className="h-full w-full"
                imageClassName="object-cover"
                fallbackLabel="Negocio"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.08)_0%,rgba(8,8,8,0.52)_58%,rgba(8,8,8,0.92)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-[radial-gradient(circle_at_center,rgba(255,107,0,0.20),transparent_64%)] blur-2xl" />
            </div>

            <div className="relative -mt-8 px-3 pb-3 sm:-mt-10 sm:px-5 sm:pb-5">
              <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,20,0.96)_0%,rgba(12,12,12,0.98)_100%)] px-3.5 pb-3.5 pt-2.5 shadow-[0_22px_44px_rgba(0,0,0,0.26)] ring-1 ring-white/6 sm:px-5 sm:pb-5 sm:pt-3.5">
                <div className="flex items-start gap-3">
                  <div className="relative -mt-5 shrink-0 rounded-[18px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,241,233,0.98)_100%)] p-1.5 shadow-[0_16px_30px_rgba(0,0,0,0.24)] sm:-mt-6 sm:rounded-[20px]">
                    <div className="h-[3.4rem] w-[3.4rem] overflow-hidden rounded-[14px] bg-white sm:h-[4.25rem] sm:w-[4.25rem] sm:rounded-[16px]">
                      <AppImage
                        src={getBusinessImage(business ?? {})}
                        alt={
                          business?.name ? `Logo de ${business.name}` : "Logo"
                        }
                        width={240}
                        height={240}
                        aspectClassName="aspect-square"
                        className="h-full w-full"
                        imageClassName="object-cover"
                        fallbackLabel="Logo"
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-300/90 sm:text-[10px]">
                          Menú del negocio
                        </p>
                        <h1 className="mt-1 text-[1.15rem] font-black leading-6 tracking-tight text-white sm:text-[clamp(1.35rem,3vw,2.5rem)] sm:leading-tight">
                          {String(business?.name ?? "Negocio local")}
                        </h1>
                      </div>
                      <Badge
                        className={`mt-0.5 shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold shadow-sm ${
                          business?.is_open_now
                            ? "border-emerald-300/25 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/12"
                            : "border-red-300/25 bg-red-500/12 text-red-200 hover:bg-red-500/12"
                        }`}
                      >
                        {business?.is_open_now ? "Abierto" : "Cerrado"}
                      </Badge>
                    </div>

                    <p className="mt-1.5 line-clamp-2 max-w-3xl text-[11px] leading-4 text-white/64 sm:mt-2 sm:text-sm sm:leading-5">
                      {String(
                        business?.description_long ??
                          "Descubre productos destacados y arma tu pedido en segundos.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4">
                  <Badge className="h-7 rounded-full border border-white/10 bg-white/6 px-2.5 text-[10px] font-bold text-white/84 hover:bg-white/6 sm:h-8 sm:px-3 sm:text-xs">
                    <Clock3 className="mr-1 h-3.5 w-3.5 text-orange-300" />
                    {business?.estimated_delivery_minutes || 30} min
                  </Badge>
                  <Badge className="h-7 rounded-full border border-white/10 bg-white/6 px-2.5 text-[10px] font-bold text-white/84 hover:bg-white/6 sm:h-8 sm:px-3 sm:text-xs">
                    <Store className="mr-1 h-3.5 w-3.5 text-orange-300" />
                    {products.length} productos
                  </Badge>
                  <Badge className="h-7 rounded-full border border-white/10 bg-white/6 px-2.5 text-[10px] font-bold text-white/84 hover:bg-white/6 sm:h-8 sm:px-3 sm:text-xs">
                    <Search className="mr-1 h-3.5 w-3.5 text-orange-300" />
                    {availableCategories.length || 1} categorías
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <section className="sticky top-[3.5rem] z-20 mb-2.5 transition-all duration-300 sm:top-[4.2rem] sm:mb-4 xl:top-[4.8rem]">
          <SectionCard
            className={`border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.86)_0%,rgba(10,10,10,0.94)_100%)] p-2 shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-all duration-300 sm:p-3 ${
              isSearchDocked
                ? "shadow-[0_18px_40px_rgba(0,0,0,0.26)] ring-1 ring-white/8"
                : ""
            }`}
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/44" />
              <input
                className="h-10 w-full rounded-2xl border border-white/10 bg-white/6 pl-10 pr-4 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition-all duration-300 placeholder:text-white/34 focus:border-orange-400/70 focus:bg-white/8 focus:ring-4 focus:ring-orange-500/12 sm:h-11"
                placeholder="Buscar en el menú..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="mt-2">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/76 sm:text-sm sm:tracking-normal">
                  Categorías
                </h3>
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/36 sm:text-xs sm:tracking-[0.18em]">
                  {availableCategories.length || 1}
                </span>
              </div>
              <nav className="touch-scroll flex gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setActiveCategory("all")}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-left text-[11px] font-bold transition-all duration-300 ${
                    activeCategory === "all"
                      ? "border-orange-400/35 bg-orange-500/14 text-orange-200 shadow-[0_10px_24px_rgba(255,107,0,0.12)]"
                      : "border-white/8 bg-white/5 text-white/68 hover:border-orange-300/20 hover:bg-white/8"
                  }`}
                >
                  Todo el menú
                </button>
                {availableCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-left text-[11px] font-bold transition-all duration-300 ${
                      activeCategory === category.id
                        ? "border-orange-400/35 bg-orange-500/14 text-orange-200 shadow-[0_10px_24px_rgba(255,107,0,0.12)]"
                        : "border-white/8 bg-white/5 text-white/68 hover:border-orange-300/20 hover:bg-white/8"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </nav>
            </div>
          </SectionCard>
        </section>

        <section className="min-w-0">
          <div className="mb-2.5 flex flex-col gap-1.5 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-black tracking-tight text-white sm:text-2xl">
                Productos del menú
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-white/58 sm:mt-1 sm:text-sm sm:leading-6">
                Explora opciones rápidas, filtra por categoría y agrega al
                carrito sin salir de la vista.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-semibold text-white/72 shadow-[0_12px_28px_rgba(0,0,0,0.18)] sm:px-3 sm:py-1.5 sm:text-sm">
              {filteredProducts.length} resultados
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {paginatedProducts.length > 0 ? (
              paginatedProducts.map((product) => (
                <article
                  key={product.id}
                  className="group relative flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-[20px] border border-[#eadfce] bg-[linear-gradient(180deg,#fffdfa_0%,#f7efe6_100%)] shadow-[0_12px_26px_rgba(97,72,36,0.09)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_18px_34px_rgba(255,107,0,0.12)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#f6efe6]">
                    <AppImage
                      src={getProductImage(product)}
                      alt={product.name || "Producto"}
                      width={520}
                      height={390}
                      aspectClassName="aspect-[4/3]"
                      className="h-full w-full"
                      imageClassName="object-cover transition duration-500 group-hover:scale-[1.04]"
                      sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                      fallbackLabel="Producto"
                    />
                    {Number(product.discount_price ?? 0) > 0 &&
                    getOriginalProductPrice(product) >
                      getProductPrice(product) ? (
                      <span className="absolute left-2 top-2 rounded-full bg-orange-500 px-2 py-1 text-[10px] font-black text-white shadow-lg shadow-orange-500/25">
                        Oferta
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 px-3 pb-3 pt-2.5">
                    <div className="min-w-0 space-y-1">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#d96a18]">
                          {product.category_name || "Menú"}
                        </p>
                        <h3 className="mt-0.5 line-clamp-2 text-sm font-black leading-5 tracking-tight text-[#23170f] sm:text-base">
                          {product.name}
                        </h3>
                      </div>
                      <p className="line-clamp-1 text-[11px] leading-4 text-[#6f6459]">
                        {product.description_short || "Disponible hoy"}
                      </p>
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                      <div className="min-w-0">
                        <span className="block text-lg font-black leading-none text-[#ff6b00] sm:text-xl">
                          MX${getProductPrice(product).toFixed(2)}
                        </span>
                        {Number(product.discount_price ?? 0) > 0 &&
                        getOriginalProductPrice(product) >
                          getProductPrice(product) ? (
                          <span className="mt-1 block text-[11px] text-[#a39181] line-through">
                            MX${getOriginalProductPrice(product).toFixed(2)}
                          </span>
                        ) : (
                          <span className="mt-1 block text-[11px] font-medium text-[#9c8a79]">
                            Listo para pedir
                          </span>
                        )}
                      </div>
                      <Button
                        className="h-11 w-11 shrink-0 rounded-2xl bg-orange-500 p-0 text-white shadow-[0_14px_28px_rgba(255,107,0,0.28)] hover:bg-orange-600"
                        onClick={() => openCustomizationModal(product)}
                        aria-label={`Agregar ${product.name}`}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                className="col-span-full border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(246,239,231,0.96)_100%)]"
                icon={Search}
                title="No encontramos productos"
                description="Prueba con otra búsqueda o cambia la categoría para descubrir más opciones del negocio."
                actionLabel="Ver todo el menú"
                onAction={() => {
                  setActiveCategory("all");
                  setSearchQuery("");
                }}
              />
            )}
          </div>
        </section>
      </main>

      {/* Modal de Personalización */}
      <Dialog open={customizeModalOpen} onOpenChange={setCustomizeModalOpen}>
        <DialogContent className="max-w-2xl rounded-[24px] sm:rounded-[28px] max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none max-sm:px-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold sm:text-2xl">
              {selectedProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {selectedProduct?.description_long}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60dvh] overflow-y-auto space-y-4 py-3 pr-1 sm:max-h-[60vh] sm:space-y-6 sm:py-4 sm:pr-2">
            {loadingCustomizations ? (
              <div className="flex flex-col items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="mt-2 text-sm text-slate-500">
                  Cargando opciones...
                </p>
              </div>
            ) : customizationGroups.length > 0 ? (
              customizationGroups.map((group) => (
                <div
                  key={group.id}
                  className="space-y-3 rounded-2xl bg-slate-50 p-3.5 sm:p-4"
                >
                  <h4 className="font-bold text-slate-900">{group.name}</h4>
                  {group.options.map((opt) => {
                    const extraPrice = Number(opt.extraPrice ?? 0);

                    return (
                      <label
                        key={opt.id}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 text-sm transition hover:border-orange-200"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded accent-orange-600"
                          />
                          <span className="font-medium">{opt.name}</span>
                        </div>
                        <span className="text-orange-600 font-bold text-sm">
                          +
                          {extraPrice > 0
                            ? `MX$${extraPrice.toFixed(2)}`
                            : "Gratis"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))
            ) : (
              <EmptyState
                icon={Search}
                title="Sin personalizaciones"
                description="Este producto ya está listo para pedir tal como aparece en el menú."
                className="border-none bg-slate-50 py-8 shadow-none"
              />
            )}
          </div>

          <DialogFooter className="flex-col gap-3 border-t pt-4 sm:flex-row sm:gap-4">
            <div className="flex h-12 items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-2">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[20px] text-center text-lg font-bold">
                {modalQuantity}
              </span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                onClick={() => setModalQuantity(modalQuantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button
              disabled={addingProductId !== null}
              onClick={handleAddToCart}
              className="h-12 flex-1 rounded-2xl bg-orange-600 text-base font-bold hover:bg-orange-700 sm:text-lg"
            >
              {addingProductId ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                `Agregar por MX$${(
                  getProductPrice(selectedProduct ?? {}) * modalQuantity
                ).toFixed(2)}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Dirección Obligatoria */}
      <AddressRequiredDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        onSaved={setSavedAddress}
      />

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0f0f10]/92 px-4 py-3 backdrop-blur-xl xl:hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">
              Carrito
            </p>
            <p className="truncate text-xs font-semibold text-white sm:text-sm">
              {cartCount > 0
                ? `${cartCount} producto${cartCount === 1 ? "" : "s"} listos`
                : "Agrega algo para continuar"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-11 w-full rounded-2xl text-sm sm:ml-auto sm:w-auto sm:px-3"
            onClick={() => router.push("/carrito")}
            aria-label={cartCount > 0 ? "Ver carrito" : "Ir al carrito"}
          >
            <ShoppingCart className="h-4 w-4" />
            {cartCount > 0 ? "Ver carrito" : "Ir al carrito"}
          </Button>
        </div>
      </div>
    </div>
  );
}
