import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    const { cart_id, product_id } = await req.json();
    const cartId = Number(cart_id);
    const productId = Number(product_id);
    const authUserId = Number(authUser?.user?.id ?? 0);

    if (!cartId || !productId) {
      return NextResponse.json(
        { success: false, error: "cart_id y product_id son requeridos" },
        { status: 400 },
      );
    }

    const [cartRows]: any = await pool.query(
      `SELECT id, user_id FROM cart WHERE id = ? LIMIT 1`,
      [cartId],
    );

    if (!cartRows.length) {
      return NextResponse.json(
        { success: false, error: "Carrito no encontrado" },
        { status: 404 },
      );
    }

    if (
      Number.isInteger(authUserId) &&
      authUserId > 0 &&
      Number(cartRows[0].user_id) !== authUserId
    ) {
      return NextResponse.json(
        { success: false, error: "No autorizado para modificar este carrito" },
        { status: 403 },
      );
    }

    await pool.query(
      `DELETE FROM products_cart WHERE cart_id = ? AND product_id = ?`,
      [cartId, productId],
    );

    try {
      await pool.query(
        `
          UPDATE cart
          SET total = (
            SELECT COALESCE(SUM(COALESCE(subtotal, total, 0)), 0)
            FROM products_cart
            WHERE cart_id = ?
          ),
          updated_at = NOW()
          WHERE id = ?
        `,
        [cartId, cartId],
      );
    } catch (error) {
      console.error("ADD TO CART ERROR:", error);
    }

    return NextResponse.json({ success: true, message: "Producto removido" });
  } catch (error) {
    console.error("ADD TO CART ERROR:", error);
    return NextResponse.json(
      { success: false, error: "Error al remover producto del carrito" },
      { status: 500 },
    );
  }
}
