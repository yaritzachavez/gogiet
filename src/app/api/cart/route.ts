import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { getRequestLoggerContext, logger } from "@/lib/logger";
import { requireAuthenticatedUser } from "@/lib/permissions";
import { getProductImageQueryConfig } from "@/lib/product-images";

type CartRow = RowDataPacket & {
  id: number;
  user_id: number;
  status: string | null;
  total: number | string | null;
};

type CartProductRow = RowDataPacket & {
  product_id: number | string | null;
  product_id_ref: number | string | null;
  business_id: number | string | null;
  business_name: string | null;
  name: string | null;
  description_short: string | null;
  price: number | string | null;
  unit_price: number | string | null;
  discount_price: number | string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  quantity: number | string | null;
  total: number | string | null;
};

function toPositiveNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function toMoney(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Number(normalized.toFixed(2)) : 0;
}

async function getActiveCartByUserId(userId: number) {
  const [cartRows] = await pool.query<CartRow[]>(
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
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => ({}));
    const requestedUserId = toPositiveNumber(body?.user_id);
    const userId = auth.access.userId;

    if (requestedUserId && requestedUserId !== userId) {
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

    const [result] = await pool.query<ResultSetHeader>(
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
    logger.error("cart.create_error", "Error creando carrito", {
      ...getRequestLoggerContext(req),
      route: "/api/cart",
      error: err,
    });
    return NextResponse.json(
      { success: false, error: "No pudimos preparar tu carrito." },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      return auth.response;
    }

    const url = new URL(req.url);
    const requestedUserId = toPositiveNumber(url.searchParams.get("user_id"));
    const userId = auth.access.userId;

    if (requestedUserId && requestedUserId !== userId) {
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

    const productImageQueryConfig = await getProductImageQueryConfig();

    const [productRows] = await pool.query<CartProductRow[]>(
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
          ${productImageQueryConfig.thumbnailSelectSql},
          ${productImageQueryConfig.imageSelectSql},
          pc.quantity,
          COALESCE(
            pc.subtotal,
            pc.total,
            COALESCE(pc.unit_price, p.discount_price, p.price, 0) * pc.quantity
          ) AS total
        FROM products_cart pc
        LEFT JOIN products p ON p.id = pc.product_id
        ${productImageQueryConfig.imageJoinSql}
        LEFT JOIN business b ON b.id = p.business_id
        WHERE pc.cart_id = ?
        ORDER BY pc.added_at DESC, pc.product_id DESC
      `,
      [cart.id],
    );

    const invalidProductIds: number[] = [];
    const normalizedProducts = productRows.flatMap((row) => {
      const cartProductId = toPositiveNumber(row.product_id);
      const productId = toPositiveNumber(row.product_id_ref);
      const businessId = toPositiveNumber(row.business_id);
      const quantity = toPositiveNumber(row.quantity);

      if (!cartProductId || !productId || !quantity) {
        if (cartProductId) {
          invalidProductIds.push(cartProductId);
        }
        return [];
      }

      const unitPrice = toMoney(
        row.unit_price ?? row.price ?? row.discount_price ?? 0,
      );
      const total = toMoney(row.total ?? unitPrice * quantity);

      return [
        {
          product_id: productId,
          business_id: businessId,
          business_name: row.business_name,
          name: row.name,
          description_short: row.description_short,
          price: unitPrice,
          unit_price: unitPrice,
          thumbnail_url: row.thumbnail_url,
          image_url: row.image_url,
          quantity,
          total,
        },
      ];
    });

    if (invalidProductIds.length > 0) {
      logger.warn(
        "cart.invalid_items_removed",
        "Productos inválidos removidos del carrito",
        {
          ...getRequestLoggerContext(req),
          route: "/api/cart",
          cartId: cart.id,
          userId,
          invalidProductIds,
        },
      );

      await pool.query(
        `DELETE FROM products_cart WHERE cart_id = ? AND product_id IN (?)`,
        [cart.id, invalidProductIds],
      );
    }

    const updatedTotal = toMoney(
      normalizedProducts.reduce((sum, product) => sum + product.total, 0),
    );

    try {
      await pool.query(
        `UPDATE cart SET total = ?, updated_at = NOW() WHERE id = ?`,
        [updatedTotal, cart.id],
      );
    } catch (error) {
      logger.warn(
        "cart.total_update_error",
        "No se pudo actualizar el total del carrito",
        {
          ...getRequestLoggerContext(req),
          route: "/api/cart",
          cartId: cart.id,
          userId,
          error,
        },
      );
    }

    return NextResponse.json({
      success: true,
      cart: {
        ...cart,
        total: updatedTotal,
      },
      products: normalizedProducts,
      total: updatedTotal,
    });
  } catch (err) {
    logger.error("cart.get_error", "Error obteniendo carrito", {
      ...getRequestLoggerContext(req),
      route: "/api/cart",
      error: err,
    });
    return NextResponse.json(
      { success: false, error: "No pudimos obtener tu carrito." },
      { status: 500 },
    );
  }
}
