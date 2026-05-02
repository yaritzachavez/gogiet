import { MapPin, Navigation, Package, PhoneCall } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DeliveryOrder } from "./types";

interface CurrentDeliveriesCardProps {
  orders: DeliveryOrder[];
  activeDeliveriesCount?: number;
  isLoading?: boolean;
  error?: string;
  actionLoadingOrderId?: string | null;
  onAcceptOrder?: (orderId: string) => void;
  onRejectOrder?: (orderId: string) => void;
  onMarkDelivered?: (orderId: string) => void;
}

const amountFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

function normalizeStatus(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function getVisualStatus(order: DeliveryOrder) {
  const normalized = normalizeStatus(order.assignmentStatus || order.status);

  if (
    normalized === "pedido_entregado" ||
    normalized === "entregado" ||
    normalized === "completado"
  ) {
    return {
      cardClass: "border-green-400 bg-green-50 shadow-green-100/80",
      badgeClass: "bg-green-100 text-green-700 border border-green-300",
      label: "PEDIDO ENTREGADO",
    };
  }

  if (normalized === "pendiente" || normalized === "pendiente_aceptacion") {
    return {
      cardClass: "border-yellow-300 bg-yellow-50 shadow-yellow-100/70",
      badgeClass: "bg-yellow-100 text-yellow-700 border border-yellow-300",
      label: "PENDIENTE",
    };
  }

  if (normalized === "listo_para_recoger") {
    return {
      cardClass: "border-red-300 bg-red-50 shadow-red-100/70",
      badgeClass: "bg-red-100 text-red-600 border border-red-200",
      label: "LISTO PARA RECOGER",
    };
  }

  return {
    cardClass: "border-slate-200 bg-white shadow-slate-200/70",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    label: String(order.status).replaceAll("_", " ").toUpperCase(),
  };
}

export function CurrentDeliveriesCard({
  orders,
  activeDeliveriesCount,
  isLoading = false,
  error,
  actionLoadingOrderId = null,
  onAcceptOrder,
  onRejectOrder,
  onMarkDelivered,
}: CurrentDeliveriesCardProps) {
  const deliveriesCount = activeDeliveriesCount ?? orders.length;

  return (
    <Card className="overflow-hidden rounded-[24px] border border-slate-200 bg-white text-[#17231d] shadow-xl shadow-slate-900/5">
      <CardHeader className="border-b border-orange-200 bg-orange-50/80 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-xl font-extrabold text-orange-900">
                Entregas actuales
              </CardTitle>
              <CardDescription className="text-sm text-orange-800/75">
                Pedidos asignados hoy y próximos pasos de ruta.
              </CardDescription>
            </div>
          </div>
          <div className="rounded-2xl bg-white px-5 py-3 text-center shadow-sm">
            <p className="text-3xl font-extrabold text-orange-600">
              {deliveriesCount}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              entregas
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {isLoading ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Cargando entregas asignadas...
          </p>
        ) : error ? (
          <p className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
            {error}
          </p>
        ) : orders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
            No tienes entregas asignadas en este momento.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-bold text-slate-700">Ruta de hoy</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-9 rounded-full bg-orange-500 px-4 text-xs font-bold text-white hover:bg-orange-600"
                >
                  Pausar 30 min
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 rounded-full bg-slate-100 px-4 text-xs font-bold text-slate-700 hover:bg-slate-200"
                >
                  Ver detalle
                </Button>
              </div>
            </div>
            <ul className="space-y-3">
              {orders.map((order) => {
                const visualStatus = getVisualStatus(order);
                const normalizedAssignmentStatus = normalizeStatus(
                  order.assignmentStatus || order.status,
                );
                const canRejectOrder =
                  order.canReject ?? !order.isAvailableDelivery;
                const googleMapsQuery =
                  order.address.latitude != null &&
                  order.address.longitude != null
                    ? `${order.address.latitude},${order.address.longitude}`
                    : order.fullAddress ||
                      order.address.fullAddress ||
                      [
                        order.address.street,
                        order.address.neighborhood,
                        order.address.city,
                      ]
                        .filter(Boolean)
                        .join(", ");
                const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  googleMapsQuery,
                )}`;
                const phoneHref = `tel:${order.contact.phone.replace(/\s+/g, "")}`;

                return (
                  <li
                    key={order.id}
                    className={cn(
                      "rounded-[22px] border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5",
                      visualStatus.cardClass,
                    )}
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="text-sm font-bold text-slate-700">
                          #{order.id}
                        </span>
                        <h3 className="mt-2 text-lg font-semibold text-slate-950">
                          {order.businessName || "Negocio"}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {order.contact.name}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em]",
                          visualStatus.badgeClass,
                        )}
                      >
                        {visualStatus.label}
                      </Badge>
                    </div>

                    <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-[1.2fr,0.8fr,0.8fr]">
                      <div className="rounded-xl bg-white/70 p-3 shadow-inner">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                          Direccion
                        </p>
                        <p className="mt-2 flex items-start gap-2 font-medium text-slate-700">
                          <MapPin className="mt-0.5 h-4 w-4 flex-none text-orange-500" />
                          <span>
                            {order.address.street}
                            <br />
                            <span className="text-slate-500">
                              {order.address.neighborhood}, {order.address.city}
                            </span>
                          </span>
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3 shadow-inner">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                          Hora
                        </p>
                        <p className="mt-2 font-semibold text-slate-800">
                          {order.eta}
                        </p>
                        <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                          Telefono
                        </p>
                        <p className="mt-2 font-semibold text-slate-800">
                          {order.contact.phone || "Sin telefono"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3 shadow-inner">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                          Total
                        </p>
                        <p className="mt-2 text-xl font-bold text-slate-950">
                          {amountFormatter.format(order.amount)}
                        </p>
                        <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                          Pago
                        </p>
                        <p className="mt-2 font-semibold text-slate-800">
                          {order.paymentMethod}
                        </p>
                      </div>
                    </div>

                    {order.notes ? (
                      <div className="mt-3 rounded-xl bg-white/60 p-3 text-sm text-slate-600 shadow-inner">
                        {order.notes}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
                      {order.canRespond ? (
                        <>
                          <Button
                            type="button"
                            className="h-10 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700"
                            onClick={() => onAcceptOrder?.(order.id)}
                            disabled={actionLoadingOrderId === order.id}
                          >
                            {order.isAvailableDelivery
                              ? "Aceptar pedido"
                              : "Aceptar entrega"}
                          </Button>
                          {canRejectOrder ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-10 rounded-lg bg-rose-50 px-4 text-xs font-bold text-rose-700 hover:bg-rose-100"
                              onClick={() => onRejectOrder?.(order.id)}
                              disabled={actionLoadingOrderId === order.id}
                            >
                              Rechazar
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                      <Button
                        type="button"
                        className="h-10 rounded-lg bg-green-500 px-4 text-xs font-bold text-white hover:bg-green-600"
                        asChild
                      >
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Navegar
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 rounded-lg bg-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-300"
                        asChild
                      >
                        <a href={phoneHref}>
                          <PhoneCall className="h-3.5 w-3.5" />
                          Llamar
                        </a>
                      </Button>
                      {!order.canRespond &&
                      normalizedAssignmentStatus !== "pedido_entregado" &&
                      normalizedAssignmentStatus !== "completado" &&
                      normalizedAssignmentStatus !== "entregado" ? (
                        <Button
                          type="button"
                          className="h-10 rounded-lg bg-orange-500 px-4 text-xs font-bold text-white hover:bg-orange-600"
                          onClick={() => onMarkDelivered?.(order.id)}
                          disabled={actionLoadingOrderId === order.id}
                        >
                          Pedido entregado
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        className="ml-auto h-10 rounded-lg bg-white/80 px-4 text-xs font-bold text-slate-700 hover:bg-white"
                      >
                        Ver resumen
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
