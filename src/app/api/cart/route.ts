import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id es requerido" },
        { status: 400 }
      );
    }

    // Crear carrito vacío
    const [result]: any = await pool.query(
      `INSERT INTO cart (user_id, total) VALUES (?, 0.00)`,
      [user_id]
    );

    return NextResponse.json({
      message: "Carrito creado",
      cart_id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Error al crear carrito" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user_id = url.searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id es requerido" },
        { status: 400 }
      );
    }

    // Obtener carrito activo
    const [cartRows]: any = await pool.query(
      `SELECT * FROM cart WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [user_id]
    );

    if (cartRows.length === 0) {
      return NextResponse.json({
        message: "El usuario no tiene carrito",
        cart: null,
        products: [],
      });
    }

    const cart = cartRows[0];

    // Obtener productos del carrito
    const [productRows]: any = await pool.query(
      `
      SELECT 
        pc.id AS products_cart_id,
        p.id AS product_id,
        p.name,
        p.price,
        pc.quantity,
        pc.discount,
        pc.total
      FROM products_cart pc
      INNER JOIN products p ON p.id = pc.product_id
      WHERE pc.cart_id = ?
      `,
      [cart.id]
    );

    // Recalcular total del carrito
    const [totalRow]: any = await pool.query(
      `SELECT SUM(total) AS total FROM products_cart WHERE cart_id = ?`,
      [cart.id]
    );

    const updatedTotal = totalRow[0].total ?? 0;

    // Actualizar total en DB (sync)
    await pool.query(`UPDATE cart SET total = ? WHERE id = ?`, [
      updatedTotal,
      cart.id,
    ]);

    return NextResponse.json({
      cart,
      products: productRows,
      total: updatedTotal,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Error al obtener carrito" },
      { status: 500 }
    );
  }
}
