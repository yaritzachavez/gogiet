"use client";

import {
  Copy,
  ExternalLink,
  MapPin,
  NotebookPen,
  PhoneCall,
} from "lucide-react";
import { useCallback, useState } from "react";
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

interface LocationCardProps {
  order: DeliveryOrder;
}

export function LocationCard({ order }: LocationCardProps) {
  const [copiedField, setCopiedField] = useState<
    "address" | "references" | null
  >(null);

  const locationText =
    order.fullAddress ||
    order.address.fullAddress ||
    [order.address.street, order.address.neighborhood, order.address.city]
      .filter(Boolean)
      .join(", ");
  const referencesText = order.address.references;
  const phoneSanitized = order.contact.phone.replace(/\s+/g, "");

  const handleCopy = useCallback(
    async (value: string, key: "address" | "references") => {
      try {
        await navigator.clipboard.writeText(value);
        setCopiedField(key);
        setTimeout(() => setCopiedField(null), 2000);
      } catch (error) {
        console.error("No se pudo copiar el texto", error);
      }
    },
    [],
  );

  const googleMapsQuery =
    order.address.latitude != null && order.address.longitude != null
      ? `${order.address.latitude},${order.address.longitude}`
      : locationText;

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    googleMapsQuery,
  )}`;

  return (
    <Card className="overflow-hidden rounded-[24px] border border-[#E8DCCB] bg-[#FFF9F2] text-[#3B2D25] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <CardHeader className="border-b border-[#E8DCCB] bg-[#FFF9F2] pb-5 text-[#3B2D25]">
        <div className="flex items-start gap-3">
          <span className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3E6D7] text-[#c56f2d]">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-xl font-extrabold">
              Ubicación y referencias
            </CardTitle>
            <CardDescription className="text-sm text-[#6f5d4c]">
              Usa las acciones rápidas para navegar y contactar al cliente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 bg-[#F7F1E8] p-5 text-[#5a4a3a]">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[#E8DCCB] bg-[#F8F1E7] p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-[#8d755b]">
              Negocio
            </p>
            <p className="mt-2 text-base font-extrabold text-[#2f2419]">
              {order.businessName || "Negocio"}
            </p>
            <p className="mt-1 text-sm text-[#6f5d4c]">
              {order.businessAddress || "Dirección del negocio no disponible."}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8DCCB] bg-[#F8F1E7] p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-[#8d755b]">
              Cliente
            </p>
            <p className="mt-2 text-base font-extrabold text-[#2f2419]">
              {order.contact.name}
            </p>
            <p className="mt-1 text-sm text-[#6f5d4c]">
              {order.contact.phone || "Sin teléfono"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8DCCB] bg-[#F8F1E7] p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-[#8d755b]">
            Dirección de entrega
          </p>
          <p className="mt-2 text-base font-extrabold text-[#2f2419]">
            {order.address.street}
          </p>
          <p className="mt-1 text-sm text-[#6f5d4c]">
            {[order.address.neighborhood, order.address.city]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.025)]">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8d755b]">
              Zona
            </p>
            <p className="mt-2 font-semibold text-[#2f2419]">
              {order.zoneName || "Sin zona"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.025)]">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8d755b]">
              Costo de envío
            </p>
            <p className="mt-2 font-semibold text-[#2f2419]">
              {new Intl.NumberFormat("es-MX", {
                style: "currency",
                currency: "MXN",
                maximumFractionDigits: 2,
              }).format(order.shippingFee ?? 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.025)]">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8d755b]">
              Total del pedido
            </p>
            <p className="mt-2 font-semibold text-[#2f2419]">
              {new Intl.NumberFormat("es-MX", {
                style: "currency",
                currency: "MXN",
                maximumFractionDigits: 2,
              }).format(order.amount)}
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.025)]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#b36a2b]">
            <NotebookPen className="h-4 w-4" />
            Referencias
          </div>
          <p className="text-sm leading-relaxed text-[#5a4a3a]">
            {order.customerReference ||
              order.address.references ||
              "Sin referencias adicionales."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-[#2f2419]">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              handleCopy(`${locationText}. ${referencesText}`, "address")
            }
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-[0_6px_18px_rgba(0,0,0,0.03)] transition",
              copiedField === "address"
                ? "border-[#d7b089] bg-white text-[#b36a2b] hover:bg-white"
                : "border-[#dfcfbe] bg-[#f7efe3] text-[#5a4a3a] hover:bg-[#f3e6d8]",
            )}
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedField === "address" ? "Copiado" : "Copiar dirección"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleCopy(referencesText, "references")}
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-[0_6px_18px_rgba(0,0,0,0.03)] transition",
              copiedField === "references"
                ? "border-[#d7b089] bg-white text-[#b36a2b] hover:bg-white"
                : "border-[#dfcfbe] bg-[#f7efe3] text-[#5a4a3a] hover:bg-[#f3e6d8]",
            )}
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedField === "references"
              ? "Referencias copiadas"
              : "Copiar referencias"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="rounded-full border border-[#dfcfbe] bg-[#f7efe3] text-xs font-semibold text-[#5a4a3a] hover:bg-[#f3e6d8]"
            asChild
          >
            <a
              href={`tel:${phoneSanitized}`}
              className="flex items-center gap-2"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              Llamar cliente
            </a>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="rounded-full border border-[#dfcfbe] bg-[#f7efe3] text-xs font-semibold text-[#5a4a3a] hover:bg-[#f3e6d8]"
            asChild
          >
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver ruta
            </a>
          </Button>
        </div>

        <div className="rounded-2xl border border-dashed border-[#E8DCCB] bg-[#FCF6EE] p-4 text-xs text-[#6f5d4c] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          Usa esta vista para revisar recogida, dirección de entrega,
          referencias y navegación antes de confirmar el pedido como entregado.
        </div>
      </CardContent>
    </Card>
  );
}
