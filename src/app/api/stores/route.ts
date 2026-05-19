import { NextResponse } from "next/server";
import { logDbUsage } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getPublicStores } from "@/lib/public-stores";

export async function GET(req: Request) {
  try {
    logDbUsage("/api/stores");
    const url = new URL(req.url);
    const search = String(url.searchParams.get("q") ?? "").trim();
    const stores = await getPublicStores(search);

    return NextResponse.json(
      {
        success: true,
        stores,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("stores.list_error", "Error GET /api/stores", { error });
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
