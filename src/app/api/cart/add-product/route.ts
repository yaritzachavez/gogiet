import type { RowDataPacket } from "mysql2/promise";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool from "@/lib/db";

type CartRow = RowDataPacket & {
  id: number;
  user_id: number;
};

type ProductRow = RowDataPacket & {
  id: number;
  price: number | string | null;
  discount_price: number | string | null;
  business_id: number | null;
};

type ProductExistsRow = RowDataPacket & {
  product_id: number;
};

type CartBusinessRow = RowDataPacket & {
  business_id: number | null;
};

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    const payload = await req.json();

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

    const [productRow] = await pool.query<ProductRow[]>(
      `
        SELECT id, price, discount_price, business_id
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId],
    );

    if (productRow.length === 0) {
      return NextResponse.json(
        { success: false, error: "El producto no existe" },
        { status: 404 },
      );
    }

    const productBusinessId = Number(productRow[0].business_id ?? 0);

    if (!productBusinessId) {
      console.error("ADD TO CART invalid product business:", {
        cartId,
        productId,
        productRow: productRow[0],
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Este producto no tiene un negocio válido asociado. Vuelve a cargar la tienda.",
        },
        { status: 400 },
      );
    }

    const cartBusinessValidationQuery = `
      SELECT DISTINCT p.business_id
      FROM products_cart pc
      INNER JOIN products p ON p.id = pc.product_id
      WHERE pc.cart_id = ?
    `;
    const [cartBusinessRows] = await pool.query<CartBusinessRow[]>(
      cartBusinessValidationQuery,
      [cartId],
    );
    const existingBusinessIds = Array.from(
      new Set(
        cartBusinessRows
          .map((row) => Number(row.business_id ?? 0))
          .filter(
            (businessId) => Number.isFinite(businessId) && businessId > 0,
          ),
      ),
    );

    if (
      existingBusinessIds.length > 0 &&
      !existingBusinessIds.includes(productBusinessId)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Tu carrito ya contiene productos de otro negocio. Finaliza ese pedido o vacía el carrito antes de agregar productos de una tienda diferente.",
        },
        { status: 400 },
      );
    }

    const basePrice = Number(
      productRow[0].discount_price ??
        productRow[0].price ??
        payload?.price ??
        0,
    );
    const finalPrice = Math.max(basePrice - discountValue, 0);
    const subtotal = finalPrice * quantity;

    const [exists] = await pool.query<ProductExistsRow[]>(
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
        business_id: productBusinessId,
        quantity,
        price: finalPrice,
        subtotal,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    return NextResponse.json(
      { success: false, error: "Error al agregar producto al carrito" },
      { status: 500 },
    );
  }
}
