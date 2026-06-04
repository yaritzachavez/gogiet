import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminGeneral } from "@/lib/permissions";
import { getAllShippingZones } from "@/lib/shipping-zones";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminGeneral(req);

    if (!auth.ok) {
      return auth.response;
    }

    const { source, message, zones } = await getAllShippingZones();

    return NextResponse.json({
      success: true,
      source,
      message,
      zones,
    });
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar las zonas de envío.",
      },
      { status: 500 },
    );
  }
}
