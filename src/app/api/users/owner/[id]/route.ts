import type { RowDataPacket } from "mysql2/promise";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { requireSelfOrAdmin } from "@/lib/permissions";

type OwnedBusinessRow = RowDataPacket & {
  id: number;
  name: string;
  city: string | null;
  district: string | null;
  address: string | null;
  status_id: number | null;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: userId } = await context.params;
    const numericUserId = Number(userId);

    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const access = await requireSelfOrAdmin(req, numericUserId);
    if (!access.ok) {
      return access.response;
    }

    const [businesses] = await pool.query<OwnedBusinessRow[]>(
      `
      SELECT 
        b.id,
        b.name,
        b.city,
        b.district,
        b.address,
        b.status_id
      FROM business_owners bo
      INNER JOIN business b ON b.id = bo.business_id
      WHERE bo.user_id = ?;
      `,
      [numericUserId],
    );

    return NextResponse.json({
      businesses: businesses ?? [],
    });
  } catch (error) {
    console.error("❌ Error GET /users/:id/businesses", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
