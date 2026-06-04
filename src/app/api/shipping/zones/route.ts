import { NextResponse } from "next/server";

import { getActiveShippingZones } from "@/lib/shipping-zones";

export async function GET() {
  try {
    const { source, message, zones } = await getActiveShippingZones();

    return NextResponse.json({
      success: true,
      source,
      message,
      zones,
    });
  } catch (_error) {
    return NextResponse.json({
      success: true,
      source: "fallback",
      message: "No pudimos cargar las zonas de envío en este momento.",
      zones: [],
    });
  }
}
