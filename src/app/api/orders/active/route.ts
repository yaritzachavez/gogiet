import { type NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";

import { GET as getOrders } from "@/app/api/orders/route";
import { getAuthUser } from "@/lib/admin-security";
import pool, { logDbUsage } from "@/lib/db";

const ACTIVE_STATUS_NAMES = [
  "pendiente",
  "por_validar_pago",
  "preparando",
  "listo_para_recoger",
  "recogido",
  "en_camino",
];

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante", orders: [] },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido", orders: [] },
        { status: 401 },
      );
    }

    const [userRows] = await pool.query<Array<RowDataPacket & { email: string }>>(
      `
        SELECT email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [authUser.user.id],
    );

    const [roleRows] = await pool.query<Array<RowDataPacket & { role_name: string }>>(
      `
        SELECT r.name AS role_name
        FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?
      `,
      [authUser.user.id],
    );

    console.log("GET /api/orders/active endpoint:", "/api/orders/active");
    console.log("GET /api/orders/active userId:", authUser.user.id);
    console.log("GET /api/orders/active email:", userRows[0]?.email ?? null);
    console.log(
      "GET /api/orders/active role:",
      roleRows.map((row) => row.role_name),
    );
    logDbUsage("/api/orders/active", {
      userId: authUser.user.id,
      email: userRows[0]?.email ?? null,
      role: roleRows.map((row) => row.role_name),
    });

    const response = await getOrders(req);
    const responseText = await response.text();
    let payload: Record<string, unknown> = {};

    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = { raw: responseText };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            (typeof payload.error === "string" && payload.error) ||
            "No se pudieron cargar los pedidos activos.",
          orders: [],
        },
        { status: response.status },
      );
    }

    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    const activeOrders = orders.filter((order) =>
      ACTIVE_STATUS_NAMES.includes(normalizeStatus(order?.status)),
    );

    return NextResponse.json({
      success: true,
      orders: activeOrders,
    });
  } catch (error) {
    console.error("Error GET /api/orders/active:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar los pedidos activos.",
        orders: [],
      },
      { status: 500 },
    );
  }
}
