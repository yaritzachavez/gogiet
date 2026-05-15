"use client";

import { ArrowRight, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import AddressRequiredDialog, {
  type SavedAddress,
} from "@/components/address/AddressRequiredDialog";
import { AppImage } from "@/components/ui/app-image";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { useAuth } from "@/context/AuthContext";
import {
  CART_UPDATED_EVENT,
  readStoredCartSnapshot,
  writeStoredCartSnapshot,
} from "@/lib/cart-storage";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";
import { calculateOrderCommissionBreakdown } from "@/lib/order-commissions";
import type { ShippingByAddressResult } from "@/lib/shipping";

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
    label: "Tarjeta / Mercado Pago",
    description: "Paga con crédito o débito en Checkout Pro.",
  },
  {
    id: "transferencia",
    label: "Transferencia",
    description: "Envía tu comprobante antes de la entrega.",
  },
] as const;

type PaymentMethodOption = (typeof PAYMENT_METHOD_OPTIONS)[number]["id"];

const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return `${moneyFormatter.format(Number.isFinite(value) ? value : 0)} MXN`;
}

const TRANSFER_ACCOUNT = {
  bank: "BBVA",
  holder: "Gogi Eats",
  clabe: "012345678901234567",
  accountNumber: "0123456789",
};

export default function CarritoPage() {
  const router = useRouter();
  const { user } = useAuth();

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
    setCartLoadError("");

    if (!user) {
      const localItems = mapStoredSnapshotToCartItems(localSnapshot);
      setCartId(null);
      setCartItems(localItems);
      setCartLoading(false);
      return;
    }

    try {
      const token = window.localStorage.getItem("token");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`/api/cart?user_id=${user.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const data = await res.json().catch(() => null);

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
      } else if (data.cart && localSnapshot.length > 0) {
        const localItems = mapStoredSnapshotToCartItems(localSnapshot);
        setCartId(Number(data.cart.id) || null);
        setCartItems(localItems);
      } else if (localSnapshot.length > 0) {
        const localItems = mapStoredSnapshotToCartItems(localSnapshot);
        setCartId(null);
        setCartItems(localItems);
      } else {
        setCartId(null);
        setCartItems([]);
        syncCartStorage([]);
      }
    } catch (err) {
      console.warn("Error cargando carrito:", err);
      const localItems = mapStoredSnapshotToCartItems(localSnapshot);
      setCartId(null);
      setCartItems(localItems);
      setCartLoadError(
        getFriendlyErrorMessage(
          err,
          "No pudimos actualizar tu carrito. Mostramos la última versión guardada.",
        ),
      );
    } finally {
      setCartLoading(false);
    }
  }, [mapStoredSnapshotToCartItems, syncCartStorage, user]);

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
    const loadShipping = async () => {
      if (!savedAddress?.fullAddress) {
        setShipping(DEFAULT_SHIPPING_STATE);
        return;
      }
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
      }
    };
    loadShipping();
  }, [savedAddress]);

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

  const hasValidBusiness = useMemo(
    () => cartItems.some((item) => Number(item.businessId ?? 0) > 0),
    [cartItems],
  );

  const checkoutBlockReason = useMemo(() => {
    if (!user) return "Necesitas iniciar sesión para continuar.";
    if (cartLoading) return "Estamos actualizando tu carrito.";
    if (cartItems.length === 0) return "Tu carrito está vacío.";
    if (!hasValidItems) return "Hay productos sin precio válido en tu carrito.";
    if (!hasValidBusiness) return "No pudimos identificar el negocio del pedido.";
    if (!savedAddress) return "Agrega una dirección para continuar.";
    if (shipping.requiresConfirmation)
      return shipping.message || "No pudimos calcular el envío. Revisa tu dirección.";
    if (commissionBreakdown.total <= 0)
      return "El total del pedido no es válido.";
    return "";
  }, [
    cartItems.length,
    cartLoading,
    commissionBreakdown.total,
    hasValidBusiness,
    hasValidItems,
    savedAddress,
    shipping.message,
    shipping.requiresConfirmation,
    user,
  ]);

  const canContinueToPayment = !checkoutBlockReason && !submittingOrder;
  const canSubmitOrder =
    !checkoutBlockReason &&
    !submittingOrder &&
    Boolean(selectedPaymentMethod);

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

    const token = window.localStorage.getItem("token");
    try {
      await fetch("/api/cart/add-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      const token = window.localStorage.getItem("token");
      try {
        await fetch("/api/cart/remove-product", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("token")
        : null;

    if (cartId) {
      await Promise.all(
        cartItems.map((item) =>
          fetch("/api/cart/remove-product", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      setTransferError(
        checkoutBlockReason ||
          "No pudimos continuar con tu pedido. Revisa tu carrito.",
      );
      return;
    }

    if (!savedAddress) {
      setAddressDialogOpen(true);
      return;
    }

    if (shipping.requiresConfirmation) {
      setTransferError(
        shipping.message || "No pudimos calcular el envío. Revisa tu dirección.",
      );
      return;
    }
    setPaymentDialogOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (!canSubmitOrder) {
      setTransferError(
        checkoutBlockReason || "Revisa la información del pedido para continuar.",
      );
      return;
    }

    if (!selectedPaymentMethod) {
      setTransferError("Selecciona un método de pago.");
      return;
    }

    if (selectedPaymentMethod === "transferencia") {
      setPaymentDialogOpen(false);
      setTransferDialogOpen(true);
      return;
    }

    if (selectedPaymentMethod === "mercadopago") {
      const orderId = await processOrder("pending_payment");

      if (!orderId) return;

      try {
        const token = window.localStorage.getItem("token");

        if (!token) {
          throw new Error("Necesitas iniciar sesión para continuar.");
        }

        const preferenceRes = await fetch(
          "/api/payments/mercadopago/create-preference",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              orderId,
              userId: user?.id,
              total: commissionBreakdown.total,
              items: cartItems.map((item) => ({
                product_id: item.productId,
                quantity: item.quantity,
              })),
            }),
          },
        );

        const preferenceData = await preferenceRes.json().catch(() => null);

        if (!preferenceRes.ok || !preferenceData?.success || !preferenceData?.initPoint) {
          throw new Error(
            formatApiError(
              preferenceRes.status,
              preferenceData,
              "Tu pedido se creó, pero no pudimos abrir Mercado Pago.",
            ),
          );
        }

        window.location.assign(String(preferenceData.initPoint));
        return;
      } catch (error) {
        const message =
          error instanceof Error
            ? getFriendlyErrorMessage(
                error,
                "Tu pedido se creó, pero no pudimos abrir Mercado Pago.",
              )
            : "Tu pedido se creó, pero no pudimos abrir Mercado Pago.";

        router.push(
          `/payments/mercadopago/status?status=failure&orderId=${orderId}&message=${encodeURIComponent(message)}`,
        );
        return;
      }
    }

    const orderId = await processOrder("pending");
    if (orderId) {
      router.push(`/orders/${orderId}`);
    }
  };

  const processOrder = async (
    status: string,
    proofUrl = "",
    _proofName = "",
  ) => {
    if (!canSubmitOrder) {
      setTransferError(
        checkoutBlockReason || "Tu pedido no se pudo completar. Intenta nuevamente.",
      );
      return null;
    }

    setSubmittingOrder(true);
    try {
      const token = window.localStorage.getItem("token");
      if (!token) {
        throw new Error("Necesitas iniciar sesión para continuar.");
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user?.id,
          address_id: savedAddress?.id,
          delivery_address_id: savedAddress?.id,
          cart_id: cartId,
          business_id:
            cartItems.find((item) => Number(item.businessId ?? 0) > 0)
              ?.businessId ?? null,
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
            unit_price: getCartItemUnitPrice(i),
            total_price: getCartItemSubtotal(i),
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.order?.id) {
        const createdOrderId = Number(data.order.id);
        setCartItems([]);
        setCartId(null);
        syncCartStorage([]);
        window.dispatchEvent(new Event(CART_UPDATED_EVENT));
        setTransferDialogOpen(false);
        setPaymentDialogOpen(false);
        setTransferReceiptFile(null);
        setTransferReceiptName("");
        setTransferError("");
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
      return null;
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleTransferOrder = async () => {
    if (!transferReceiptFile) {
      setTransferError("Sube tu comprobante antes de continuar.");
      return;
    }

    setSubmittingOrder(true);
    setTransferError("");

    try {
      const token = window.localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", transferReceiptFile);

      const uploadRes = await fetch("/api/upload/payment-proof", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
      <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          eyebrow="Checkout"
          title="Tu pedido está casi listo"
          description="Revisa tus productos, confirma la dirección y elige cómo quieres pagar."
        />
        {cartLoadError ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{cartLoadError}</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadCart()}
                className="border-amber-300 text-amber-800"
              >
                Reintentar
              </Button>
            </div>
          </div>
        ) : null}
        {transferError ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {transferError}
          </div>
        ) : null}
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <h2 className="text-2xl font-black tracking-tight text-[#f5f5f5]">
            Productos seleccionados
          </h2>
          {cartLoading ? (
            <SectionCard className="p-6">
              <p className="text-sm font-semibold text-[#b3b3b3]">
                Actualizando tu carrito...
              </p>
            </SectionCard>
          ) : null}
          {cartItems.map((item) => (
            <SectionCard
              key={item.id}
              className="flex gap-4 p-4 sm:p-5"
            >
              <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-slate-100">
                <AppImage
                  src={item.image}
                  alt={item.nombre}
                  width={192}
                  height={192}
                  aspectClassName="aspect-square"
                  className="h-full w-full"
                  imageClassName="object-cover"
                  fallbackLabel="Producto"
                />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black tracking-tight text-[#f5f5f5]">
                  {item.nombre}
                </h3>
                <p className="mt-1 text-sm font-semibold text-orange-700/80">
                  {item.negocio}
                </p>
                {item.description ? (
                  <p className="mt-2 text-sm leading-5 text-[#b3b3b3]">
                    {item.description}
                  </p>
                ) : null}
                {item.customizationsSummary || item.notes ? (
                  <div className="mt-3 space-y-1">
                    {item.customizationsSummary ? (
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8f8f8f]">
                        {item.customizationsSummary}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="text-xs font-medium text-[#b3b3b3]">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.id, -1)}
                      className="inline-flex size-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10"
                    >
                      −
                    </button>
                    <span className="min-w-[20px] text-center font-black text-[#f5f5f5]">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.id, 1)}
                      className="inline-flex size-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10"
                    >
                      +
                    </button>
                  </div>
                  <span className="rounded-full bg-orange-500/15 px-3 py-1 text-sm font-bold text-orange-300">
                    {formatMoney(getCartItemUnitPrice(item))} c/u
                  </span>
                  <span className="text-base font-black text-[#f5f5f5]">
                    {formatMoney(getCartItemSubtotal(item))}
                  </span>
                </div>
              </div>
            </SectionCard>
          ))}

          <textarea
            value={deliveryInstructions}
            onChange={(e) => setDeliveryInstructions(e.target.value)}
            placeholder="Instrucciones para el repartidor..."
            className="w-full p-4 text-sm font-medium"
            rows={3}
          />
        </section>

        <aside className="space-y-6">
          <SectionCard className="p-6">
            <h2 className="mb-4 text-xl font-black tracking-tight text-[#f5f5f5]">
              Resumen de compra
            </h2>
            {hasOnlyZeroPriceItems ? (
              <div className="mb-4 rounded-2xl border border-orange-500/30 bg-black/60 p-4">
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
            <div className="space-y-3 text-sm">
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
              <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-black text-[#f5f5f5]">
                <span>Total</span>
                <span>{formatMoney(commissionBreakdown.total)}</span>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] bg-black/60 p-4">
              <p className="text-xs font-bold uppercase text-orange-300">
                Entrega en:
              </p>
              <p className="mt-1 text-sm font-semibold text-[#f5f5f5]">
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
              className="mt-6 w-full"
              disabled={!canContinueToPayment}
            >
              {submittingOrder ? "Procesando..." : "Continuar al pago"}
              <ArrowRight className="h-4 w-4" />
            </Button>
            {checkoutBlockReason ? (
              <p className="mt-3 text-sm font-semibold text-[#b3b3b3]">
                {checkoutBlockReason}
              </p>
            ) : null}
          </SectionCard>
        </aside>
        </div>
      </div>

      {/* Diálogos */}
      <AddressRequiredDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        onSaved={setSavedAddress}
      />

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="rounded-[28px] border-white/10 bg-black">
          <DialogHeader>
            <DialogTitle>Método de pago</DialogTitle>
          </DialogHeader>
          <div className="rounded-[22px] bg-black/60 p-4 text-sm text-white/70">
            <p className="font-semibold text-[#f5f5f5]">
              Resumen antes de confirmar
            </p>
            <p className="mt-2">
              Productos: {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
            </p>
            <p>Subtotal: {formatMoney(subtotal)}</p>
            <p>Envío: {commissionBreakdown.deliveryFee > 0 ? formatMoney(commissionBreakdown.deliveryFee) : "Gratis"}</p>
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
                  ? "Tarjeta / Mercado Pago"
                  : "Efectivo al recibir"}
            </p>
          </div>
          <div className="grid gap-3">
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => setSelectedPaymentMethod(opt.id)}
                className={`rounded-[22px] border p-4 text-left transition ${selectedPaymentMethod === opt.id ? "border-orange-500 bg-orange-500/10 shadow-sm" : "border-white/10 bg-black/70 hover:border-orange-300/40"}`}
              >
                <p className="font-black text-[#f5f5f5]">{opt.label}</p>
                <p className="mt-1 text-sm text-[#b3b3b3]">{opt.description}</p>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={handleConfirmOrder}
              disabled={!canSubmitOrder}
              size="lg"
              className="w-full"
            >
              {submittingOrder ? "Procesando..." : "Finalizar Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Transferencia */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="rounded-[28px] border-white/10 bg-black">
          <DialogHeader>
            <DialogTitle>Datos de Transferencia</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 rounded-[24px] bg-black/60 p-4 text-sm">
            <p>
              <strong>Banco:</strong> {TRANSFER_ACCOUNT.bank}
            </p>
            <p>
              <strong>CLABE:</strong> {TRANSFER_ACCOUNT.clabe}
            </p>
            <p>
              <strong>Titular:</strong> {TRANSFER_ACCOUNT.holder}
            </p>
            <p className="pt-2 text-center font-black text-orange-300">
              Total a pagar: {formatMoney(commissionBreakdown.total)}
            </p>
          </div>
          <div className="py-4">
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
              disabled={submittingOrder || !transferReceiptFile || !canSubmitOrder}
              size="lg"
              className="w-full"
            >
              {submittingOrder ? "Subiendo comprobante..." : "Ya transferí"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
