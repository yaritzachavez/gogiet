import { type NextRequest, NextResponse } from "next/server";

import {
  calculateShippingCost,
  type ShippingByAddressResult,
} from "@/lib/shipping";
import {
  getActiveShippingZones,
  normalizeShippingZoneName,
} from "@/lib/shipping-zones";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const address = String(body?.address ?? "").trim();
    const neighborhood = String(body?.neighborhood ?? "").trim();
    const searchableAddress = [neighborhood, address]
      .filter(Boolean)
      .join(", ");

    if (!searchableAddress) {
      return NextResponse.json({
        success: true,
        shipping: {
          zoneName: null,
          shippingCost: null,
          requiresConfirmation: true,
          message: "Agrega tu dirección para calcular el costo de envío.",
          distanceKm: null,
        } satisfies ShippingByAddressResult,
      });
    }

    const normalizedAddress = normalizeShippingZoneName(searchableAddress);
    const { zones, message } = await getActiveShippingZones();
    const zone =
      zones.find((candidate) =>
        normalizedAddress.includes(normalizeShippingZoneName(candidate.nombre)),
      ) ?? null;

    if (!zone) {
      return NextResponse.json({
        success: true,
        shipping: {
          zoneName: null,
          shippingCost: null,
          requiresConfirmation: true,
          message:
            zones.length === 0
              ? message ||
                "No hay configuración de envío disponible en este momento."
              : "No hay cobertura configurada para esta dirección.",
          distanceKm: null,
        } satisfies ShippingByAddressResult,
      });
    }

    const distanceKm = Number(zone.distanciaKm);

    return NextResponse.json({
      success: true,
      shipping: {
        zoneName: zone.nombre,
        shippingCost: calculateShippingCost(distanceKm),
        requiresConfirmation: false,
        message: `Envío calculado para ${zone.nombre}.`,
        distanceKm,
      } satisfies ShippingByAddressResult,
    });
  } catch (_error) {
    return NextResponse.json({
      success: true,
      shipping: {
        zoneName: null,
        shippingCost: null,
        requiresConfirmation: true,
        message:
          "No pudimos calcular el envío en este momento. Revisa tu dirección o intenta de nuevo.",
        distanceKm: null,
      } satisfies ShippingByAddressResult,
    });
  }
}
