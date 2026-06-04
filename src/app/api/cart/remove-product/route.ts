import type { RowDataPacket } from "mysql2/promise";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAuthUserActive } from "@/lib/auth-users";
import {
  getCartRecalculateTotalQuery,
  getCartRuntimeSchema,
} from "@/lib/cart-schema";
import pool from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/permissions";

type CartRow = RowDataPacket & {
  id: number;
  user_id: number;
};

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { cart_id, product_id } = await req.json();
    const cartId = Number(cart_id);
    const productId = Number(product_id);
    const authUserId = Number(auth.access.userId ?? 0);

    if (!(await isAuthUserActive(authUserId))) {
      return NextResponse.json(
        {
          success: false,
          error: "Tu cuenta está inactiva. Contacta a soporte.",
        },
        { status: 403 },
      );
    }

    if (!cartId || !productId) {
      return NextResponse.json(
        { success: false, error: "cart_id y product_id son requeridos" },
        { status: 400 },
      );
    }

    const [cartRows] = await pool.query<CartRow[]>(
      `SELECT id, user_id FROM cart WHERE id = ? LIMIT 1`,
      [cartId],
    );

    if (!cartRows.length) {
      return NextResponse.json(
        { success: false, error: "Carrito no encontrado" },
        { status: 404 },
      );
    }

    if (Number(cartRows[0].user_id) !== authUserId) {
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
      const cartRuntimeSchema = await getCartRuntimeSchema();
      const recalculateCartQuery =
        getCartRecalculateTotalQuery(cartRuntimeSchema);

      if (recalculateCartQuery) {
        const parameters = cartRuntimeSchema.cartHasTotal
          ? [cartId, cartId]
          : [cartId];
        await pool.query(recalculateCartQuery, parameters);
      }
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
