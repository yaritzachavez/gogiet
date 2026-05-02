"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useState, useMemo } from "react";

import AddressRequiredDialog, {
  type SavedAddress,
} from "@/components/address/AddressRequiredDialog";
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
import { useAuth } from "@/context/AuthContext";
import type { ShippingByAddressResult } from "@/lib/shipping";

// --- Tipos y Constantes ---
type StoredCartItem = {
  id: string;
  productId?: number;
  nombre: string;
  negocio: string;
  image: string;
  extras: string[];
  tags?: string[];
  quantity: number;
  unitPrice?: number;
  price?: number;
  notes?: string;
  customizations?: {
    selectedOptions?: Array<{
      groupName?: string;
      optionName?: string;
      extraPrice?: number;
    }>;
  };
};

const SERVICE_FEE = 12;
const TERMINAL_FEE_RATE = 0.035;
const CART_STORAGE_KEY = "gogi:cart";
const CART_UPDATED_EVENT = "gogi-cart-updated";

const DEFAULT_SHIPPING_STATE: ShippingByAddressResult = {
  zoneName: null,
  shippingCost: null,
  requiresConfirmation: true,
  message: "Agrega tu dirección para calcular el costo de envío.",
  distanceKm: null,
};

const PAYMENT_METHOD_OPTIONS = [
  { id: "efectivo", label: "Efectivo al recibir", description: "Paga en efectivo al llegar." },
  { id: "transferencia", label: "Transferencia", description: "Envía tu comprobante antes de la entrega." },
  { id: "terminal", label: "Terminal al recibir", description: "Pago con tarjeta (aplica comisión)." },
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

  const mapToSavedAddress = (address: any): SavedAddress => {
    const a = address ?? {};
    return {
      id: a.id,
      placeType: a.placeType ?? "",
      placeName: a.placeName ?? "",
      street: a.street ?? "",
      externalNumber: a.externalNumber ?? "",
      internalNumber: a.internalNumber ?? "",
      fullAddress: a.fullAddress ?? `${a.street ?? ""} ${a.externalNumber ?? ""}`.trim(),
      neighborhood: a.neighborhood ?? "",
      city: a.city ?? "",
      state: a.state ?? "",
      references: a.references ?? a.reference ?? "",
      deliveryInstructions: a.deliveryInstructions ?? "",
      phone: a.phone ?? "",
    };
  };

  // --- Estados ---
  const [cartItems, setCartItems] = useState<StoredCartItem[]>([]);
  const [cartId, setCartId] = useState<number | null>(null);
  const [savedAddress, setSavedAddress] = useState<SavedAddress | null>(() => {
    if (!user?.address) return null;
    return mapToSavedAddress(user.address);
  });
  const [shipping, setShipping] = useState<ShippingByAddressResult>(DEFAULT_SHIPPING_STATE);
  
  // UI States
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethodOption>("efectivo");
  const [transferReceiptName, setTransferReceiptName] = useState("");
  const [transferReceiptUrl, setTransferReceiptUrl] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // --- Efectos: Carga de Carrito y Dirección ---
  useEffect(() => {
    if (!user) return;
    const loadCart = async () => {
      try {
        const res = await fetch(`/api/cart?user_id=${user.id}`);
        const data = await res.json();
        if (data.cart) {
          setCartId(data.cart.id);
          setCartItems(data.products.map((p: any) => ({
            id: p.product_id.toString(),
            productId: p.product_id,
            nombre: p.name,
            image: p.thumbnail_url,
            negocio: "Tienda Local",
            quantity: p.quantity,
            unitPrice: p.price,
            price: p.total,
            extras: [],
          })));
        }
      } catch (err) {
        console.error("Error cargando carrito:", err);
      }
    };
    loadCart();
    setSavedAddress(user.address ? mapToSavedAddress(user.address) : null);
  }, [user]);

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
          body: JSON.stringify({ address: savedAddress.fullAddress, neighborhood: savedAddress.neighborhood }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
          setShipping(data.shipping);
        }
      } catch (error) {
        setShipping({ ...DEFAULT_SHIPPING_STATE, message: "Error al calcular envío." });
      }
    };
    loadShipping();
  }, [savedAddress]);

  // --- Cálculos ---
  const subtotal = useMemo(() => 
    cartItems.reduce((acc, item) => acc + (item.unitPrice || 0) * item.quantity, 0)
  , [cartItems]);

  const deliveryFee = shipping.shippingCost ?? 0;
  const terminalFee = selectedPaymentMethod === "terminal" ? Number((subtotal * TERMINAL_FEE_RATE).toFixed(2)) : 0;
  const total = subtotal + terminalFee + SERVICE_FEE + deliveryFee;

  // --- Handlers ---
  const handleQuantityChange = async (id: string, delta: number) => {
    const item = cartItems.find((i) => i.id === id);
    if (!item || !cartId) return;
    const newQty = Math.max(0, item.quantity + delta);
    if (newQty === 0) return handleRemove(id);

    setCartItems(prev => prev.map(i => i.id === id ? { ...i, quantity: newQty } : i));
    await fetch("/api/cart/add-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart_id: cartId, product_id: id, quantity: newQty, discount: 0 })
    });
  };

  const handleRemove = async (id: string) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
    if (cartId) {
      await fetch("/api/cart/remove-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart_id: cartId, product_id: id })
      });
    }
  };

  const handleCheckout = () => {
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
    await processOrder("pendiente");
  };

  const processOrder = async (status: string, proofUrl = "", proofName = "") => {
    setSubmittingOrder(true);
    try {
      const token = window.localStorage.getItem("token");
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: user?.id,
          address_id: savedAddress?.id,
          subtotal,
          terminal_fee: terminalFee,
          shipping_cost: deliveryFee,
          service_fee: SERVICE_FEE,
          total,
          payment_method: selectedPaymentMethod,
          status,
          comprobante_pago_url: proofUrl || null,
          items: cartItems.map(i => ({
            product_id: i.productId,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            total_price: (i.unitPrice || 0) * i.quantity
          }))
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCartItems([]);
        router.push(`/pedidos/${data.order.id}`);
      }
    } catch (error) {
      alert("Error al crear el pedido");
    } finally {
      setSubmittingOrder(false);
    }
  };

  // --- Render condicional para vacíos ---
  if (!user) return <div className="p-20 text-center">Inicia sesión para ver tu carrito.</div>;
  if (cartItems.length === 0) return <div className="p-20 text-center">Tu carrito está vacío. <Link href="/shop" className="text-orange-600">Ir a la tienda</Link></div>;

  return (
    <div className="min-h-screen bg-white/80 text-orange-950">
      <div className="container mx-auto grid gap-8 px-4 py-12 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <h1 className="text-3xl font-semibold">Tu pedido</h1>
          {cartItems.map((item) => (
            <div key={item.id} className="flex gap-4 bg-white p-4 rounded-3xl border border-orange-100">
              <div className="relative h-24 w-24 overflow-hidden rounded-xl">
                <Image src={item.image} fill alt={item.nombre} className="object-cover" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold">{item.nombre}</h3>
                <p className="text-sm text-orange-800/60">{item.negocio}</p>
                <div className="mt-2 flex items-center gap-4">
                  <div className="flex items-center gap-2 border rounded-full px-2">
                    <button onClick={() => handleQuantityChange(item.id, -1)}>−</button>
                    <span className="font-bold">{item.quantity}</span>
                    <button onClick={() => handleQuantityChange(item.id, 1)}>+</button>
                  </div>
                  <span className="font-bold">MX${((item.unitPrice || 0) * item.quantity).toFixed(2)}</span>
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
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>MX${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Envío</span><span>{deliveryFee > 0 ? `MX$${deliveryFee}` : "Gratis"}</span></div>
              <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>MX${total.toFixed(2)}</span></div>
            </div>
            
            <div className="mt-6 p-4 bg-orange-50 rounded-2xl">
              <p className="text-xs font-bold uppercase text-orange-800">Entrega en:</p>
              <p className="text-sm">{savedAddress?.fullAddress || "Sin dirección"}</p>
              <Button variant="link" onClick={() => setAddressDialogOpen(true)} className="p-0 h-auto text-orange-600">Cambiar</Button>
            </div>

            <Button onClick={handleCheckout} className="w-full mt-6 bg-orange-600 hover:bg-orange-700 h-12 rounded-2xl">
              Continuar al pago
            </Button>
          </div>
        </aside>
      </div>

      {/* Diálogos */}
      <AddressRequiredDialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen} onSaved={setSavedAddress} />
      
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Método de pago</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {PAYMENT_METHOD_OPTIONS.map(opt => (
              <button 
                key={opt.id} 
                onClick={() => setSelectedPaymentMethod(opt.id)}
                className={`p-4 text-left border rounded-2xl transition ${selectedPaymentMethod === opt.id ? 'border-orange-500 bg-orange-50' : ''}`}
              >
                <p className="font-bold">{opt.label}</p>
                <p className="text-xs opacity-70">{opt.description}</p>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={handleConfirmOrder} disabled={submittingOrder} className="w-full bg-orange-600">
              {submittingOrder ? "Procesando..." : "Finalizar Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de Transferencia */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Datos de Transferencia</DialogTitle></DialogHeader>
          <div className="p-4 bg-slate-50 rounded-2xl text-sm space-y-1">
            <p><strong>Banco:</strong> {TRANSFER_ACCOUNT.bank}</p>
            <p><strong>CLABE:</strong> {TRANSFER_ACCOUNT.clabe}</p>
            <p><strong>Titular:</strong> {TRANSFER_ACCOUNT.holder}</p>
            <p className="pt-2 text-orange-700 font-bold text-center">Total a pagar: MX${total.toFixed(2)}</p>
          </div>
          <div className="py-4">
             <label className="text-xs font-bold mb-2 block">Sube tu comprobante:</label>
             <input type="file" accept="image/*" onChange={(e) => {
               const file = e.target.files?.[0];
               if(file) setTransferReceiptName(file.name);
             }} />
          </div>
          <DialogFooter>
            <Button onClick={() => processOrder("por_validar_pago")} className="w-full bg-orange-600">Ya transferí</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}