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
  onMarkPickedUp?: (orderId: string) => void;
  onMarkOnTheWay?: (orderId: string) => void;
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
      cardClass: "border-[#d9c3a6] bg-[#fff8ef] shadow-[#ead8c2]/70",
      badgeClass: "border border-[#d8c1a2] bg-[#f7ebdc] text-[#7d5633]",
      label: "PEDIDO ENTREGADO",
    };
  }

  if (normalized === "pendiente" || normalized === "pendiente_aceptacion") {
    return {
      cardClass: "border-[#e5cfb3] bg-[#fff8ef] shadow-[#ead8c2]/70",
      badgeClass: "border border-[#e2c49e] bg-[#fbefdf] text-[#9b6430]",
      label: "PENDIENTE",
    };
  }

  if (normalized === "listo_para_recoger") {
    return {
      cardClass: "border-[#e5c5b0] bg-[#fff5ee] shadow-[#ecd4c6]/70",
      badgeClass: "border border-[#e9c7ae] bg-[#fae6d8] text-[#a35b2b]",
      label: "LISTO PARA RECOGER",
    };
  }

  return {
    cardClass: "border-[#dfd0bf] bg-[#fffaf3] shadow-[#e8d8c9]/70",
    badgeClass: "border border-[#e2d3c3] bg-[#f6eee4] text-[#6d5945]",
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
  onMarkPickedUp,
  onMarkOnTheWay,
  onMarkDelivered,
}: CurrentDeliveriesCardProps) {
  const deliveriesCount = activeDeliveriesCount ?? orders.length;

  return (
    <Card
      className="gap-0 overflow-hidden rounded-[24px] border border-[#E7D8C7] !bg-[#FFF9F2] py-0 text-[#4B3425] shadow-[0_8px_30px_rgba(180,140,90,0.08)]"
      style={{ background: "#FFF9F2", gap: 0, paddingBlock: 0 }}
    >
      <CardHeader className="border-b border-[#D8C2AA]/70 bg-[#FFF9F2] pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3E6D7] text-[#c56f2d]">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-xl font-extrabold text-[#3B2D25]">
                Entregas actuales
              </CardTitle>
              <CardDescription className="text-sm text-[#6F5D4C]">
                Entregas reales asignadas, disponibles y listas para operar.
              </CardDescription>
            </div>
          </div>
          <div className="rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] px-4 py-3 text-center shadow-[0_8px_30px_rgba(180,140,90,0.08)] sm:px-5">
            <p className="text-3xl font-extrabold text-[#c56f2d]">
              {deliveriesCount}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8d755b]">
              entregas
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 bg-[#F6F0E7] p-4 sm:p-5">
        {isLoading ? (
          <p className="rounded-2xl border border-dashed border-[#E7D8C7] bg-[#FFF9F2] p-6 text-center text-sm text-[#6d5945] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            Cargando entregas...
          </p>
        ) : error ? (
          <p className="rounded-2xl border border-dashed border-[#EDCDB4] bg-[#FFF3E9] p-6 text-center text-sm text-[#9a5b36] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            {error}
          </p>
        ) : orders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#E7D8C7] bg-[#FFF9F2] p-6 text-center text-sm text-[#6d5945] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            No tienes entregas asignadas por ahora.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] px-4 py-3">
              <p className="text-sm font-bold text-[#3d3025]">
                Límite operativo del repartidor
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9b6430]">
                {deliveriesCount}/5 activas
              </p>
            </div>
            <ul className="space-y-3">
              {orders.map((order) => {
                const visualStatus = getVisualStatus(order);
                const normalizedAssignmentStatus = normalizeStatus(
                  order.assignmentStatus || order.status,
                );
                const canRejectOrder =
                  order.canReject ?? !order.isAvailableDelivery;
                const canMarkPickedUp =
                  !order.canRespond &&
                  (normalizedAssignmentStatus === "aceptado" ||
                    normalizedAssignmentStatus === "driver_assigned" ||
                    normalizedAssignmentStatus === "repartidor_asignado");
                const canMarkOnTheWay =
                  !order.canRespond &&
                  normalizedAssignmentStatus === "recogido";
                const canMarkDelivered =
                  !order.canRespond &&
                  (normalizedAssignmentStatus === "en_camino" ||
                    normalizedAssignmentStatus === "on_the_way");
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
                      "rounded-[22px] border p-4 shadow-[0_8px_30px_rgba(180,140,90,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(180,140,90,0.16)] sm:p-5",
                      visualStatus.cardClass,
                    )}
                  >
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                      <div>
                        <span className="text-sm font-bold text-[#6d5945]">
                          #{order.id}
                        </span>
                        <h3 className="mt-2 text-lg font-semibold text-[#3B2D25]">
                          {order.businessName || "Negocio"}
                        </h3>
                        <p className="mt-1 text-sm text-[#6F5D4C]">
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

                    <div className="grid gap-3 text-sm text-[#6F5D4C] md:grid-cols-2 xl:grid-cols-[1.2fr,0.8fr,0.8fr]">
                      <div className="rounded-xl border border-[#E7D8C7] bg-[#FFF9F2] p-3 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8d755b]">
                          Entrega
                        </p>
                        <p className="mt-2 flex items-start gap-2 font-medium text-[#4c3c2f]">
                          <MapPin className="mt-0.5 h-4 w-4 flex-none text-[#c56f2d]" />
                          <span>
                            {order.address.street}
                            <br />
                            <span className="text-[#7b6a58]">
                              {order.address.neighborhood}, {order.address.city}
                            </span>
                          </span>
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#E7D8C7] bg-[#FFF9F2] p-3 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8d755b]">
                          Cliente
                        </p>
                        <p className="mt-2 font-semibold text-[#4c3c2f]">
                          {order.contact.name}
                        </p>
                        <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8d755b]">
                          Telefono
                        </p>
                        <p className="mt-2 font-semibold text-[#4c3c2f]">
                          {order.contact.phone || "Sin telefono"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#E7D8C7] bg-[#FFF9F2] p-3 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8d755b]">
                          Total
                        </p>
                        <p className="mt-2 text-xl font-bold text-[#2f2419]">
                          {amountFormatter.format(order.amount)}
                        </p>
                        <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8d755b]">
                          Envío
                        </p>
                        <p className="mt-2 font-semibold text-[#4c3c2f]">
                          {amountFormatter.format(order.shippingFee ?? 0)}
                        </p>
                      </div>
                    </div>

                    {order.notes ? (
                      <div className="mt-3 rounded-xl border border-[#E7D8C7] bg-[#FFF9F2] p-3 text-sm text-[#6d5945] shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
                        {order.notes}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#D8C2AA]/70 pt-3">
                      {order.canRespond ? (
                        <>
                          <Button
                            type="button"
                            className="h-10 rounded-lg bg-[#2f7a48] px-4 text-xs font-bold text-[#FFFDF8] hover:bg-[#28673c]"
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
                        className="h-10 rounded-lg bg-[#3F8F5B] px-4 text-xs font-bold text-[#FFFDF8] hover:bg-[#2f7a48]"
                        asChild
                      >
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Ver ruta
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 rounded-lg bg-[#F3E6D7] px-4 text-xs font-bold text-[#5d4b3a] hover:bg-[#eadac9]"
                        asChild
                      >
                        <a href={phoneHref}>
                          <PhoneCall className="h-3.5 w-3.5" />
                          Llamar
                        </a>
                      </Button>
                      {canMarkPickedUp ? (
                        <Button
                          type="button"
                          className="h-10 rounded-lg bg-[#FF6A00] px-4 text-xs font-bold text-[#FFFDF8] hover:bg-[#EA580C]"
                          onClick={() => onMarkPickedUp?.(order.id)}
                          disabled={actionLoadingOrderId === order.id}
                        >
                          Pedido recogido
                        </Button>
                      ) : null}
                      {canMarkOnTheWay ? (
                        <Button
                          type="button"
                          className="h-10 rounded-lg bg-[#F97316] px-4 text-xs font-bold text-[#FFFDF8] hover:bg-[#EA580C]"
                          onClick={() => onMarkOnTheWay?.(order.id)}
                          disabled={actionLoadingOrderId === order.id}
                        >
                          En camino
                        </Button>
                      ) : null}
                      {canMarkDelivered ? (
                        <Button
                          type="button"
                          className="h-10 rounded-lg bg-[#FF6A00] px-4 text-xs font-bold text-[#FFFDF8] hover:bg-[#EA580C]"
                          onClick={() => onMarkDelivered?.(order.id)}
                          disabled={actionLoadingOrderId === order.id}
                        >
                          Pedido entregado
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        className="ml-auto h-10 rounded-lg border border-[#E8DCCB] bg-[#FFFDF9] px-4 text-xs font-bold text-[#5d4b3a] hover:bg-white"
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
