import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    const payload = await req.json();

    console.log("ADD TO CART payload:", payload);

    const cartId = Number(payload?.cart_id);
    const productId = Number(payload?.product_id);
    const quantity = Number(payload?.quantity);
    const discountValue = Number(payload?.discount ?? 0);
    const authUserId = Number(authUser?.user?.id ?? 0);

    if (!cartId || !productId || !quantity) {
      return NextResponse.json(
        {
          success: false,
          error: "cart_id, product_id y quantity son requeridos",
        },
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

    const [productRow]: any = await pool.query(
      `SELECT id, price, business_id FROM products WHERE id = ? LIMIT 1`,
      [productId],
    );

    if (productRow.length === 0) {
      return NextResponse.json(
        { success: false, error: "El producto no existe" },
        { status: 404 },
      );
    }

    const basePrice = Number(productRow[0].price ?? 0);
    const finalPrice = Math.max(basePrice - discountValue, 0);
    const subtotal = finalPrice * quantity;

    const [exists]: any = await pool.query(
      `SELECT product_id FROM products_cart WHERE cart_id = ? AND product_id = ? LIMIT 1`,
      [cartId, productId],
    );

    if (exists.length > 0) {
      try {
        await pool.query(
          `
            UPDATE products_cart
            SET quantity = ?, unit_price = ?, subtotal = ?, updated_at = NOW()
            WHERE cart_id = ? AND product_id = ?
          `,
          [quantity, finalPrice, subtotal, cartId, productId],
        );
      } catch {
        await pool.query(
          `
            UPDATE products_cart
            SET quantity = ?, discount = ?, total = ?
            WHERE cart_id = ? AND product_id = ?
          `,
          [quantity, discountValue, subtotal, cartId, productId],
        );
      }
    } else {
      try {
        await pool.query(
          `
            INSERT INTO products_cart (cart_id, product_id, quantity, unit_price, subtotal, added_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
          `,
          [cartId, productId, quantity, finalPrice, subtotal],
        );
      } catch {
        await pool.query(
          `
            INSERT INTO products_cart (cart_id, product_id, quantity, discount, total)
            VALUES (?, ?, ?, ?, ?)
          `,
          [cartId, productId, quantity, discountValue, subtotal],
        );
      }
    }

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

    const response = {
      success: true,
      message: "Producto agregado/actualizado al carrito",
      item: {
        cart_id: cartId,
        product_id: productId,
        business_id: Number(productRow[0].business_id ?? 0),
        quantity,
        price: finalPrice,
        subtotal,
      },
    };

    console.log("ADD TO CART response:", response);

    return NextResponse.json(response);
  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    return NextResponse.json(
      { success: false, error: "Error al agregar producto al carrito" },
      { status: 500 },
    );
  }
}
