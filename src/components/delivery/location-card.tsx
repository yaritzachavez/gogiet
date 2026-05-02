"use client";

import {
  Copy,
  ExternalLink,
  MapPin,
  NotebookPen,
  PhoneCall,
} from "lucide-react";
import { useCallback, useState } from "react";
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
    <Card className="overflow-hidden rounded-[24px] border-0 bg-[#006b3f] text-white shadow-2xl shadow-emerald-950/15">
      <CardHeader className="border-b border-white/10 bg-transparent pb-5 text-white">
        <div className="flex items-start gap-3">
          <span className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-emerald-50 shadow-inner">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-xl font-extrabold">
              Ubicación y referencias
            </CardTitle>
            <CardDescription className="text-sm text-white/80">
              Usa las acciones rápidas para navegar y contactar al cliente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5 text-white/90">
        <div className="rounded-2xl bg-white/12 p-4 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">
            Dirección de entrega
          </p>
          <p className="mt-2 text-base font-extrabold text-white">
            {order.address.street}
          </p>
          <p className="mt-1 text-sm text-white/80">
            {[order.address.neighborhood, order.address.city]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>

        <div className="space-y-2 rounded-2xl bg-white/12 p-4 shadow-inner backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-50">
            <NotebookPen className="h-4 w-4" />
            Referencias
          </div>
          <p className="text-sm leading-relaxed text-white/85">
            {order.address.references || "Sin referencias adicionales."}
          </p>
        </div>

        <div className="rounded-2xl bg-white/12 p-4 shadow-lg backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">
            Contacto del cliente
          </p>
          <p className="mt-2 text-sm font-semibold text-white">
            {order.contact.name}
          </p>
          <Badge
            variant="outline"
            className="mt-1 w-fit rounded-full border border-white/40 bg-white/20 text-xs text-white/80 backdrop-blur"
          >
            {order.contact.phone}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-3 text-white">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              handleCopy(`${locationText}. ${referencesText}`, "address")
            }
            className={cn(
              "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-lg transition backdrop-blur",
              copiedField === "address"
                ? "border-white bg-white/80 text-orange-700 hover:bg-white"
                : "border-white/40 bg-white/15 text-white hover:bg-white/30",
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
              "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-lg transition backdrop-blur",
              copiedField === "references"
                ? "border-white bg-white/80 text-orange-700 hover:bg-white"
                : "border-white/40 bg-white/15 text-white hover:bg-white/30",
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
            className="rounded-full border border-white/40 bg-white/20 text-xs font-semibold text-white backdrop-blur hover:bg-white/40"
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
            className="rounded-full border border-white/40 bg-white/20 text-xs font-semibold text-white backdrop-blur hover:bg-white/40"
            asChild
          >
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir en Google Maps
            </a>
          </Button>
        </div>

        <div className="rounded-2xl border border-dashed border-white/20 bg-white/10 p-4 text-xs text-white/80 shadow-inner backdrop-blur">
          Nota: sin mapa en tiempo real. Usa la dirección, referencias y
          acciones rápidas para contactar al cliente.
        </div>
      </CardContent>
    </Card>
  );
}
