import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(req: Request) {
  const { cart_id, product_id } = await req.json();

  await pool.query(
    `DELETE FROM products_cart WHERE cart_id = ? AND product_id = ?`,
    [cart_id, product_id]
  );

  // Recalcular total
  await pool.query(
    `UPDATE cart SET total = (SELECT COALESCE(SUM(total), 0) FROM products_cart WHERE cart_id = ?) WHERE id = ?`,
    [cart_id, cart_id]
  );

  return NextResponse.json({ message: "Producto removido" });
}
