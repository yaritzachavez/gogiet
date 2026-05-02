import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool from "@/lib/db";

type PromotionRow = RowDataPacket & {
  id: number;
  product_id: number;
  product_name: string;
  promotion_name: string | null;
  promotion_type: string | null;
  regular_price: number | string | null;
  offer_price: number | string | null;
  discount: number | string | null;
  start_date: string | Date | null;
  end_date: string | Date | null;
  is_active: number | boolean | null;
};

type ProductOwnershipRow = RowDataPacket & {
  id: number;
  name: string;
};

function toPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatDateOnly(value: string | Date | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

async function resolveOwnedBusinessId(req: NextRequest, userId: number) {
  const requestedBusinessId = toPositiveNumber(
    req.nextUrl.searchParams.get("business_id"),
  );
  const access = await resolveBusinessAccess(userId, requestedBusinessId);

  return access.businessId;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const businessId = await resolveOwnedBusinessId(req, authUser.user.id);

    if (!businessId) {
      return NextResponse.json({
        success: true,
        promotions: [],
      });
    }

    const [rows] = await pool.query<PromotionRow[]>(
      `
        SELECT
          pr.id,
          p.id AS product_id,
          p.name AS product_name,
          pr.name AS promotion_name,
          pr.promo_type AS promotion_type,
          p.price AS regular_price,
          p.discount_price AS offer_price,
          pr.discount_value AS discount,
          pr.start_date,
          pr.end_date,
          pr.is_active
        FROM promotions pr
        INNER JOIN products p ON pr.id = p.promotion_id
        WHERE p.business_id = ?
        ORDER BY COALESCE(pr.end_date, pr.start_date) DESC, pr.id DESC
      `,
      [businessId],
    );

    const now = new Date();

    return NextResponse.json({
      success: true,
      promotions: rows.map((row) => {
        const startDate = formatDateOnly(row.start_date);
        const endDate = formatDateOnly(row.end_date);
        const isWithinRange =
          (!startDate || now >= new Date(`${startDate}T00:00:00`)) &&
          (!endDate || now <= new Date(`${endDate}T23:59:59`));

        return {
          id: row.id,
          product_id: String(row.product_id),
          product_name: row.product_name,
          title: row.promotion_name ?? `Promoción ${row.product_name}`,
          promotion_type: row.promotion_type ?? "manual",
          regular_price: Number(row.regular_price ?? 0),
          offer_price:
            row.offer_price === null || row.offer_price === undefined
              ? null
              : Number(row.offer_price),
          discount: Number(row.discount ?? 0),
          start_date: startDate,
          end_date: endDate,
          active: Boolean(row.is_active) && isWithinRange,
        };
      }),
    });
  } catch (error) {
    console.error("Error GET /api/business/promotions:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar las promociones.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const businessId = toPositiveNumber(body.business_id);
    const productId = toPositiveNumber(body.product_id);
    const discount = Number(body.discount);
    const startDate = String(body.start_date ?? "");
    const endDate = String(body.end_date ?? "");

    if (
      !businessId ||
      !productId ||
      !Number.isFinite(discount) ||
      discount <= 0
    ) {
      return NextResponse.json(
        { success: false, error: "Datos de promoción inválidos" },
        { status: 400 },
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "Las fechas son obligatorias" },
        { status: 400 },
      );
    }

    const access = await resolveBusinessAccess(authUser.user.id, businessId);

    if (access.businessId !== businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso a este negocio" },
        { status: 403 },
      );
    }

    const [productRows] = await connection.query<ProductOwnershipRow[]>(
      `
        SELECT id, name
        FROM products
        WHERE id = ? AND business_id = ?
        LIMIT 1
      `,
      [productId, businessId],
    );

    const product = productRows[0];

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado para este negocio" },
        { status: 404 },
      );
    }

    await connection.beginTransaction();

    const [promotionResult] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO promotions (
          name,
          description,
          promo_type,
          discount_value,
          start_date,
          end_date,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, 'percentage', ?, ?, ?, 1, NOW(), NOW())
      `,
      [
        `Promoción ${product.name}`,
        `Descuento del ${discount}% para ${product.name}`,
        discount,
        `${startDate} 00:00:00`,
        `${endDate} 23:59:59`,
      ],
    );

    await connection.query(
      `
        UPDATE products
        SET promotion_id = ?, updated_at = NOW()
        WHERE id = ? AND business_id = ?
      `,
      [promotionResult.insertId, productId, businessId],
    );

    await connection.commit();

    const now = new Date();
    const isWithinRange =
      now >= new Date(`${startDate}T00:00:00`) &&
      now <= new Date(`${endDate}T23:59:59`);

    return NextResponse.json(
      {
        success: true,
        promotion: {
          id: promotionResult.insertId,
          product_id: String(productId),
          product_name: product.name,
          discount,
          start_date: startDate,
          end_date: endDate,
          active: isWithinRange,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    console.error("Error POST /api/business/promotions:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo crear la promoción.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    const promotionId = toPositiveNumber(body?.id);
    const discount =
      body?.discount === undefined ? undefined : Number(body.discount);
    const startDate =
      body?.start_date === undefined
        ? undefined
        : String(body.start_date ?? "");
    const endDate =
      body?.end_date === undefined ? undefined : String(body.end_date ?? "");
    const active =
      body?.active === undefined ? undefined : Boolean(body.active);

    if (!promotionId) {
      return NextResponse.json(
        { success: false, error: "Promoción inválida" },
        { status: 400 },
      );
    }

    const [promotionRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT p.business_id
        FROM products p
        INNER JOIN promotions pr ON pr.id = p.promotion_id
        WHERE pr.id = ?
        LIMIT 1
      `,
      [promotionId],
    );
    const businessId = Number(promotionRows[0]?.business_id ?? 0);

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "Promoción no encontrada" },
        { status: 404 },
      );
    }

    const access = await resolveBusinessAccess(authUser.user.id, businessId);

    if (access.businessId !== businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso a esta promoción" },
        { status: 403 },
      );
    }

    const fields: string[] = [];
    const values: Array<string | number> = [];

    if (discount !== undefined) {
      if (!Number.isFinite(discount) || discount <= 0) {
        return NextResponse.json(
          { success: false, error: "Descuento inválido" },
          { status: 400 },
        );
      }
      fields.push("discount_value = ?");
      values.push(discount);
    }

    if (startDate !== undefined) {
      fields.push("start_date = ?");
      values.push(`${startDate} 00:00:00`);
    }

    if (endDate !== undefined) {
      fields.push("end_date = ?");
      values.push(`${endDate} 23:59:59`);
    }

    if (active !== undefined) {
      fields.push("is_active = ?");
      values.push(active ? 1 : 0);
    }

    if (!fields.length) {
      return NextResponse.json(
        { success: false, error: "Nada que actualizar" },
        { status: 400 },
      );
    }

    values.push(promotionId);

    await pool.query(
      `
        UPDATE promotions
        SET ${fields.join(", ")}, updated_at = NOW()
        WHERE id = ?
      `,
      values,
    );

    return NextResponse.json({
      success: true,
      message: "Promoción actualizada correctamente",
    });
  } catch (error) {
    console.error("Error PATCH /api/business/promotions:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la promoción.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const promotionId = toPositiveNumber(req.nextUrl.searchParams.get("id"));

    if (!promotionId) {
      return NextResponse.json(
        { success: false, error: "Promoción inválida" },
        { status: 400 },
      );
    }

    const [promotionRows] = await connection.query<RowDataPacket[]>(
      `
        SELECT p.business_id
        FROM products p
        INNER JOIN promotions pr ON pr.id = p.promotion_id
        WHERE pr.id = ?
        LIMIT 1
      `,
      [promotionId],
    );
    const businessId = Number(promotionRows[0]?.business_id ?? 0);

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "Promoción no encontrada" },
        { status: 404 },
      );
    }

    const access = await resolveBusinessAccess(authUser.user.id, businessId);

    if (access.businessId !== businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso a esta promoción" },
        { status: 403 },
      );
    }

    await connection.beginTransaction();
    await connection.query(
      `
        UPDATE products
        SET promotion_id = NULL, updated_at = NOW()
        WHERE promotion_id = ?
      `,
      [promotionId],
    );
    await connection.query("DELETE FROM promotions WHERE id = ?", [
      promotionId,
    ]);
    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Promoción eliminada correctamente",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error DELETE /api/business/promotions:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar la promoción.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
