"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    <main className="min-h-[70vh] bg-white/90 px-4 py-12 text-orange-950">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Mis pedidos</h1>
          <p className="text-sm text-orange-900/70">
            Revisa el estado y el detalle de tus pedidos recientes.
          </p>
        </header>

        {errorMessage ? (
          <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-orange-900/75">{errorMessage}</p>
          </div>
        ) : null}

        {!errorMessage && orders.length === 0 ? (
          <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-orange-900/75">Aún no tienes pedidos</p>
            <Link
              href="/shop"
              className="mt-4 inline-flex rounded-2xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
            >
              Ir a comprar
            </Link>
          </div>
        ) : null}

        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm"
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
                {order.status}
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
          </article>
        ))}
      </div>
    </main>
  );
}
