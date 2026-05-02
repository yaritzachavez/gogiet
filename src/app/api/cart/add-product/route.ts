import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { cart_id, product_id, quantity, discount = 0 } = await req.json();

    if (!cart_id || !product_id || !quantity) {
      return NextResponse.json(
        { error: "cart_id, product_id y quantity son requeridos" },
        { status: 400 }
      );
    }

    // Obtener precio base
    const [productRow]: any = await pool.query(
      `SELECT price FROM products WHERE id = ?`,
      [product_id]
    );

    if (productRow.length === 0) {
      return NextResponse.json(
        { error: "El producto no existe" },
        { status: 404 }
      );
    }

    const basePrice = Number(productRow[0].price);
    const discountValue = Number(discount);
    const finalPrice = Math.max(basePrice - discountValue, 0);
    const total = finalPrice * Number(quantity);

    // Revisar si ya existe en el carrito
    const [exists]: any = await pool.query(
      `SELECT id FROM products_cart WHERE cart_id = ? AND product_id = ?`,
      [cart_id, product_id]
    );

    if (exists.length > 0) {
      // UPDATE si ya existe
      await pool.query(
        `
        UPDATE products_cart 
        SET quantity = ?, discount = ?, total = ?
        WHERE cart_id = ? AND product_id = ?
        `,
        [quantity, discountValue, total, cart_id, product_id]
      );
    } else {
      // INSERT si no existe
      await pool.query(
        `
        INSERT INTO products_cart (cart_id, product_id, quantity, discount, total)
        VALUES (?, ?, ?, ?, ?)
        `,
        [cart_id, product_id, quantity, discountValue, total]
      );
    }

    // Actualizar total del carrito
    await pool.query(
      `
      UPDATE cart 
      SET total = (SELECT SUM(total) FROM products_cart WHERE cart_id = ?)
      WHERE id = ?
      `,
      [cart_id, cart_id]
    );

    return NextResponse.json({
      message: "Producto agregado/actualizado al carrito",
      total_item: total,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Error al agregar producto al carrito" },
      { status: 500 }
    );
  }
}
