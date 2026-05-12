import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";

async function getActiveCartByUserId(userId: number) {
  const [cartRows]: any = await pool.query(
    `
      SELECT *
      FROM cart
      WHERE user_id = ?
        AND COALESCE(status, 'activo') = 'activo'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [userId],
  );

  return cartRows[0] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const requestedUserId = Number(body?.user_id);
    const authUserId = Number(authUser?.user?.id ?? 0);
    const userId =
      Number.isInteger(authUserId) && authUserId > 0
        ? authUserId
        : requestedUserId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "user_id es requerido" },
        { status: 400 },
      );
    }

    if (
      Number.isInteger(authUserId) &&
      authUserId > 0 &&
      requestedUserId &&
      requestedUserId !== authUserId
    ) {
      return NextResponse.json(
        { success: false, error: "No autorizado para este carrito" },
        { status: 403 },
      );
    }

    const existingCart = await getActiveCartByUserId(userId);

    if (existingCart) {
      return NextResponse.json({
        success: true,
        message: "Carrito activo encontrado",
        cart_id: Number(existingCart.id),
        cart: existingCart,
      });
    }

    const [result]: any = await pool.query(
      `
        INSERT INTO cart (user_id, status, created_at, updated_at)
        VALUES (?, 'activo', NOW(), NOW())
      `,
      [userId],
    );

    return NextResponse.json({
      success: true,
      message: "Carrito creado",
      cart_id: result.insertId,
    });
  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    return NextResponse.json(
      { success: false, error: "Error al crear carrito" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    const url = new URL(req.url);
    const requestedUserId = Number(url.searchParams.get("user_id"));
    const authUserId = Number(authUser?.user?.id ?? 0);
    const userId =
      Number.isInteger(authUserId) && authUserId > 0
        ? authUserId
        : requestedUserId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "user_id es requerido" },
        { status: 400 },
      );
    }

    if (
      Number.isInteger(authUserId) &&
      authUserId > 0 &&
      requestedUserId &&
      requestedUserId !== authUserId
    ) {
      return NextResponse.json(
        { success: false, error: "No autorizado para este carrito" },
        { status: 403 },
      );
    }

    const cart = await getActiveCartByUserId(userId);

    if (!cart) {
      return NextResponse.json({
        success: true,
        message: "El usuario no tiene carrito",
        cart: null,
        products: [],
        total: 0,
      });
    }

    const [productRows]: any = await pool.query(
      `
        SELECT
          pc.product_id,
          p.id AS product_id_ref,
          p.business_id,
          b.name AS business_name,
          p.name,
          p.description_short,
          COALESCE(pc.unit_price, p.discount_price, p.price, 0) AS price,
          pc.unit_price,
          p.discount_price,
          p.thumbnail_url,
          p.image_url,
          pc.quantity,
          COALESCE(
            pc.subtotal,
            pc.total,
            COALESCE(pc.unit_price, p.discount_price, p.price, 0) * pc.quantity
          ) AS total
        FROM products_cart pc
        INNER JOIN products p ON p.id = pc.product_id
        LEFT JOIN businesses b ON b.id = p.business_id
        WHERE pc.cart_id = ?
        ORDER BY pc.added_at DESC, pc.product_id DESC
      `,
      [cart.id],
    );

    const [totalRow]: any = await pool.query(
      `
        SELECT COALESCE(SUM(COALESCE(subtotal, total, 0)), 0) AS total
        FROM products_cart
        WHERE cart_id = ?
      `,
      [cart.id],
    );

    const updatedTotal = Number(totalRow[0]?.total ?? 0);

    try {
      await pool.query(
        `UPDATE cart SET total = ?, updated_at = NOW() WHERE id = ?`,
        [updatedTotal, cart.id],
      );
    } catch (error) {
      console.error("ADD TO CART ERROR:", error);
    }

    return NextResponse.json({
      success: true,
      cart,
      products: productRows,
      total: updatedTotal,
    });
  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    return NextResponse.json(
      { success: false, error: "Error al obtener carrito" },
      { status: 500 },
    );
  }
}
