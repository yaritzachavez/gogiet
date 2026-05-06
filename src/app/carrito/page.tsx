"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import AddressRequiredDialog, {
  type SavedAddress,
} from "@/components/address/AddressRequiredDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import {
  CART_UPDATED_EVENT,
  readStoredCartSnapshot,
  writeStoredCartSnapshot,
} from "@/lib/cart-storage";
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
    id: "transferencia",
    label: "Transferencia",
    description: "Envía tu comprobante antes de la entrega.",
  },
] as const;

type PaymentMethodOption = (typeof PAYMENT_METHOD_OPTIONS)[number]["id"];

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
      })),
    );
  }, []);

  const loadCart = useCallback(async () => {
    const localSnapshot = readStoredCartSnapshot();

    if (!user) {
      const localItems = mapStoredSnapshotToCartItems(localSnapshot);
      setCartId(null);
      setCartItems(localItems);
      return;
    }

    try {
      const token = window.localStorage.getItem("token");
      const res = await fetch(`/api/cart?user_id=${user.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();

      if (
        data.cart &&
        Array.isArray(data.products) &&
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
      console.error("Error cargando carrito:", err);
      const localItems = mapStoredSnapshotToCartItems(localSnapshot);
      setCartId(null);
      setCartItems(localItems);
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
        console.error("No se pudo reparar el carrito:", error);
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
        const data = await response.json();
        if (response.ok && data.success) {
          setShipping(data.shipping);
        }
      } catch (_error) {
        setShipping({
          ...DEFAULT_SHIPPING_STATE,
          message: "Error al calcular envío.",
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
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  };

  const handleRemove = async (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
    if (cartId) {
      const token = window.localStorage.getItem("token");
      await fetch("/api/cart/remove-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cart_id: cartId, product_id: id }),
      });
    }
    syncCartStorage(cartItems.filter((item) => item.id !== id));
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
            console.error("No se pudo limpiar item del carrito:", error);
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
    if (!user) {
      window.alert("Inicia sesión para continuar con tu pedido.");
      return;
    }

    if (!savedAddress) {
      setAddressDialogOpen(true);
      return;
    }
    if (shipping.requiresConfirmation) {
      window.alert("Debemos confirmar el costo de envío para tu zona.");
      return;
    }
    setPaymentDialogOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (selectedPaymentMethod === "transferencia") {
      setPaymentDialogOpen(false);
      setTransferDialogOpen(true);
      return;
    }
    await processOrder("pending");
  };

  const processOrder = async (
    status: string,
    proofUrl = "",
    _proofName = "",
  ) => {
    setSubmittingOrder(true);
    try {
      const token = window.localStorage.getItem("token");
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
          items: cartItems.map((i) => ({
            product_id: i.productId,
            quantity: i.quantity,
            unit_price: getCartItemUnitPrice(i),
            total_price: getCartItemSubtotal(i),
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCartItems([]);
        setCartId(null);
        syncCartStorage([]);
        window.dispatchEvent(new Event(CART_UPDATED_EVENT));
        setTransferDialogOpen(false);
        setPaymentDialogOpen(false);
        setTransferReceiptFile(null);
        setTransferReceiptName("");
        setTransferError("");
        router.push(`/orders/${data.order.id}`);
        return;
      }

      throw new Error(data?.error || "No se pudo crear el pedido");
    } catch (_error) {
      const message =
        _error instanceof Error ? _error.message : "Error al crear el pedido";
      setTransferError(message);
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

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.success || !uploadData.url) {
        throw new Error(uploadData?.error || "No se pudo subir el comprobante");
      }

      await processOrder(
        "payment_review",
        String(uploadData.url),
        transferReceiptFile.name,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo registrar la transferencia";
      setTransferError(message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  // --- Render condicional para vacíos ---
  if (cartItems.length === 0)
    return (
      <div className="p-20 text-center">
        Tu carrito está vacío.{" "}
        <Link href="/shop" className="text-orange-600">
          Ir a la tienda
        </Link>
      </div>
    );

  return (
    <div className="min-h-screen bg-white/80 text-orange-950">
      <div className="container mx-auto grid gap-8 px-4 py-12 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <h1 className="text-3xl font-semibold">Tu pedido</h1>
          {cartItems.map((item) => (
            <div
              key={item.id}
              className="flex gap-4 bg-white p-4 rounded-3xl border border-orange-100"
            >
              <div className="relative h-24 w-24 overflow-hidden rounded-xl">
                <Image
                  src={item.image}
                  fill
                  alt={item.nombre}
                  className="object-cover"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-bold">{item.nombre}</h3>
                <p className="text-sm text-orange-800/60">{item.negocio}</p>
                {item.description ? (
                  <p className="mt-1 text-xs text-orange-900/55">
                    {item.description}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-4">
                  <div className="flex items-center gap-2 border rounded-full px-2">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.id, -1)}
                    >
                      −
                    </button>
                    <span className="font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.id, 1)}
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-orange-900/70">
                    MX${getCartItemUnitPrice(item).toFixed(2)} c/u
                  </span>
                  <span className="font-bold">
                    MX${getCartItemSubtotal(item).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}

          <textarea
            value={deliveryInstructions}
            onChange={(e) => setDeliveryInstructions(e.target.value)}
            placeholder="Instrucciones para el repartidor..."
            className="w-full p-4 rounded-2xl border border-orange-200"
            rows={3}
          />
        </section>

        <aside className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm">
            <h2 className="text-xl font-bold mb-4">Resumen</h2>
            {hasOnlyZeroPriceItems ? (
              <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-sm font-semibold text-orange-900">
                  Detectamos productos viejos sin precio en tu carrito.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearCart}
                  className="mt-3 border-orange-300 text-orange-700"
                >
                  Vaciar carrito
                </Button>
              </div>
            ) : null}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>MX${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Servicio</span>
                <span>MX${commissionBreakdown.serviceFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Envío</span>
                <span>
                  {commissionBreakdown.deliveryFee > 0
                    ? `MX$${commissionBreakdown.deliveryFee.toFixed(2)}`
                    : "Gratis"}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total</span>
                <span>MX${commissionBreakdown.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-6 p-4 bg-orange-50 rounded-2xl">
              <p className="text-xs font-bold uppercase text-orange-800">
                Entrega en:
              </p>
              <p className="text-sm">
                {savedAddress?.fullAddress || "Sin dirección"}
              </p>
              <Button
                variant="link"
                onClick={() => setAddressDialogOpen(true)}
                className="p-0 h-auto text-orange-600"
              >
                Cambiar
              </Button>
            </div>

            <Button
              onClick={handleCheckout}
              className="w-full mt-6 bg-orange-600 hover:bg-orange-700 h-12 rounded-2xl"
            >
              Continuar al pago
            </Button>
          </div>
        </aside>
      </div>

      {/* Diálogos */}
      <AddressRequiredDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        onSaved={setSavedAddress}
      />

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Método de pago</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => setSelectedPaymentMethod(opt.id)}
                className={`p-4 text-left border rounded-2xl transition ${selectedPaymentMethod === opt.id ? "border-orange-500 bg-orange-50" : ""}`}
              >
                <p className="font-bold">{opt.label}</p>
                <p className="text-xs opacity-70">{opt.description}</p>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={handleConfirmOrder}
              disabled={submittingOrder}
              className="w-full bg-orange-600"
            >
              {submittingOrder ? "Procesando..." : "Finalizar Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Transferencia */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Datos de Transferencia</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-slate-50 rounded-2xl text-sm space-y-1">
            <p>
              <strong>Banco:</strong> {TRANSFER_ACCOUNT.bank}
            </p>
            <p>
              <strong>CLABE:</strong> {TRANSFER_ACCOUNT.clabe}
            </p>
            <p>
              <strong>Titular:</strong> {TRANSFER_ACCOUNT.holder}
            </p>
            <p className="pt-2 text-orange-700 font-bold text-center">
              Total a pagar: MX${commissionBreakdown.total.toFixed(2)}
            </p>
          </div>
          <div className="py-4">
            <label
              htmlFor="transfer-proof"
              className="text-xs font-bold mb-2 block"
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
              disabled={submittingOrder}
              className="w-full bg-orange-600"
            >
              {submittingOrder ? "Subiendo comprobante..." : "Ya transferí"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
