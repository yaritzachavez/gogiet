import { type NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  calculateShippingCost,
  type ShippingByAddressResult,
} from "@/lib/shipping";
import {
  getDefaultShippingZoneByAddress,
  normalizeShippingZoneName,
} from "@/lib/shipping-zones";

type ShippingZoneRow = {
  nombre: string;
  distancia_km: number | string;
  activo: number | boolean;
};

async function findZoneByAddress(address: string) {
  try {
    const rows = await prisma.$queryRaw<ShippingZoneRow[]>`
      SELECT nombre, distancia_km, activo
      FROM zonas_envio
      WHERE activo = TRUE
    `;

    const normalizedAddress = normalizeShippingZoneName(address);

    if (!normalizedAddress) {
      return null;
    }

    return (
      rows.find((zone) =>
        normalizedAddress.includes(normalizeShippingZoneName(zone.nombre)),
      ) ?? null
    );
  } catch (error) {
    console.error(error);
    const fallbackZone = getDefaultShippingZoneByAddress(address);

    if (!fallbackZone) {
      return null;
    }

    return {
      nombre: fallbackZone.nombre,
      distancia_km: fallbackZone.distanciaKm,
      activo: fallbackZone.activo,
    } satisfies ShippingZoneRow;
  }
}

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

    const zone = await findZoneByAddress(searchableAddress);

    if (!zone) {
      return NextResponse.json({
        success: true,
        shipping: {
          zoneName: null,
          shippingCost: null,
          requiresConfirmation: true,
          message:
            "No pudimos identificar tu zona de entrega. El envío requiere confirmación.",
          distanceKm: null,
        } satisfies ShippingByAddressResult,
      });
    }

    const distanceKm = Number(zone.distancia_km);

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
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "No pudimos calcular el envío" },
      { status: 500 },
    );
  }
}
