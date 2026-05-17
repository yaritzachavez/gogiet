"use client";

import {
  ArrowRight,
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
import {
  CART_UPDATED_EVENT,
  getStoredCartCount,
  readStoredCartSnapshot,
  writeStoredCartSnapshot,
} from "@/lib/cart-storage";

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
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);

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
      setCartError("Error al cargar opciones");
    } finally {
      setLoadingCustomizations(false);
    }
  };

  // ✅ 3. Validación de dirección antes de agregar al carrito
  const handleAddToCart = async () => {
    if (!selectedProduct || !user) {
      if (!user) setCartError("Inicia sesión para comprar");
      return;
    }

    // Si no tiene dirección, abrir diálogo obligatorio
    if (!savedAddress) {
      setAddressDialogOpen(true);
      return;
    }

    setAddingProductId(selectedProduct.id);
    try {
      setCartError(null);
      const token = window.localStorage.getItem("token");

      if (!token) {
        setCartError("Inicia sesión para comprar");
        return;
      }

      const createCartPayload = { user_id: user.id };
      console.log("ADD TO CART payload:", createCartPayload);

      const createCartResponse = await fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createCartPayload),
      });

      const createCartData = await createCartResponse.json();
      console.log("ADD TO CART response:", createCartData);

      if (!createCartResponse.ok || !createCartData.success) {
        throw new Error(
          createCartData.error || "No se pudo preparar el carrito",
        );
      }

      const cartId = Number(createCartData.cart_id ?? createCartData.cart?.id);

      if (!cartId) {
        throw new Error("No se pudo obtener el carrito activo");
      }

      console.log("PRODUCT BEFORE CART:", selectedProduct);

      const payload = {
        cart_id: cartId,
        product_id: selectedProduct.id,
        quantity: modalQuantity,
        business_id: businessId,
        price: getProductPrice(selectedProduct),
      };

      console.log("ADD TO CART payload:", payload);

      const response = await fetch("/api/cart/add-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      console.log("ADD TO CART response:", responseData);

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

      setCartMessage("Agregado con éxito");
      setTimeout(() => setCartMessage(null), 3000);
      setCustomizeModalOpen(false);
    } catch (error) {
      console.error("ADD TO CART ERROR:", error);
      setCartError(
        error instanceof Error ? error.message : "No se pudo agregar",
      );
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
      <main className="section-shell pb-24 pt-4 sm:pt-5 xl:pb-8">
        {/* Header del Negocio */}
        <SectionCard className="mb-5 overflow-hidden border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(247,241,233,0.96)_100%)] p-3 shadow-[0_18px_48px_rgba(97,72,36,0.10)] backdrop-blur-xl sm:mb-6 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)] md:items-center lg:grid-cols-[minmax(10rem,12rem)_minmax(0,1fr)]">
            <div className="relative mx-auto w-full max-w-[11rem] overflow-hidden rounded-[24px] border border-[#efe3d5] bg-white/80 shadow-[0_12px_28px_rgba(97,72,36,0.08)] md:mx-0 md:max-w-none">
              <AppImage
                src={getBusinessImage(business ?? {})}
                alt={business?.name ? `Imagen de ${business.name}` : "Logo"}
                width={640}
                height={420}
                aspectClassName="aspect-square md:aspect-[5/4]"
                className="h-full w-full"
                imageClassName="object-cover"
                fallbackLabel="Negocio"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-col gap-3 rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,253,249,0.92)_0%,rgba(248,242,235,0.96)_100%)] px-4 py-4 shadow-[0_10px_28px_rgba(97,72,36,0.08)] sm:px-5 sm:py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#d96a18]">
                      Menú del negocio
                    </p>
                    <h1 className="mt-1.5 text-[clamp(1.5rem,5vw,2.5rem)] font-black tracking-tight text-[#23170f]">
                      {String(business?.name ?? "Negocio local")}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-5 text-[#6e6257] sm:text-base sm:leading-6">
                      {String(
                        business?.description_long ??
                          "Descubre productos destacados y arma tu pedido en segundos.",
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[17rem] lg:justify-end">
                    <Badge className="rounded-full border border-[#f0d7bf] bg-[linear-gradient(180deg,#fff8ef_0%,#f8ebdd_100%)] px-3 py-1.5 text-xs font-bold text-[#b85a18] hover:bg-[linear-gradient(180deg,#fff8ef_0%,#f8ebdd_100%)] sm:text-sm">
                      <Clock3 className="mr-1 h-4 w-4" />
                      {business?.estimated_delivery_minutes || 30} min
                    </Badge>
                    <Badge
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold sm:text-sm ${
                        business?.is_open_now
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                          : "border-red-200 bg-red-50 text-red-700 hover:bg-red-50"
                      }`}
                    >
                      {business?.is_open_now ? "Abierto ahora" : "Cerrado"}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#eadccb] bg-white/72 px-3 py-1.5 text-xs font-semibold text-[#5d5145] sm:text-sm">
                    <Store className="h-4 w-4 text-[#d96a18]" />
                    {products.length} productos disponibles
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#eadccb] bg-white/72 px-3 py-1.5 text-xs font-semibold text-[#5d5145] sm:text-sm">
                    <Search className="h-4 w-4 text-[#d96a18]" />
                    {availableCategories.length || 1} categorías
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Buscador y Grid */}
        <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start">
          <aside className="order-1 xl:order-none">
            <SectionCard className="border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(246,239,231,0.94)_100%)] p-3 shadow-[0_14px_34px_rgba(97,72,36,0.08)] backdrop-blur-xl sm:p-4 xl:sticky xl:top-24">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a28974]" />
                <input
                  className="h-11 w-full rounded-2xl border border-[#eadfce] bg-white/80 pl-10 pr-4 text-sm font-semibold text-[#2a1d14] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] outline-none transition-all duration-300 placeholder:text-[#a18e7e] focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                  placeholder="Buscar en el menú..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="mt-4">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="font-bold text-[#221811]">Categorías</h3>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a8674]">
                    {availableCategories.length || 1}
                  </span>
                </div>
                <nav className="touch-scroll flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
                  <button
                    type="button"
                    onClick={() => setActiveCategory("all")}
                    className={`shrink-0 rounded-full border px-3.5 py-2 text-left text-xs font-bold transition-all duration-300 xl:w-full xl:rounded-2xl xl:px-4 xl:py-3 xl:text-sm ${
                      activeCategory === "all"
                        ? "border-orange-200 bg-[linear-gradient(180deg,#fff8ef_0%,#f8ebdd_100%)] text-[#c7641a] shadow-[0_10px_24px_rgba(255,107,0,0.10)]"
                        : "border-transparent bg-white/72 text-[#6a5f55] hover:border-orange-100 hover:bg-white"
                    }`}
                  >
                    Todo el menú
                  </button>
                  {availableCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setActiveCategory(category.id)}
                      className={`shrink-0 rounded-full border px-3.5 py-2 text-left text-xs font-bold transition-all duration-300 xl:w-full xl:rounded-2xl xl:px-4 xl:py-3 xl:text-sm ${
                        activeCategory === category.id
                          ? "border-orange-200 bg-[linear-gradient(180deg,#fff8ef_0%,#f8ebdd_100%)] text-[#c7641a] shadow-[0_10px_24px_rgba(255,107,0,0.10)]"
                          : "border-transparent bg-white/72 text-[#6a5f55] hover:border-orange-100 hover:bg-white"
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </nav>
              </div>
            </SectionCard>
          </aside>

          <section className="order-2 min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black tracking-tight text-white sm:text-2xl">
                  Productos del menú
                </h2>
                <p className="mt-1 text-sm leading-5 text-white/64 sm:leading-6">
                  Explora opciones rápidas, filtra por categoría y agrega al
                  carrito sin salir de la vista.
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#eadccb] bg-[linear-gradient(180deg,#fffdfa_0%,#f6efe6_100%)] px-3 py-1.5 text-xs font-semibold text-[#5d5145] shadow-[0_12px_28px_rgba(0,0,0,0.18)] sm:text-sm">
                {filteredProducts.length} resultados
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedProducts.length > 0 ? (
                paginatedProducts.map((product) => (
                  <article
                    key={product.id}
                    className="group flex min-h-0 max-w-full flex-col overflow-hidden rounded-[22px] border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,243,236,0.98)_100%)] p-2.5 shadow-[0_14px_30px_rgba(97,72,36,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_20px_42px_rgba(255,107,0,0.12)]"
                  >
                    <div className="relative overflow-hidden rounded-[18px] border border-[#efe4d8] bg-[#f6efe6]">
                      <AppImage
                        src={getProductImage(product)}
                        alt={product.name || "Producto"}
                        width={520}
                        height={390}
                        aspectClassName="aspect-[1.18/1]"
                        className="h-full w-full"
                        imageClassName="object-cover transition duration-500 group-hover:scale-[1.04]"
                        fallbackLabel="Producto"
                      />
                    </div>
                    <div className="flex flex-1 flex-col px-1 pt-3">
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="line-clamp-2 text-[0.95rem] font-black tracking-tight text-[#23170f] sm:text-base">
                              {product.name}
                            </h3>
                            {product.category_name ? (
                              <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#d96a18]">
                                {product.category_name}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <p className="line-clamp-2 text-xs leading-5 text-[#6f6459]">
                          {product.description_short ||
                            "Disponible para entrega rápida."}
                        </p>
                      </div>
                      <div className="mt-auto flex items-end justify-between gap-2 border-t border-[#eee3d6] pt-3">
                        <div className="min-w-0">
                          <span className="block text-sm font-black text-[#ff6b00] sm:text-base">
                            MX${getProductPrice(product).toFixed(2)}
                          </span>
                          {Number(product.discount_price ?? 0) > 0 &&
                          getOriginalProductPrice(product) >
                            getProductPrice(product) ? (
                            <span className="text-xs text-[#a39181] line-through">
                              MX${getOriginalProductPrice(product).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-[#9c8a79]">
                              Listo para agregar
                            </span>
                          )}
                        </div>
                        <Button
                          className="h-9 shrink-0 rounded-xl px-3 text-xs"
                          onClick={() => openCustomizationModal(product)}
                        >
                          <Plus className="h-4 w-4" />
                          Agregar
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
        </div>
      </main>

      {/* Modal de Personalización */}
      <Dialog open={customizeModalOpen} onOpenChange={setCustomizeModalOpen}>
        <DialogContent className="max-w-2xl rounded-[28px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold">
              {selectedProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {selectedProduct?.description_long}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-6 py-4 pr-2">
            {loadingCustomizations ? (
              <div className="py-10 flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-sm text-slate-500 mt-2">
                  Cargando opciones...
                </p>
              </div>
            ) : customizationGroups.length > 0 ? (
              customizationGroups.map((group) => (
                <div
                  key={group.id}
                  className="space-y-3 bg-slate-50 p-4 rounded-2xl"
                >
                  <h4 className="font-bold text-slate-900">{group.name}</h4>
                  {group.options.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl cursor-pointer hover:border-orange-200 transition"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="w-5 h-5 accent-orange-600 rounded"
                        />
                        <span className="font-medium">{opt.name}</span>
                      </div>
                      <span className="text-orange-600 font-bold text-sm">
                        +
                        {opt.extraPrice > 0 ? `MX$${opt.extraPrice}` : "Gratis"}
                      </span>
                    </label>
                  ))}
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

          <DialogFooter className="flex-col gap-4 border-t pt-4 sm:flex-row">
            <div className="flex h-12 items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-2">
              <button
                type="button"
                className="h-8 w-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-600"
                onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="font-bold text-lg min-w-[20px] text-center">
                {modalQuantity}
              </span>
              <button
                type="button"
                className="h-8 w-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-600"
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
                <Loader2 className="animate-spin h-5 w-5" />
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
        <div className="section-shell flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">
              Carrito
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {cartCount > 0
                ? `${cartCount} producto${cartCount === 1 ? "" : "s"} listos`
                : "Agrega algo para continuar"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-11 shrink-0 rounded-2xl px-4"
            onClick={() => router.push("/carrito")}
          >
            <ShoppingCart className="h-4 w-4" />
            {cartCount > 0 ? "Ver carrito" : "Ir al carrito"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Notificaciones flotantes */}
      {cartMessage && (
        <div className="fixed bottom-20 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-center text-white shadow-2xl animate-bounce sm:bottom-10">
          {cartMessage}
        </div>
      )}
      {cartError && (
        <div className="fixed bottom-36 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-red-600 px-5 py-3 text-center text-white shadow-2xl sm:bottom-24">
          {cartError}
        </div>
      )}
    </div>
  );
}
