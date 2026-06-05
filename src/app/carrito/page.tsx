"use client";

import { ArrowRight, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AddressRequiredDialog, {
  type SavedAddress,
} from "@/components/address/AddressRequiredDialog";
import { AppImage } from "@/components/ui/app-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/context/AuthContext";
import { useNotify } from "@/context/NotificationContext";
import {
  CART_UPDATED_EVENT,
  readStoredCartSnapshot,
  writeStoredCartSnapshot,
} from "@/lib/cart-storage";
import { fetchWithSession } from "@/lib/client-auth";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";
import { calculateOrderCommissionBreakdown } from "@/lib/order-commissions";
import type { ShippingByAddressResult } from "@/lib/shipping";
import { getTransferAccountConfig } from "@/lib/transfer-config";

// --- Tipos y Constantes ---
type StoredCartItem = {
  id: string;
  productId?: number;
  businessId?: number | null;
  businessName?: string;
  nombre: string;
  description?: string;
  categoryName?: string;
  negocio: string;
  image: string;
  extras: string[];
  tags?: string[];
  quantity: number;
  unitPrice?: number;
  price?: number;
  subtotal?: number;
  notes?: string;
  customizationsSummary?: string;
  customizations?: {
    selectedOptions?: Array<{
      groupName?: string;
      optionName?: string;
      extraPrice?: number;
    }>;
  };
};

type RawAddressLike = Record<string, unknown> & {
  id?: number;
  placeType?: string;
  placeName?: string;
  street?: string;
  externalNumber?: string;
  internalNumber?: string;
  fullAddress?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  references?: string;
  reference?: string;
  deliveryInstructions?: string;
  phone?: string;
};

type ApiCartProduct = {
  product_id: number;
  business_id?: number | null;
  business_name?: string | null;
  name?: string | null;
  description_short?: string | null;
  quantity: number;
  unit_price?: number | string | null;
  price?: number | string | null;
  total?: number | string | null;
  thumbnail_url?: string | null;
  image_url?: string | null;
};

function getCartItemUnitPrice(item: {
  unitPrice?: number;
  price?: number;
  quantity?: number;
}) {
  const unitPrice = Number(item.unitPrice ?? item.price ?? 0);

  if (Number.isFinite(unitPrice) && unitPrice > 0) {
    return unitPrice;
  }

  const quantity = Number(item.quantity ?? 0);
  const subtotal = Number(item.price ?? 0);

  if (quantity > 0 && Number.isFinite(subtotal) && subtotal > 0) {
    return Number((subtotal / quantity).toFixed(2));
  }

  return 0;
}

function getCartItemSubtotal(item: {
  unitPrice?: number;
  price?: number;
  quantity?: number;
}) {
  return Number(
    (getCartItemUnitPrice(item) * Number(item.quantity ?? 0)).toFixed(2),
  );
}

function toPositiveNumber(value: unknown) {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue > 0
    ? normalizedValue
    : null;
}

const DEFAULT_SHIPPING_STATE: ShippingByAddressResult = {
  zoneName: null,
  shippingCost: null,
  requiresConfirmation: true,
  message: "Agrega tu dirección para calcular el costo de envío.",
  distanceKm: null,
};

const PAYMENT_METHOD_OPTIONS = [
  {
    id: "efectivo",
    label: "Efectivo al recibir",
    description: "Paga en efectivo al llegar.",
  },
  {
    id: "mercadopago",
    label: "Pagar con Mercado Pago",
    description:
      "Completa tu pago con tarjeta de forma segura dentro de Gogi Eats.",
  },
  {
    id: "transferencia",
    label: "Transferencia",
    description: "Envía tu comprobante antes de la entrega.",
  },
] as const;

type PaymentMethodOption = (typeof PAYMENT_METHOD_OPTIONS)[number]["id"];

type MercadoPagoCardFormData = {
  token?: string;
  paymentMethodId?: string;
  issuerId?: string;
  installments?: number | string;
  identificationType?: string;
  identificationNumber?: string;
  cardholderEmail?: string;
  amount?: number | string;
};

type MercadoPagoCardForm = {
  getCardFormData: () => MercadoPagoCardFormData;
  unmount?: () => void;
};

type MercadoPagoInstance = {
  cardForm: (settings: {
    amount: string;
    iframe: boolean;
    form: Record<string, unknown>;
    callbacks: {
      onFormMounted?: (error?: unknown) => void;
      onSubmit?: (event: Event) => void;
      onFetching?: (resource: string) => () => void;
      onBinChange?: (bin: string) => void;
    };
  }) => MercadoPagoCardForm;
};

type MercadoPagoDebugState = {
  enabled: boolean;
  formMounted: boolean;
  lastEvent: string;
  bin: string;
  paymentMethodId: string;
  issuerId: string;
  tokenPresent: boolean;
  issuerOptions: number;
  installmentsOptions: number;
  identificationOptions: number;
  sdkError: string;
};

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string },
    ) => MercadoPagoInstance;
  }
}

const MERCADOPAGO_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY?.trim() ?? "";
const MERCADOPAGO_DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_MERCADOPAGO_DEBUG?.trim() === "1";

const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return `${moneyFormatter.format(Number.isFinite(value) ? value : 0)} MXN`;
}

function readMercadoPagoDebugSnapshot() {
  if (typeof document === "undefined") {
    return null;
  }

  const readSelectMetrics = (selector: string) => {
    const element = document.querySelector<HTMLSelectElement>(selector);
    if (!element) {
      return { options: 0, value: "" };
    }

    return {
      options: Array.from(element.options).filter((option) => {
        return option.value.trim() !== "";
      }).length,
      value: element.value ?? "",
    };
  };

  const tokenInput = document.querySelector<HTMLInputElement>(
    'input[name="MPHiddenInputToken"]',
  );
  const paymentMethodInput = document.querySelector<HTMLInputElement>(
    'input[name="MPHiddenInputPaymentMethod"]',
  );
  const issuer = readSelectMetrics("#gogi-mp-issuer");
  const installments = readSelectMetrics("#gogi-mp-installments");
  const identificationType = readSelectMetrics("#gogi-mp-identification-type");

  return {
    tokenPresent: Boolean(tokenInput?.value?.trim()),
    paymentMethodId: paymentMethodInput?.value?.trim() ?? "",
    issuerId: issuer.value,
    issuerOptions: issuer.options,
    installmentsOptions: installments.options,
    identificationOptions: identificationType.options,
  };
}

export default function CarritoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const notify = useNotify();
  const transferAccount = getTransferAccountConfig();
  const paymentMethodOptions = useMemo(
    () =>
      PAYMENT_METHOD_OPTIONS.filter(
        (option) => option.id !== "transferencia" || transferAccount,
      ),
    [transferAccount],
  );
  const mercadoPagoConfigError = useMemo(() => {
    if (!MERCADOPAGO_PUBLIC_KEY) {
      return "Mercado Pago no está disponible porque falta configurar NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY.";
    }

    return "";
  }, []);
  const mercadoPagoEnabled = !mercadoPagoConfigError;

  const mapToSavedAddress = useCallback(
    (address: RawAddressLike): SavedAddress => {
      const a = address ?? {};
      return {
        id: Number(a.id ?? 0),
        placeType: a.placeType ?? "",
        placeName: a.placeName ?? "",
        street: a.street ?? "",
        externalNumber: a.externalNumber ?? "",
        internalNumber: a.internalNumber ?? "",
        fullAddress:
          a.fullAddress ?? `${a.street ?? ""} ${a.externalNumber ?? ""}`.trim(),
        neighborhood: a.neighborhood ?? "",
        city: a.city ?? "",
        state: a.state ?? "",
        references: a.references ?? a.reference ?? "",
        deliveryInstructions: a.deliveryInstructions ?? "",
        phone: a.phone ?? "",
      };
    },
    [],
  );

  // --- Estados ---
  const [cartItems, setCartItems] = useState<StoredCartItem[]>([]);
  const [cartId, setCartId] = useState<number | null>(null);
  const [savedAddress, setSavedAddress] = useState<SavedAddress | null>(() => {
    if (!user?.address) return null;
    return mapToSavedAddress(user.address);
  });
  const [shipping, setShipping] = useState<ShippingByAddressResult>(
    DEFAULT_SHIPPING_STATE,
  );

  // UI States
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethodOption>("efectivo");
  const [transferReceiptName, setTransferReceiptName] = useState("");
  const [transferReceiptFile, setTransferReceiptFile] = useState<File | null>(
    null,
  );
  const [transferError, setTransferError] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartLoadError, setCartLoadError] = useState("");
  const [shippingLoading, setShippingLoading] = useState(false);
  const [cartSyncState, setCartSyncState] = useState<
    "idle" | "loading" | "guest" | "ready" | "error"
  >("idle");
  const [mercadoPagoStatus, setMercadoPagoStatus] = useState<
    | "idle"
    | "loading"
    | "ready"
    | "processing"
    | "approved"
    | "pending"
    | "rejected"
    | "error"
  >("idle");
  const [mercadoPagoMessage, setMercadoPagoMessage] = useState("");
  const [mercadoPagoDebug, setMercadoPagoDebug] =
    useState<MercadoPagoDebugState>({
      enabled: MERCADOPAGO_DEBUG_ENABLED,
      formMounted: false,
      lastEvent: "idle",
      bin: "",
      paymentMethodId: "",
      issuerId: "",
      tokenPresent: false,
      issuerOptions: 0,
      installmentsOptions: 0,
      identificationOptions: 0,
      sdkError: "",
    });
  const [mercadoPagoOrderId, setMercadoPagoOrderId] = useState<number | null>(
    null,
  );
  const mercadoPagoFormRef = useRef<MercadoPagoCardForm | null>(null);
  const mercadoPagoSubmitRef = useRef<
    ((data: MercadoPagoCardFormData) => Promise<void>) | null
  >(null);

  const mapStoredSnapshotToCartItems = useCallback(
    (items: ReturnType<typeof readStoredCartSnapshot>): StoredCartItem[] => {
      return items.map((item) => ({
        id: String(item.product_id),
        productId: item.product_id,
        businessId: item.business_id ?? null,
        businessName: item.business_name || "",
        nombre: item.name,
        description: item.description || "",
        categoryName: item.category_name || "",
        negocio: item.business_name || "Tienda Local",
        image: item.image_url || "/placeholder-product.png",
        extras: [],
        quantity: item.quantity,
        unitPrice: Number(item.unit_price ?? item.price ?? 0),
        price: Number(item.unit_price ?? item.price ?? 0),
        subtotal: Number(
          item.subtotal ??
            Number(item.unit_price ?? item.price ?? 0) *
              Number(item.quantity ?? 0),
        ),
        notes: item.notes || "",
        customizationsSummary: item.customizations_summary || "",
      }));
    },
    [],
  );

  // --- Efectos: Carga de Carrito y Dirección ---
  const syncCartStorage = useCallback((items: StoredCartItem[]) => {
    writeStoredCartSnapshot(
      items.map((item) => ({
        id: item.id,
        product_id: Number(item.productId ?? item.id),
        business_id: Number(item.businessId ?? 0) || null,
        business_name: String(item.businessName ?? item.negocio ?? "").trim(),
        name: item.nombre,
        description: String(item.description ?? "").trim(),
        category_name: String(item.categoryName ?? "").trim(),
        price: getCartItemUnitPrice(item),
        unit_price: getCartItemUnitPrice(item),
        image_url: item.image,
        quantity: item.quantity,
        subtotal: getCartItemSubtotal(item),
        notes: String(item.notes ?? "").trim(),
        customizations_summary: String(item.customizationsSummary ?? "").trim(),
      })),
    );
  }, []);

  const loadCart = useCallback(async () => {
    const localSnapshot = readStoredCartSnapshot();
    setCartLoading(true);
    setCartSyncState("loading");
    setCartLoadError("");

    if (!user) {
      const localItems = mapStoredSnapshotToCartItems(localSnapshot);
      setCartId(null);
      setCartItems(localItems);
      setCartSyncState("guest");
      setCartLoading(false);
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 12000);
      const res = await fetchWithSession(`/api/cart?user_id=${user.id}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          formatApiError(res.status, data, "No pudimos actualizar tu carrito."),
        );
      }

      if (!data?.success || !Array.isArray(data?.products)) {
        throw new Error("La respuesta del carrito no fue válida.");
      }

      if (
        data?.cart &&
        Array.isArray(data?.products) &&
        data.products.length > 0
      ) {
        const snapshotByProductId = new Map(
          localSnapshot.map((item) => [Number(item.product_id), item]),
        );
        const nextItems = data.products.map((p: ApiCartProduct) => {
          const snapshot = snapshotByProductId.get(Number(p.product_id));

          return {
            id: p.product_id.toString(),
            productId: p.product_id,
            businessId:
              Number(p.business_id ?? snapshot?.business_id ?? 0) || null,
            businessName: String(
              p.business_name ?? snapshot?.business_name ?? "",
            ),
            nombre: p.name ?? snapshot?.name ?? "Producto",
            description: String(
              p.description_short ?? snapshot?.description ?? "",
            ),
            categoryName: String(snapshot?.category_name ?? ""),
            image:
              snapshot?.image_url ||
              p.thumbnail_url ||
              p.image_url ||
              "/placeholder-product.png",
            negocio:
              String(p.business_name ?? snapshot?.business_name ?? "").trim() ||
              "Tienda Local",
            quantity: p.quantity,
            unitPrice: Number(p.unit_price ?? p.price ?? snapshot?.price ?? 0),
            price: Number(
              p.unit_price ??
                p.price ??
                snapshot?.unit_price ??
                snapshot?.price ??
                0,
            ),
            subtotal: Number(p.total ?? 0),
            extras: [],
            notes: String(snapshot?.notes ?? ""),
            customizationsSummary: String(
              snapshot?.customizations_summary ?? "",
            ),
          };
        });

        setCartId(data.cart.id);
        setCartItems(nextItems);
        syncCartStorage(nextItems);
      } else {
        setCartId(data?.cart?.id ? Number(data.cart.id) : null);
        setCartItems([]);
        syncCartStorage([]);
      }
      setCartSyncState("ready");
    } catch (err) {
      console.warn("Error cargando carrito:", err);
      setCartId(null);
      setCartItems([]);
      setCartSyncState("error");
      setCartLoadError(
        getFriendlyErrorMessage(
          err,
          "No pudimos actualizar tu carrito. Reintenta para cargar la información correcta.",
        ),
      );
    } finally {
      setCartLoading(false);
    }
  }, [mapStoredSnapshotToCartItems, syncCartStorage, user]);

  const loadShipping = useCallback(async () => {
    if (!savedAddress?.fullAddress) {
      setShipping(DEFAULT_SHIPPING_STATE);
      return;
    }

    setShippingLoading(true);

    try {
      const response = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: savedAddress.fullAddress,
          neighborhood: savedAddress.neighborhood,
        }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) {
        setShipping(data.shipping);
      } else {
        setShipping({
          ...DEFAULT_SHIPPING_STATE,
          message: formatApiError(
            response.status,
            data,
            "No pudimos calcular el envío. Revisa tu dirección.",
          ),
        });
      }
    } catch (_error) {
      setShipping({
        ...DEFAULT_SHIPPING_STATE,
        message: "No pudimos calcular el envío. Revisa tu dirección.",
      });
    } finally {
      setShippingLoading(false);
    }
  }, [savedAddress]);

  const handleRetryCheckout = useCallback(() => {
    void Promise.all([loadCart(), loadShipping()]);
  }, [loadCart, loadShipping]);

  useEffect(() => {
    void loadCart();
    setSavedAddress(user?.address ? mapToSavedAddress(user.address) : null);

    const handleCartUpdated = () => {
      void loadCart();
    };

    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdated);
    window.addEventListener("storage", handleCartUpdated);

    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdated);
      window.removeEventListener("storage", handleCartUpdated);
    };
  }, [loadCart, mapToSavedAddress, user]);

  useEffect(() => {
    async function repairIncompleteCartItems() {
      const itemsToRepair = cartItems.filter(
        (item) =>
          Number(item.productId ?? 0) > 0 &&
          (getCartItemUnitPrice(item) <= 0 ||
            !item.image ||
            item.image === "/placeholder-product.png"),
      );

      if (itemsToRepair.length === 0) return;

      try {
        const repairedEntries = await Promise.all(
          itemsToRepair.map(async (item) => {
            const response = await fetch(`/api/products/${item.productId}`, {
              cache: "no-store",
            });

            if (!response.ok) {
              throw new Error(
                `No se pudo recuperar el producto ${item.productId}`,
              );
            }

            const data = await response.json();
            const product = data.product ?? {};
            const business = data.business ?? {};
            const repairedPrice = Number(
              product.price ||
                product.sale_price ||
                product.offer_price ||
                product.discount_price ||
                0,
            );

            return [
              String(item.id),
              {
                ...item,
                businessId: Number(item.businessId ?? business.id ?? 0) || null,
                businessName:
                  String(item.businessName ?? item.negocio ?? "").trim() ||
                  String(business.name ?? "").trim(),
                negocio:
                  String(item.negocio ?? "").trim() ||
                  String(business.name ?? "").trim() ||
                  "Tienda Local",
                nombre:
                  String(item.nombre ?? "").trim() ||
                  String(product.name ?? ""),
                description:
                  String(item.description ?? "").trim() ||
                  String(
                    product.description ??
                      product.description_short ??
                      product.description_long ??
                      "",
                  ).trim(),
                categoryName: String(item.categoryName ?? "").trim(),
                image:
                  String(item.image ?? "").trim() &&
                  item.image !== "/placeholder-product.png"
                    ? item.image
                    : String(
                        product.image_url ??
                          product.imageUrl ??
                          product.image ??
                          product.photo_url ??
                          "",
                      ).trim() || "/placeholder-product.png",
                unitPrice:
                  getCartItemUnitPrice(item) > 0
                    ? getCartItemUnitPrice(item)
                    : repairedPrice,
                price:
                  getCartItemUnitPrice(item) > 0
                    ? getCartItemUnitPrice(item)
                    : repairedPrice,
                subtotal: Number(
                  (
                    (getCartItemUnitPrice(item) > 0
                      ? getCartItemUnitPrice(item)
                      : repairedPrice) * Number(item.quantity ?? 0)
                  ).toFixed(2),
                ),
                notes: String(item.notes ?? ""),
                customizationsSummary: String(item.customizationsSummary ?? ""),
              },
            ] as const;
          }),
        );

        const repairedById = new Map(repairedEntries);

        setCartItems((prev) => {
          const nextItems = prev.map(
            (item) => repairedById.get(String(item.id)) ?? item,
          );
          syncCartStorage(nextItems);
          return nextItems;
        });
      } catch (error) {
        console.warn("No se pudo reparar el carrito:", error);
      }
    }

    void repairIncompleteCartItems();
  }, [cartItems, syncCartStorage]);

  useEffect(() => {
    cartItems.forEach((item) => {
      if (Number(item.price ?? item.unitPrice ?? 0) <= 0) {
        console.warn("Cart item without price:", item);
      }
    });
  }, [cartItems]);

  // --- Efecto: Calcular Envío ---
  useEffect(() => {
    void loadShipping();
  }, [loadShipping]);

  // --- Cálculos ---
  const subtotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + getCartItemSubtotal(item), 0),
    [cartItems],
  );

  const hasOnlyZeroPriceItems = useMemo(
    () =>
      cartItems.length > 0 &&
      cartItems.every((item) => Number(item.price ?? item.unitPrice ?? 0) <= 0),
    [cartItems],
  );

  const commissionBreakdown = useMemo(
    () =>
      calculateOrderCommissionBreakdown({
        subtotal,
        distanceKm: shipping.distanceKm,
        deliveryFeeOverride: shipping.shippingCost,
        terminalFee: 0,
      }),
    [shipping.distanceKm, shipping.shippingCost, subtotal],
  );

  const hasValidItems = useMemo(
    () =>
      cartItems.length > 0 &&
      cartItems.every(
        (item) =>
          Number(item.productId ?? 0) > 0 &&
          Number(item.quantity ?? 0) > 0 &&
          getCartItemUnitPrice(item) > 0,
      ),
    [cartItems],
  );

  const cartBusinessState = useMemo(() => {
    const normalizedItems = cartItems.map((item) => ({
      id: String(item.id),
      productId: Number(item.productId ?? item.id ?? 0),
      name: String(item.nombre ?? "").trim(),
      businessId: toPositiveNumber(item.businessId),
      businessName: String(item.businessName ?? item.negocio ?? "").trim(),
    }));

    const invalidItems = normalizedItems.filter((item) => !item.businessId);
    const businessIds = Array.from(
      new Set(
        normalizedItems
          .map((item) => item.businessId)
          .filter((value): value is number => Boolean(value)),
      ),
    );

    return {
      invalidItems,
      businessIds,
      resolvedBusinessId:
        invalidItems.length === 0 && businessIds.length === 1
          ? businessIds[0]
          : null,
    };
  }, [cartItems]);

  const hasValidBusiness = useMemo(
    () =>
      cartBusinessState.invalidItems.length === 0 &&
      cartBusinessState.businessIds.length === 1,
    [cartBusinessState],
  );

  const checkoutBlockReason = useMemo(() => {
    if (!user) return "Necesitas iniciar sesión para continuar.";
    if (cartSyncState === "error") {
      return (
        cartLoadError ||
        "No pudimos confirmar tu carrito. Reintenta para continuar."
      );
    }
    if (cartSyncState !== "ready") {
      return "Estamos actualizando tu carrito.";
    }
    if (cartLoading) return "Estamos actualizando tu carrito.";
    if (cartItems.length === 0) return "Tu carrito está vacío.";
    if (!hasValidItems) return "Hay productos sin precio válido en tu carrito.";
    if (cartBusinessState.invalidItems.length > 0) {
      return "Hay productos en tu carrito sin negocio válido. Elimina esos productos y vuelve a intentar.";
    }
    if (cartBusinessState.businessIds.length > 1) {
      return "Tu carrito mezcla productos de distintos negocios. Finaliza un solo negocio por pedido.";
    }
    if (!hasValidBusiness)
      return "No pudimos identificar el negocio de este pedido.";
    if (!savedAddress) return "Agrega una dirección para continuar.";
    if (shipping.requiresConfirmation)
      return (
        shipping.message || "No pudimos calcular el envío. Revisa tu dirección."
      );
    if (commissionBreakdown.total <= 0)
      return "El total del pedido no es válido.";
    return "";
  }, [
    cartItems.length,
    cartBusinessState.businessIds.length,
    cartBusinessState.invalidItems.length,
    cartLoading,
    commissionBreakdown.total,
    hasValidBusiness,
    hasValidItems,
    cartLoadError,
    cartSyncState,
    savedAddress,
    shipping.message,
    shipping.requiresConfirmation,
    user,
  ]);

  const canContinueToPayment = !checkoutBlockReason && !submittingOrder;
  const canSubmitOrder =
    !checkoutBlockReason &&
    !submittingOrder &&
    Boolean(selectedPaymentMethod) &&
    (selectedPaymentMethod !== "mercadopago" || mercadoPagoEnabled);

  useEffect(() => {
    if (selectedPaymentMethod === "transferencia" && !transferAccount) {
      setSelectedPaymentMethod("efectivo");
    }
  }, [selectedPaymentMethod, transferAccount]);

  useEffect(() => {
    if (selectedPaymentMethod === "mercadopago" && !mercadoPagoEnabled) {
      setSelectedPaymentMethod("efectivo");
    }
  }, [mercadoPagoEnabled, selectedPaymentMethod]);

  useEffect(() => {
    if (cartSyncState !== "error") {
      return;
    }

    setPaymentDialogOpen(false);
    setTransferDialogOpen(false);
  }, [cartSyncState]);

  // --- Handlers ---
  const handleQuantityChange = async (id: string, delta: number) => {
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, item.quantity + delta);
    if (newQty === 0) return handleRemove(id);

    const nextItems = cartItems.map((i) =>
      i.id === id
        ? {
            ...i,
            quantity: newQty,
            price: getCartItemUnitPrice(i),
            subtotal: Number((getCartItemUnitPrice(i) * newQty).toFixed(2)),
          }
        : i,
    );

    setCartItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              quantity: newQty,
              price: getCartItemUnitPrice(i),
              subtotal: Number((getCartItemUnitPrice(i) * newQty).toFixed(2)),
            }
          : i,
      ),
    );

    syncCartStorage(nextItems);

    if (!cartId) {
      window.dispatchEvent(new Event(CART_UPDATED_EVENT));
      return;
    }

    try {
      await fetchWithSession("/api/cart/add-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cart_id: cartId,
          product_id: id,
          quantity: newQty,
          discount: 0,
        }),
      });
    } catch (error) {
      console.warn("No se pudo sincronizar la cantidad del carrito.", error);
      setCartLoadError(
        "No pudimos actualizar la cantidad en este momento. Reintenta en unos segundos.",
      );
    }
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  };

  const handleRemove = async (id: string) => {
    const nextItems = cartItems.filter((item) => item.id !== id);
    setCartItems(nextItems);
    if (cartId) {
      try {
        await fetchWithSession("/api/cart/remove-product", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cart_id: cartId, product_id: id }),
        });
      } catch (error) {
        console.warn("No se pudo quitar el producto del carrito.", error);
        setCartLoadError(
          "No pudimos quitar el producto en este momento. Reintenta de nuevo.",
        );
      }
    }
    syncCartStorage(nextItems);
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  };

  const handleClearCart = async () => {
    if (cartId) {
      await Promise.all(
        cartItems.map((item) =>
          fetchWithSession("/api/cart/remove-product", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cart_id: cartId,
              product_id: Number(item.productId ?? item.id),
            }),
          }).catch((error) => {
            console.warn("No se pudo limpiar item del carrito:", error);
          }),
        ),
      );
    }

    setCartItems([]);
    setCartId(null);
    syncCartStorage([]);
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  };

  const handleCheckout = () => {
    setTransferError("");

    if (!user || !hasValidItems || !hasValidBusiness) {
      const message =
        checkoutBlockReason ||
        "No pudimos continuar con tu pedido. Revisa tu carrito.";
      setTransferError(message);
      notify.warning(message, "Revisa tu pedido");
      return;
    }

    if (!savedAddress) {
      setAddressDialogOpen(true);
      return;
    }

    if (shipping.requiresConfirmation) {
      const message =
        shipping.message ||
        "No pudimos calcular el envío. Revisa tu dirección.";
      setTransferError(message);
      notify.warning(message, "Falta confirmar el envío");
      return;
    }

    if (selectedPaymentMethod === "mercadopago" && !mercadoPagoEnabled) {
      const message =
        mercadoPagoConfigError ||
        "Mercado Pago no está disponible en este momento.";
      setTransferError(message);
      notify.warning(message, "Configuración pendiente");
      return;
    }

    setPaymentDialogOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (!canSubmitOrder) {
      const message =
        checkoutBlockReason ||
        "Revisa la información del pedido para continuar.";
      setTransferError(message);
      notify.warning(message, "Pedido incompleto");
      return;
    }

    if (!selectedPaymentMethod) {
      const message = "Selecciona un método de pago.";
      setTransferError(message);
      notify.warning(message, "Falta un paso");
      return;
    }

    if (selectedPaymentMethod === "transferencia") {
      if (!transferAccount) {
        const message =
          "La transferencia no está disponible en este momento. Elige otro método de pago.";
        setTransferError(message);
        notify.warning(message, "Método no disponible");
        return;
      }
      setPaymentDialogOpen(false);
      setTransferDialogOpen(true);
      return;
    }

    if (selectedPaymentMethod === "mercadopago") {
      if (!mercadoPagoEnabled) {
        const message =
          mercadoPagoConfigError ||
          "Mercado Pago no está disponible en este momento.";
        setTransferError(message);
        notify.warning(message, "Configuración pendiente");
        return;
      }
      return;
    }

    const orderId = await processOrder("pending");
    if (orderId) {
      router.push(`/orders/${orderId}`);
    }
  };

  const processOrder = useCallback(
    async (status: string, proofUrl = "", _proofName = "") => {
      if (!canSubmitOrder) {
        const message =
          checkoutBlockReason ||
          "Tu pedido no se pudo completar. Intenta nuevamente.";
        setTransferError(message);
        notify.warning(message, "Pedido incompleto");
        return null;
      }

      setSubmittingOrder(true);
      try {
        if (selectedPaymentMethod === "transferencia" && !transferAccount) {
          throw new Error(
            "La transferencia no está disponible en este momento. Elige otro método de pago.",
          );
        }

        const checkoutPayload = {
          user_id: user?.id,
          address_id: savedAddress?.id,
          delivery_address_id: savedAddress?.id,
          cart_id: cartId,
          business_id: cartBusinessState.resolvedBusinessId,
          subtotal: commissionBreakdown.subtotal,
          terminal_fee: commissionBreakdown.terminalFee,
          shipping_cost: commissionBreakdown.deliveryFee,
          delivery_fee: commissionBreakdown.deliveryFee,
          service_fee: commissionBreakdown.serviceFee,
          platform_fee: commissionBreakdown.platformFee,
          driver_fee: commissionBreakdown.driverFee,
          total: commissionBreakdown.total,
          payment_method: selectedPaymentMethod,
          status,
          payment_receipt_url: proofUrl || null,
          comprobante_pago_url: proofUrl || null,
          delivery_instructions: deliveryInstructions || null,
          items: cartItems.map((i) => ({
            product_id: i.productId,
            quantity: i.quantity,
            business_id: i.businessId ?? null,
            unit_price: getCartItemUnitPrice(i),
            total_price: getCartItemSubtotal(i),
          })),
        };

        const res = await fetchWithSession("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(checkoutPayload),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data?.order?.id) {
          const createdOrderId = Number(data.order.id);
          if (selectedPaymentMethod !== "mercadopago") {
            setCartItems([]);
            setCartId(null);
            syncCartStorage([]);
            window.dispatchEvent(new Event(CART_UPDATED_EVENT));
          }
          setTransferDialogOpen(false);
          if (selectedPaymentMethod !== "mercadopago") {
            setPaymentDialogOpen(false);
          }
          setTransferReceiptFile(null);
          setTransferReceiptName("");
          setTransferError("");
          notify.success(
            selectedPaymentMethod === "mercadopago"
              ? "Pedido preparado. Completa el pago con tarjeta."
              : "Tu pedido fue creado correctamente.",
            selectedPaymentMethod === "mercadopago"
              ? "Pago seguro"
              : "Pedido listo",
          );
          return createdOrderId;
        }

        throw new Error(
          formatApiError(
            res.status,
            data,
            "No pudimos confirmar tu pedido. Intenta nuevamente.",
          ),
        );
      } catch (_error) {
        const message =
          _error instanceof Error
            ? getFriendlyErrorMessage(
                _error,
                "No pudimos confirmar tu pedido. Intenta nuevamente.",
              )
            : "No pudimos confirmar tu pedido. Intenta nuevamente.";
        setTransferError(message);
        notify.error(message, "No pudimos crear tu pedido");
        return null;
      } finally {
        setSubmittingOrder(false);
      }
    },
    [
      canSubmitOrder,
      cartBusinessState.resolvedBusinessId,
      cartId,
      cartItems,
      checkoutBlockReason,
      commissionBreakdown.deliveryFee,
      commissionBreakdown.driverFee,
      commissionBreakdown.platformFee,
      commissionBreakdown.serviceFee,
      commissionBreakdown.subtotal,
      commissionBreakdown.terminalFee,
      commissionBreakdown.total,
      deliveryInstructions,
      notify,
      savedAddress?.id,
      selectedPaymentMethod,
      syncCartStorage,
      transferAccount,
      user?.id,
    ],
  );

  const submitMercadoPagoPayment = useCallback(
    async (formData: MercadoPagoCardFormData) => {
      if (MERCADOPAGO_DEBUG_ENABLED) {
        const snapshot = readMercadoPagoDebugSnapshot();
        console.info("[mercadopago-debug] submit payload", {
          tokenPresent: Boolean(formData.token?.trim()),
          paymentMethodId: formData.paymentMethodId ?? "",
          issuerId: formData.issuerId ?? "",
          installments: formData.installments ?? "",
          identificationType: formData.identificationType ?? "",
          identificationNumberPresent: Boolean(
            formData.identificationNumber?.trim(),
          ),
          emailPresent: Boolean(formData.cardholderEmail?.trim()),
          amount: formData.amount ?? "",
          snapshot,
        });
      }

      if (!canSubmitOrder) {
        const message =
          checkoutBlockReason ||
          "Revisa la información del pedido para continuar.";
        setMercadoPagoStatus("error");
        setMercadoPagoMessage(message);
        notify.warning(message, "Pedido incompleto");
        return;
      }

      const token = String(formData.token ?? "").trim();
      const paymentMethodId = String(formData.paymentMethodId ?? "").trim();

      if (!token || !paymentMethodId) {
        const message =
          "No pudimos validar los datos de la tarjeta. Revisa el formulario.";
        setMercadoPagoStatus("error");
        setMercadoPagoMessage(message);
        notify.warning(message, "Pago incompleto");
        return;
      }

      setSubmittingOrder(true);
      setMercadoPagoStatus("processing");
      setMercadoPagoMessage("Procesando pago con Mercado Pago...");

      try {
        const orderId =
          mercadoPagoOrderId ?? (await processOrder("pending_payment"));

        if (!orderId) {
          setMercadoPagoStatus("error");
          setMercadoPagoMessage("No pudimos preparar tu pedido para cobrarlo.");
          return;
        }

        setMercadoPagoOrderId(orderId);

        const paymentRes = await fetchWithSession(
          "/api/payments/mercadopago/process-payment",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              orderId,
              token,
              paymentMethodId,
              issuerId: formData.issuerId || null,
              installments: Number(formData.installments ?? 1) || 1,
              identificationType: formData.identificationType || null,
              identificationNumber: formData.identificationNumber || null,
              total: commissionBreakdown.total,
              items: cartItems.map((item) => ({
                product_id: item.productId,
                quantity: item.quantity,
              })),
            }),
          },
        );
        const paymentData = await paymentRes.json().catch(() => null);

        if (!paymentRes.ok || !paymentData?.success) {
          throw new Error(
            formatApiError(
              paymentRes.status,
              paymentData,
              "No pudimos procesar tu pago con Mercado Pago.",
            ),
          );
        }

        const paymentStatus = String(paymentData.paymentStatus ?? "")
          .trim()
          .toLowerCase();

        if (paymentStatus === "approved") {
          setMercadoPagoStatus("approved");
          setMercadoPagoMessage("Pago aprobado. Tu pedido quedó confirmado.");
          setCartItems([]);
          setCartId(null);
          syncCartStorage([]);
          window.dispatchEvent(new Event(CART_UPDATED_EVENT));
          notify.success(
            "Pago aprobado con Mercado Pago.",
            "Pedido confirmado",
          );
          setPaymentDialogOpen(false);
          router.push(`/orders/${orderId}`);
          return;
        }

        if (paymentStatus === "pending" || paymentStatus === "in_process") {
          setMercadoPagoStatus("pending");
          setMercadoPagoMessage(
            "Tu pago quedó pendiente de confirmación. Te avisaremos cuando Mercado Pago responda.",
          );
          notify.info("Tu pago está pendiente.", "Mercado Pago");
          router.push(`/checkout/pending?orderId=${orderId}`);
          return;
        }

        setMercadoPagoStatus("rejected");
        setMercadoPagoMessage(
          "Mercado Pago rechazó el pago. Puedes revisar tu tarjeta o intentar con otro método.",
        );
        notify.error("Mercado Pago rechazó el pago.", "Pago rechazado");
      } catch (error) {
        const message =
          error instanceof Error
            ? getFriendlyErrorMessage(
                error,
                "No pudimos procesar tu pago con Mercado Pago.",
              )
            : "No pudimos procesar tu pago con Mercado Pago.";
        setMercadoPagoStatus("error");
        setMercadoPagoMessage(message);
        notify.error(message, "Pago no completado");
      } finally {
        setSubmittingOrder(false);
      }
    },
    [
      canSubmitOrder,
      cartItems,
      checkoutBlockReason,
      commissionBreakdown.total,
      mercadoPagoOrderId,
      notify,
      processOrder,
      router,
      syncCartStorage,
    ],
  );

  useEffect(() => {
    mercadoPagoSubmitRef.current = submitMercadoPagoPayment;
  }, [submitMercadoPagoPayment]);

  useEffect(() => {
    if (selectedPaymentMethod !== "mercadopago") {
      setMercadoPagoStatus("idle");
      setMercadoPagoMessage("");
      setMercadoPagoOrderId(null);
      setMercadoPagoDebug((current) => ({
        ...current,
        formMounted: false,
        lastEvent: "idle",
        bin: "",
        paymentMethodId: "",
        issuerId: "",
        tokenPresent: false,
        issuerOptions: 0,
        installmentsOptions: 0,
        identificationOptions: 0,
        sdkError: "",
      }));
    }
  }, [selectedPaymentMethod]);

  useEffect(() => {
    if (!paymentDialogOpen || selectedPaymentMethod !== "mercadopago") {
      return;
    }

    if (!mercadoPagoEnabled) {
      setMercadoPagoStatus("error");
      setMercadoPagoMessage(
        mercadoPagoConfigError ||
          "Mercado Pago no está disponible en este momento.",
      );
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const mountCardForm = () => {
      if (cancelled || !window.MercadoPago) return;

      mercadoPagoFormRef.current?.unmount?.();
      setMercadoPagoStatus("loading");
      setMercadoPagoMessage("Cargando formulario seguro de Mercado Pago...");

      const mp = new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, {
        locale: "es-MX",
      });
      const cardForm = mp.cardForm({
        amount: commissionBreakdown.total.toFixed(2),
        iframe: true,
        form: {
          id: "gogi-mp-card-form",
          cardNumber: {
            id: "gogi-mp-card-number",
            placeholder: "Número de tarjeta",
          },
          expirationDate: {
            id: "gogi-mp-expiration-date",
            placeholder: "MM/AA",
          },
          securityCode: {
            id: "gogi-mp-security-code",
            placeholder: "CVV",
          },
          cardholderName: {
            id: "gogi-mp-cardholder-name",
            placeholder: "Nombre del titular",
          },
          issuer: {
            id: "gogi-mp-issuer",
            placeholder: "Banco emisor",
          },
          installments: {
            id: "gogi-mp-installments",
            placeholder: "Cuotas",
          },
          identificationType: {
            id: "gogi-mp-identification-type",
            placeholder: "Tipo de documento",
          },
          identificationNumber: {
            id: "gogi-mp-identification-number",
            placeholder: "Número de documento",
          },
          cardholderEmail: {
            id: "gogi-mp-cardholder-email",
            placeholder: "Correo electrónico",
          },
        },
        callbacks: {
          onFormMounted: (error?: unknown) => {
            if (error) {
              console.warn("Mercado Pago card form mount error:", error);
              setMercadoPagoDebug((current) => ({
                ...current,
                formMounted: false,
                lastEvent: "mount_error",
                sdkError:
                  error instanceof Error ? error.message : String(error),
              }));
              setMercadoPagoStatus("error");
              setMercadoPagoMessage(
                "No pudimos cargar el formulario de Mercado Pago.",
              );
              return;
            }
            const snapshot = readMercadoPagoDebugSnapshot();
            setMercadoPagoDebug((current) => ({
              ...current,
              formMounted: true,
              lastEvent: "mounted",
              sdkError: "",
              paymentMethodId: snapshot?.paymentMethodId ?? "",
              issuerId: snapshot?.issuerId ?? "",
              tokenPresent: snapshot?.tokenPresent ?? false,
              issuerOptions: snapshot?.issuerOptions ?? 0,
              installmentsOptions: snapshot?.installmentsOptions ?? 0,
              identificationOptions: snapshot?.identificationOptions ?? 0,
            }));
            setMercadoPagoStatus("ready");
            setMercadoPagoMessage(
              "Ingresa tu tarjeta. Tus datos se tokenizan de forma segura.",
            );
          },
          onBinChange: (bin: string) => {
            const snapshot = readMercadoPagoDebugSnapshot();
            setMercadoPagoDebug((current) => ({
              ...current,
              lastEvent: "bin_change",
              bin: String(bin ?? "").trim(),
              paymentMethodId: snapshot?.paymentMethodId ?? "",
              issuerId: snapshot?.issuerId ?? "",
              tokenPresent: snapshot?.tokenPresent ?? false,
              issuerOptions: snapshot?.issuerOptions ?? 0,
              installmentsOptions: snapshot?.installmentsOptions ?? 0,
              identificationOptions: snapshot?.identificationOptions ?? 0,
            }));
            if (MERCADOPAGO_DEBUG_ENABLED) {
              console.info("[mercadopago-debug] bin change", {
                bin,
                snapshot,
              });
            }
          },
          onSubmit: (event: Event) => {
            event.preventDefault();
            void mercadoPagoSubmitRef.current?.(cardForm.getCardFormData());
          },
          onFetching: () => {
            const snapshot = readMercadoPagoDebugSnapshot();
            setMercadoPagoDebug((current) => ({
              ...current,
              lastEvent: "fetching",
              paymentMethodId: snapshot?.paymentMethodId ?? "",
              issuerId: snapshot?.issuerId ?? "",
              tokenPresent: snapshot?.tokenPresent ?? false,
              issuerOptions: snapshot?.issuerOptions ?? 0,
              installmentsOptions: snapshot?.installmentsOptions ?? 0,
              identificationOptions: snapshot?.identificationOptions ?? 0,
            }));
            setMercadoPagoStatus("processing");
            setMercadoPagoMessage("Validando datos con Mercado Pago...");
            return () => {
              setMercadoPagoStatus("ready");
            };
          },
        },
      });

      mercadoPagoFormRef.current = cardForm;
      cleanup = () => {
        cardForm.unmount?.();
        mercadoPagoFormRef.current = null;
      };
    };

    if (window.MercadoPago) {
      mountCardForm();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://sdk.mercadopago.com/js/v2"]',
      );

      if (existingScript) {
        existingScript.addEventListener("load", mountCardForm, { once: true });
        cleanup = () => {
          existingScript.removeEventListener("load", mountCardForm);
        };
      } else {
        const script = document.createElement("script");
        script.src = "https://sdk.mercadopago.com/js/v2";
        script.async = true;
        script.onload = mountCardForm;
        script.onerror = () => {
          setMercadoPagoStatus("error");
          setMercadoPagoMessage(
            "No pudimos cargar Mercado Pago. Revisa tu conexión.",
          );
        };
        document.body.appendChild(script);
        cleanup = () => {
          script.onload = null;
          script.onerror = null;
        };
      }
    }

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [
    commissionBreakdown.total,
    mercadoPagoConfigError,
    mercadoPagoEnabled,
    paymentDialogOpen,
    selectedPaymentMethod,
  ]);

  useEffect(() => {
    if (
      !MERCADOPAGO_DEBUG_ENABLED ||
      !paymentDialogOpen ||
      selectedPaymentMethod !== "mercadopago"
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const snapshot = readMercadoPagoDebugSnapshot();
      if (!snapshot) return;

      setMercadoPagoDebug((current) => ({
        ...current,
        paymentMethodId: snapshot.paymentMethodId,
        issuerId: snapshot.issuerId,
        tokenPresent: snapshot.tokenPresent,
        issuerOptions: snapshot.issuerOptions,
        installmentsOptions: snapshot.installmentsOptions,
        identificationOptions: snapshot.identificationOptions,
      }));
    }, 600);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [paymentDialogOpen, selectedPaymentMethod]);

  const handleTransferOrder = async () => {
    if (!transferReceiptFile) {
      const message = "Sube tu comprobante antes de continuar.";
      setTransferError(message);
      notify.warning(message, "Falta tu comprobante");
      return;
    }

    setSubmittingOrder(true);
    setTransferError("");

    try {
      const formData = new FormData();
      formData.append("file", transferReceiptFile);

      const uploadRes = await fetchWithSession("/api/upload/payment-proof", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json().catch(() => null);

      if (!uploadRes.ok || !uploadData?.success || !uploadData?.url) {
        throw new Error(
          formatApiError(
            uploadRes.status,
            uploadData,
            "No pudimos subir la imagen. Intenta nuevamente.",
          ),
        );
      }

      const createdOrderId = await processOrder(
        "payment_review",
        String(uploadData.url),
        transferReceiptFile.name,
      );

      if (createdOrderId) {
        router.push(`/orders/${createdOrderId}`);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? getFriendlyErrorMessage(
              error,
              "No pudimos registrar la transferencia. Intenta nuevamente.",
            )
          : "No pudimos registrar la transferencia. Intenta nuevamente.";
      setTransferError(message);
      notify.error(message, "Transferencia no registrada");
    } finally {
      setSubmittingOrder(false);
    }
  };

  // --- Render condicional para vacíos ---
  if (cartLoading && cartItems.length === 0)
    return (
      <div className="min-h-screen bg-black px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <SectionCard className="p-6">
            <p className="text-sm font-semibold text-slate-500">
              Estamos cargando tu carrito...
            </p>
          </SectionCard>
        </div>
      </div>
    );

  if (!cartLoading && cartSyncState === "error")
    return (
      <div className="min-h-screen bg-black px-4 py-10 text-white sm:px-6">
        <div className="mx-auto max-w-3xl">
          <SectionCard className="space-y-4 p-6">
            <p className="text-lg font-black tracking-tight text-[#f5f5f5]">
              No pudimos cargar tu carrito
            </p>
            <p className="text-sm font-medium leading-6 text-[#b3b3b3]">
              {cartLoadError ||
                "Reintenta para obtener el carrito real antes de continuar al pago."}
            </p>
            <Button
              type="button"
              onClick={handleRetryCheckout}
              disabled={cartLoading || shippingLoading}
              className="w-full sm:w-auto"
            >
              {cartLoading || shippingLoading
                ? "Reintentando..."
                : "Reintentar"}
            </Button>
          </SectionCard>
        </div>
      </div>
    );

  if (!cartLoading && cartItems.length === 0)
    return (
      <div className="min-h-screen bg-black px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={ShoppingCart}
            title="Tu carrito está vacío"
            description="Explora negocios cercanos, agrega tus favoritos y vuelve aquí para terminar tu pedido."
            actionLabel="Ir a la tienda"
            onAction={() => router.push("/shop")}
          />
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="section-shell responsive-stack pb-[calc(env(safe-area-inset-bottom)+6.75rem)] pt-3 sm:py-6 lg:pb-8 lg:pt-6">
        <PageHeader
          eyebrow="Checkout"
          title="Tu pedido está casi listo"
          description="Revisa tus productos, confirma la dirección y elige cómo quieres pagar."
          className="gap-2.5 px-3 py-3.5 sm:gap-4 sm:px-6 sm:py-6"
        />
        {cartLoadError ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{cartLoadError}</span>
              <Button
                type="button"
                variant="outline"
                onClick={handleRetryCheckout}
                disabled={cartLoading || shippingLoading}
                className="border-amber-300 text-amber-800"
              >
                {cartLoading || shippingLoading
                  ? "Reintentando..."
                  : "Reintentar"}
              </Button>
            </div>
          </div>
        ) : null}
        {transferError ? (
          <div className="rounded-[18px] border border-red-300/80 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700 sm:rounded-[24px] sm:px-4 sm:py-3 sm:text-sm">
            {transferError}
          </div>
        ) : null}
        <div className="responsive-dashboard-grid gap-4 lg:gap-8">
          <section className="space-y-4 sm:space-y-6">
            <h2 className="text-xl font-black tracking-tight text-[#f5f5f5] sm:text-2xl">
              Productos seleccionados
            </h2>
            {cartLoading ? (
              <SectionCard className="space-y-3 p-3 sm:p-6">
                <div className="h-4 w-32 animate-pulse rounded-full bg-white/10 sm:hidden" />
                <div className="grid grid-cols-[80px,minmax(0,1fr),auto] gap-3 sm:hidden">
                  <div className="h-20 rounded-[18px] bg-white/10" />
                  <div className="space-y-2">
                    <div className="h-4 w-4/5 animate-pulse rounded-full bg-white/10" />
                    <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
                    <div className="h-3 w-full animate-pulse rounded-full bg-white/10" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-16 animate-pulse rounded-full bg-white/10" />
                    <div className="h-9 w-20 animate-pulse rounded-full bg-white/10" />
                  </div>
                </div>
                <p className="hidden text-sm font-semibold text-[#b3b3b3] sm:block">
                  Actualizando tu carrito...
                </p>
              </SectionCard>
            ) : null}
            {cartItems.map((item) => (
              <SectionCard
                key={item.id}
                className="grid grid-cols-[80px,minmax(0,1fr),auto] items-center gap-3 overflow-hidden p-3 sm:flex sm:items-start sm:gap-4 sm:p-5"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[18px] bg-slate-100 sm:h-24 sm:w-24 sm:rounded-2xl">
                  <AppImage
                    src={item.image}
                    alt={item.nombre}
                    width={160}
                    height={160}
                    aspectClassName="aspect-square"
                    className="h-full w-full"
                    imageClassName="object-cover"
                    fallbackLabel="Producto"
                  />
                </div>
                <div className="min-w-0 flex-1 self-stretch">
                  <h3 className="text-[0.95rem] font-black leading-5 tracking-tight text-[#f5f5f5] sm:text-lg">
                    {item.nombre}
                  </h3>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-orange-300 sm:mt-1 sm:text-sm sm:tracking-normal">
                    {item.negocio}
                  </p>
                  {item.description ? (
                    <p className="mt-1 overflow-hidden text-[11px] leading-4 text-[#b3b3b3] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:mt-2 sm:text-sm sm:leading-5 sm:[-webkit-line-clamp:3]">
                      {item.description}
                    </p>
                  ) : null}
                  {item.customizationsSummary || item.notes ? (
                    <div className="mt-1.5 space-y-1 sm:mt-3">
                      {item.customizationsSummary ? (
                        <p className="overflow-hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8f8f8f] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] sm:text-xs sm:tracking-[0.14em]">
                          {item.customizationsSummary}
                        </p>
                      ) : null}
                      {item.notes ? (
                        <p className="overflow-hidden text-[10px] font-medium text-[#b3b3b3] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] sm:text-xs sm:[-webkit-line-clamp:2]">
                          {item.notes}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex min-w-[5.25rem] flex-col items-end justify-between self-stretch gap-2.5 sm:min-w-[8rem]">
                  <div className="text-right">
                    <span className="block text-[0.95rem] font-black leading-none text-[#f5f5f5] sm:text-base">
                      {formatMoney(getCartItemSubtotal(item))}
                    </span>
                    <span className="mt-1 inline-flex rounded-full bg-orange-500/12 px-2 py-0.5 text-[10px] font-bold text-orange-300 sm:px-3 sm:py-1 sm:text-sm">
                      {formatMoney(getCartItemUnitPrice(item))} c/u
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-1.5 py-1 sm:gap-2 sm:px-2 sm:py-1">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.id, -1)}
                      className="inline-flex size-7 items-center justify-center rounded-full text-sm text-white/70 transition hover:bg-white/10 hover:text-white sm:size-8"
                    >
                      −
                    </button>
                    <span className="min-w-[18px] text-center text-sm font-black text-[#f5f5f5] sm:min-w-[20px]">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.id, 1)}
                      className="inline-flex size-7 items-center justify-center rounded-full text-sm text-white/70 transition hover:bg-white/10 hover:text-white sm:size-8"
                    >
                      +
                    </button>
                  </div>
                </div>
              </SectionCard>
            ))}

            <textarea
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              placeholder="Instrucciones para el repartidor..."
              className="w-full rounded-[20px] border border-white/10 bg-black/70 px-3.5 py-3 text-sm font-medium leading-5 text-white placeholder:text-white/35 sm:px-4 sm:py-4"
              rows={2}
            />
          </section>

          <aside className="space-y-4 sm:space-y-6">
            <SectionCard className="p-4 lg:sticky lg:top-24 lg:p-6">
              <h2 className="mb-3 text-lg font-black tracking-tight text-[#f5f5f5] sm:mb-4 sm:text-xl">
                Resumen de compra
              </h2>
              {hasOnlyZeroPriceItems ? (
                <div className="mb-4 rounded-2xl border border-orange-500/30 bg-black/60 p-3.5 sm:p-4">
                  <p className="text-sm font-semibold text-orange-300">
                    Detectamos productos viejos sin precio en tu carrito.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearCart}
                    className="mt-3 border-orange-300 text-orange-300"
                  >
                    Vaciar carrito
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2.5 text-sm sm:space-y-3">
                <div className="flex justify-between font-medium text-[#b3b3b3]">
                  <span>Productos</span>
                  <span className="font-bold text-[#f5f5f5]">
                    {formatMoney(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-[#b3b3b3]">
                  <span>Servicio</span>
                  <span className="font-bold text-[#f5f5f5]">
                    {formatMoney(commissionBreakdown.serviceFee)}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-[#b3b3b3]">
                  <span>Envío</span>
                  <span className="font-bold text-[#f5f5f5]">
                    {commissionBreakdown.deliveryFee > 0
                      ? formatMoney(commissionBreakdown.deliveryFee)
                      : "Gratis"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-3 text-base font-black text-[#f5f5f5] sm:text-lg">
                  <span>Total</span>
                  <span>{formatMoney(commissionBreakdown.total)}</span>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] bg-black/60 p-3.5 sm:mt-6 sm:rounded-[24px] sm:p-4">
                <p className="text-xs font-bold uppercase text-orange-300">
                  Entrega en:
                </p>
                <p className="mt-1 text-sm font-semibold leading-5 text-[#f5f5f5]">
                  {savedAddress?.fullAddress || "Sin dirección"}
                </p>
                {shipping.message ? (
                  <p className="mt-2 text-xs font-medium text-[#b3b3b3]">
                    {shipping.message}
                  </p>
                ) : null}
                <Button
                  variant="link"
                  onClick={() => setAddressDialogOpen(true)}
                  className="mt-2 h-auto p-0 text-orange-600"
                >
                  Cambiar
                </Button>
              </div>

              <Button
                onClick={handleCheckout}
                size="lg"
                className="mt-4 hidden w-full lg:inline-flex"
                disabled={!canContinueToPayment}
              >
                {submittingOrder ? "Procesando..." : "Continuar al pago"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              {checkoutBlockReason ? (
                <p className="mt-3 text-xs font-semibold leading-5 text-[#b3b3b3] sm:text-sm">
                  {checkoutBlockReason}
                </p>
              ) : null}
            </SectionCard>
          </aside>
        </div>
      </div>

      <div className="safe-bottom sticky bottom-0 z-30 border-t border-white/10 bg-[rgba(8,8,8,0.92)] px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] shadow-[0_-16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden">
        <div className="section-shell flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8f8f8f]">
              Total
            </p>
            <p className="truncate text-base font-black text-white sm:text-lg">
              {formatMoney(commissionBreakdown.total)}
            </p>
          </div>
          <Button
            onClick={handleCheckout}
            size="lg"
            className="h-11 min-w-[9.75rem] shrink-0 rounded-2xl px-4 text-sm shadow-[0_10px_24px_rgba(249,115,22,0.24)]"
            disabled={!canContinueToPayment}
          >
            {submittingOrder ? "Procesando..." : "Continuar"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Diálogos */}
      <AddressRequiredDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        onSaved={setSavedAddress}
      />

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[24px] border-white/10 bg-black p-0 sm:max-w-[min(42rem,calc(100vw-2rem))]">
          <DialogHeader className="shrink-0 px-4 pb-0 pt-4 sm:px-5 sm:pt-5">
            <DialogTitle>Método de pago</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
            <div className="space-y-3.5">
              <div className="rounded-[22px] bg-black/60 p-3 text-sm text-white/70 sm:p-3.5">
                <p className="font-semibold text-[#f5f5f5]">
                  Resumen antes de confirmar
                </p>
                <p className="mt-2">
                  Productos:{" "}
                  {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                </p>
                <p>Subtotal: {formatMoney(subtotal)}</p>
                <p>
                  Envío:{" "}
                  {commissionBreakdown.deliveryFee > 0
                    ? formatMoney(commissionBreakdown.deliveryFee)
                    : "Gratis"}
                </p>
                <p>Servicio: {formatMoney(commissionBreakdown.serviceFee)}</p>
                <p className="mt-1 font-black text-[#f5f5f5]">
                  Total: {formatMoney(commissionBreakdown.total)}
                </p>
                <p className="mt-2 text-xs">
                  Dirección: {savedAddress?.fullAddress || "Sin dirección"}
                </p>
                <p className="mt-1 text-xs">
                  Método:{" "}
                  {selectedPaymentMethod === "transferencia"
                    ? "Transferencia"
                    : selectedPaymentMethod === "mercadopago"
                      ? "Mercado Pago"
                      : "Efectivo al recibir"}
                </p>
              </div>
              {!mercadoPagoEnabled ? (
                <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  {mercadoPagoConfigError}
                </div>
              ) : null}
              <div className="grid gap-2.5">
                {paymentMethodOptions.map((opt) => {
                  const isDisabled =
                    opt.id === "mercadopago" && !mercadoPagoEnabled;

                  return (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => {
                        if (isDisabled) return;
                        setSelectedPaymentMethod(opt.id);
                      }}
                      disabled={isDisabled}
                      aria-disabled={isDisabled}
                      className={`rounded-[20px] border px-3.5 py-3 text-left transition sm:rounded-[22px] ${selectedPaymentMethod === opt.id ? "border-orange-500 bg-orange-500/10 shadow-sm" : "border-white/10 bg-black/70 hover:border-orange-300/40"} ${isDisabled ? "cursor-not-allowed opacity-55 hover:border-white/10" : ""}`}
                    >
                      <p className="font-black text-[#f5f5f5]">
                        {opt.label}
                        {isDisabled ? " (No disponible)" : ""}
                      </p>
                      <p className="mt-1 text-xs text-[#b3b3b3] sm:text-sm">
                        {isDisabled
                          ? "Configura la llave pública de Mercado Pago para habilitar este método."
                          : opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
              {selectedPaymentMethod === "mercadopago" ? (
                <form
                  id="gogi-mp-card-form"
                  className="payment-modal space-y-2 rounded-[18px] border border-orange-200/40 bg-[#fff7ed] p-3 text-[#2B1A12] sm:space-y-2.5 sm:p-3.5"
                >
                  <div>
                    <p className="text-sm font-black">
                      Paga dentro de Gogi Eats
                    </p>
                    <p className="mt-1 text-xs font-medium leading-4.5 text-[#7A5A45]">
                      Tus datos se tokenizan con Mercado Pago. No guardamos tu
                      tarjeta.
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="grid gap-1 text-xs font-bold text-[#7A5A45] md:col-span-2">
                      <span>Número de tarjeta</span>
                      <div
                        id="gogi-mp-card-number"
                        className="mp-field h-[44px] min-h-[44px] max-h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 py-0 text-[#2b1f18]"
                      />
                    </div>
                    <div className="grid gap-1 text-xs font-bold text-[#7A5A45]">
                      <span>Vencimiento</span>
                      <div
                        id="gogi-mp-expiration-date"
                        className="mp-field h-[44px] min-h-[44px] max-h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 py-0 text-[#2b1f18]"
                      />
                    </div>
                    <div className="grid gap-1 text-xs font-bold text-[#7A5A45]">
                      <span>CVV</span>
                      <div
                        id="gogi-mp-security-code"
                        className="mp-field h-[44px] min-h-[44px] max-h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 py-0 text-[#2b1f18]"
                      />
                    </div>
                    <label className="grid gap-1 text-xs font-bold text-[#7A5A45] md:col-span-2">
                      Nombre del titular
                      <input
                        id="gogi-mp-cardholder-name"
                        className="h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 text-sm font-semibold text-[#2b1f18] outline-none transition placeholder:text-[#9a8472] focus:border-[#e98a4a]"
                        placeholder="Como aparece en la tarjeta"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-[#7A5A45]">
                      Banco emisor
                      <select
                        id="gogi-mp-issuer"
                        className="h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 text-sm font-semibold text-[#2b1f18] outline-none transition focus:border-[#e98a4a]"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-[#7A5A45]">
                      Cuotas
                      <select
                        id="gogi-mp-installments"
                        className="h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 text-sm font-semibold text-[#2b1f18] outline-none transition focus:border-[#e98a4a]"
                      />
                    </label>
                    <label className="hidden">
                      Tipo de documento
                      <select
                        id="gogi-mp-identification-type"
                        className="h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 text-sm font-semibold text-[#2b1f18] outline-none transition focus:border-[#e98a4a]"
                      />
                    </label>
                    <label className="hidden">
                      Número de documento
                      <input
                        id="gogi-mp-identification-number"
                        className="h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 text-sm font-semibold text-[#2b1f18] outline-none transition placeholder:text-[#9a8472] focus:border-[#e98a4a]"
                        placeholder="Si aplica"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-[#7A5A45] md:col-span-2">
                      Correo para el recibo
                      <input
                        id="gogi-mp-cardholder-email"
                        type="email"
                        className="h-[44px] rounded-[12px] border border-[#E8DCCB] bg-[#fffaf3] px-2.5 text-sm font-semibold text-[#2b1f18] outline-none transition placeholder:text-[#9a8472] focus:border-[#e98a4a]"
                        placeholder="correo@ejemplo.com"
                      />
                    </label>
                  </div>
                  {mercadoPagoMessage ? (
                    <p
                      className={`rounded-[18px] px-3 py-2 text-xs font-bold ${
                        mercadoPagoStatus === "rejected" ||
                        mercadoPagoStatus === "error"
                          ? "bg-red-50 text-red-700"
                          : mercadoPagoStatus === "approved"
                            ? "bg-green-50 text-green-700"
                            : "bg-[#f6ebdd] text-[#7A5A45]"
                      }`}
                    >
                      {mercadoPagoMessage}
                    </p>
                  ) : null}
                  {mercadoPagoDebug.enabled ? (
                    <div className="rounded-[18px] border border-dashed border-[#E8DCCB] bg-white/70 px-3 py-2 text-[11px] font-medium text-[#7A5A45]">
                      <p className="font-black uppercase tracking-[0.08em]">
                        Debug Mercado Pago
                      </p>
                      <p>
                        Form mounted:{" "}
                        {mercadoPagoDebug.formMounted ? "si" : "no"}
                      </p>
                      <p>Last event: {mercadoPagoDebug.lastEvent || "n/a"}</p>
                      <p>BIN detectado: {mercadoPagoDebug.bin || "n/a"}</p>
                      <p>
                        payment_method_id:{" "}
                        {mercadoPagoDebug.paymentMethodId || "n/a"}
                      </p>
                      <p>issuer_id: {mercadoPagoDebug.issuerId || "n/a"}</p>
                      <p>
                        Token generado:{" "}
                        {mercadoPagoDebug.tokenPresent ? "si" : "no"}
                      </p>
                      <p>Issuer options: {mercadoPagoDebug.issuerOptions}</p>
                      <p>
                        Installments options:{" "}
                        {mercadoPagoDebug.installmentsOptions}
                      </p>
                      <p>
                        Identification options:{" "}
                        {mercadoPagoDebug.identificationOptions}
                      </p>
                      {mercadoPagoDebug.sdkError ? (
                        <p>SDK error: {mercadoPagoDebug.sdkError}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex justify-center pt-2 pb-2">
                    <Image
                      src="/mercadopago-logo.png"
                      alt="Mercado Pago"
                      width={150}
                      height={61}
                      className="h-auto w-[104px] sm:w-[132px]"
                      priority={false}
                    />
                  </div>
                </form>
              ) : null}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-white/10 px-4 py-3 sm:px-5 sm:py-4">
            {selectedPaymentMethod === "mercadopago" ? (
              <Button
                type="submit"
                form="gogi-mp-card-form"
                disabled={
                  !canSubmitOrder ||
                  submittingOrder ||
                  mercadoPagoStatus === "loading" ||
                  mercadoPagoStatus === "processing"
                }
                size="lg"
                className="h-12 w-full bg-[#e98a4a] text-white hover:bg-[#d97836]"
              >
                {submittingOrder || mercadoPagoStatus === "processing"
                  ? "Procesando pago..."
                  : "Pagar ahora"}
              </Button>
            ) : (
              <Button
                onClick={handleConfirmOrder}
                disabled={!canSubmitOrder}
                size="lg"
                className="h-12 w-full"
              >
                {submittingOrder ? "Procesando..." : "Finalizar Pedido"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Transferencia */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="max-sm:max-w-[calc(100vw-1rem)] rounded-[24px] border-white/10 bg-black max-sm:p-4">
          <DialogHeader>
            <DialogTitle>Datos de Transferencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 rounded-[22px] bg-black/60 p-3.5 text-sm sm:rounded-[24px] sm:p-4">
            <p>
              <strong>Banco:</strong> {transferAccount?.bank}
            </p>
            <p>
              <strong>CLABE:</strong> {transferAccount?.clabe}
            </p>
            <p>
              <strong>Titular:</strong> {transferAccount?.holder}
            </p>
            {transferAccount?.accountNumber ? (
              <p>
                <strong>Cuenta:</strong> {transferAccount.accountNumber}
              </p>
            ) : null}
            <p className="pt-2 text-center font-black text-orange-300">
              Total a pagar: {formatMoney(commissionBreakdown.total)}
            </p>
          </div>
          <div className="py-3 sm:py-4">
            <label
              htmlFor="transfer-proof"
              className="mb-2 block text-xs font-bold text-[#f5f5f5]"
            >
              Sube tu comprobante:
            </label>
            <input
              id="transfer-proof"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setTransferError("");
                setTransferReceiptFile(file ?? null);
                setTransferReceiptName(file?.name ?? "");
              }}
            />
            {transferReceiptName ? (
              <p className="mt-2 text-xs text-orange-800">
                Archivo seleccionado: {transferReceiptName}
              </p>
            ) : null}
            {transferError ? (
              <p className="mt-2 text-xs text-red-600">{transferError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={handleTransferOrder}
              disabled={
                submittingOrder || !transferReceiptFile || !canSubmitOrder
              }
              size="lg"
              className="w-full"
            >
              {submittingOrder ? "Subiendo comprobante..." : "Ya transferí"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .payment-modal .mp-field {
          display: flex;
          align-items: center;
          overflow: hidden;
          box-sizing: border-box;
        }

        .payment-modal .mp-field iframe {
          height: 44px !important;
          min-height: 44px !important;
          max-height: 44px !important;
          width: 100% !important;
          border: 0 !important;
          display: block !important;
        }
      `}</style>
    </div>
  );
}
