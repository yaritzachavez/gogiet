import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool, { logDbUsage } from "@/lib/db";

type OrderActivityRow = RowDataPacket & {
  id: number;
  business_name: string;
  status_name: string | null;
  created_at: string;
};

type ProductActivityRow = RowDataPacket & {
  id: number;
  business_name: string;
  product_name: string;
  created_at: string;
};

const FALLBACK_ACTIVITY = [
  "Nuevo pedido preparado en Mazamitla",
  "Pedido entregado por un aliado local",
  "Producto agregado desde una cocina cercana",
  "Negocio activo recibiendo pedidos en la zona",
];

function buildOrderMessage(statusName: string | null, businessName: string) {
  const normalized = String(statusName ?? "").toLowerCase();

  if (normalized.includes("entreg")) {
    return `Pedido entregado en ${businessName}`;
  }

  if (
    normalized.includes("confirm") ||
    normalized.includes("prepar") ||
    normalized.includes("listo")
  ) {
    return `Pedido preparado en ${businessName}`;
  }

  return `Nuevo pedido registrado en ${businessName}`;
}

export async function GET() {
  try {
    logDbUsage("/api/public/recent-activity");

    const [orderRows] = await pool.query<OrderActivityRow[]>(
      `
        SELECT
          o.id,
          b.name AS business_name,
          osc.name AS status_name,
          COALESCE(o.delivered_at, o.confirmed_at, o.placed_at, o.created_at) AS created_at
        FROM orders o
        INNER JOIN businesses b ON b.id = o.business_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        ORDER BY COALESCE(o.delivered_at, o.confirmed_at, o.placed_at, o.created_at) DESC
        LIMIT 6
      `,
    );

    const [productRows] = await pool.query<ProductActivityRow[]>(
      `
        SELECT
          p.id,
          b.name AS business_name,
          p.name AS product_name,
          p.created_at
        FROM products p
        INNER JOIN businesses b ON b.id = p.business_id
        LEFT JOIN status_catalog psc ON psc.id = p.status_id
        WHERE p.status_id = 1
          OR LOWER(COALESCE(psc.name, '')) IN ('active', 'activo')
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 3
      `,
    );

    const activity = [
      ...orderRows.map((row) => ({
        id: `order-${row.id}`,
        type: "order" as const,
        message: buildOrderMessage(row.status_name, row.business_name),
        businessName: row.business_name,
        createdAt: row.created_at,
      })),
      ...productRows.map((row) => ({
        id: `product-${row.id}`,
        type: "product" as const,
        message: `Producto agregado desde ${row.business_name}`,
        businessName: row.business_name,
        createdAt: row.created_at,
      })),
    ]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 6);

    if (activity.length === 0) {
      return NextResponse.json(
        {
          success: true,
          activity: FALLBACK_ACTIVITY.map((message, index) => ({
            id: `fallback-${index + 1}`,
            type: "fallback",
            message,
            businessName: null,
            createdAt: null,
          })),
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        activity,
      },
      { status: 200 },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);

    console.error("ERROR GET /api/public/recent-activity:", {
      details,
      stack: error instanceof Error ? error.stack : undefined,
      error,
    });

    return NextResponse.json(
      {
        success: true,
        activity: FALLBACK_ACTIVITY.map((message, index) => ({
          id: `fallback-${index + 1}`,
          type: "fallback",
          message,
          businessName: null,
          createdAt: null,
        })),
        error: "No se pudo cargar la actividad reciente",
        details,
        debug: null,
      },
      { status: 200 },
    );
  }
}
