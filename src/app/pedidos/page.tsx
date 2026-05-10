"use client";

import { PackageSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { getOrderStatusLabel } from "@/lib/order-status";

type OrderProduct = {
  id: number;
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes: string;
};

type UserOrder = {
  id: number;
  status: string;
  total: number;
  subtotal: number;
  terminalFee: number;
  shippingCost: number;
  serviceFee: number;
  paymentMethod: string;
  createdAt: string;
  address: {
    id: number;
    fullAddress: string;
  };
  products: OrderProduct[];
};

export default function PedidosPage() {
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadOrders = async () => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        setErrorMessage("Debes iniciar sesión para ver tus pedidos.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/orders", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data?.error || "No pudimos cargar tus pedidos.");
        }

        setOrders(
          Array.isArray(data.orders) ? (data.orders as UserOrder[]) : [],
        );
      } catch (error) {
        console.error(error);
        setErrorMessage("No pudimos cargar tus pedidos.");
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  if (loading) {
    return (
      <main className="min-h-[70vh] bg-white/90 px-4 py-12 text-orange-950">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-orange-900/70">Cargando pedidos...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[70vh] bg-[#f6f7fb] px-4 py-8 text-orange-950 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          eyebrow="Historial"
          title="Mis pedidos"
          description="Revisa el estado, montos y detalles de tus compras recientes."
        />

        {errorMessage ? (
          <SectionCard className="p-6">
            <p className="text-sm text-orange-900/75">{errorMessage}</p>
          </SectionCard>
        ) : null}

        {!errorMessage && orders.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="Aún no tienes pedidos"
            description="Cuando hagas tu primer pedido, aquí podrás seguirlo y revisar tus compras recientes."
            actionLabel="Ir a comprar"
            onAction={() => {
              window.location.href = "/shop";
            }}
          />
        ) : null}

        {orders.map((order) => (
          <SectionCard
            key={order.id}
            className="p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-orange-950">
                  Pedido #{order.id}
                </h2>
                <p className="mt-1 text-sm text-orange-900/70">
                  {new Date(order.createdAt).toLocaleString("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                {getOrderStatusLabel(order.status)}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Resumen
                </p>
                <p className="mt-3 text-sm text-orange-900">
                  <span className="font-semibold">Total:</span> MX$
                  {order.total.toFixed(2)}
                </p>
                <p className="mt-2 text-sm text-orange-900">
                  <span className="font-semibold">Cargo terminal:</span> MX$
                  {order.terminalFee.toFixed(2)}
                </p>
                <p className="mt-2 text-sm text-orange-900">
                  <span className="font-semibold">Método de pago:</span>{" "}
                  {order.paymentMethod}
                </p>
                <p className="mt-2 text-sm text-orange-900">
                  <span className="font-semibold">Dirección de entrega:</span>{" "}
                  {order.address.fullAddress}
                </p>
              </div>

              <div className="rounded-2xl border border-orange-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Productos
                </p>
                <div className="mt-3 space-y-3">
                  {order.products.map((product, index) => (
                    <div
                      key={`order-${order.id}-item-${product.id ?? index}-${index}`}
                      className="rounded-2xl border border-orange-100 bg-orange-50/40 p-3"
                    >
                      <p className="text-sm font-semibold text-orange-950">
                        {product.name}
                      </p>
                      <p className="mt-1 text-sm text-orange-900/75">
                        Cantidad: {product.quantity} · MX$
                        {product.totalPrice.toFixed(2)}
                      </p>
                      {product.notes ? (
                        <p className="mt-1 text-xs text-orange-900/65">
                          {product.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </main>
  );
}
