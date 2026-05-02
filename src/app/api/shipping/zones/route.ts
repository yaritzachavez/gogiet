import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { DEFAULT_SHIPPING_ZONES } from "@/lib/shipping-zones";

type ShippingZoneRow = {
  id: number;
  nombre: string;
  tipo: string;
  distancia_km: number | string;
  activo: number | boolean;
};

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<ShippingZoneRow[]>`
      SELECT id, nombre, tipo, distancia_km, activo
      FROM zonas_envio
      WHERE activo = TRUE
      ORDER BY nombre ASC
    `;

    return NextResponse.json({
      success: true,
      source: "database",
      zones: rows.map((zone) => ({
        id: Number(zone.id),
        nombre: zone.nombre,
        tipo: zone.tipo,
        distanciaKm: Number(zone.distancia_km),
        activo: Boolean(zone.activo),
      })),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: true,
      source: "fallback",
      message:
        "Usando zonas de envío preconfiguradas mientras se restablece la conexión.",
      zones: DEFAULT_SHIPPING_ZONES,
    });
  }
}
