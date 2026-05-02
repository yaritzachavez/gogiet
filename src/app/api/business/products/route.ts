import jwt from "jsonwebtoken";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import pool, { logDbUsage } from "@/lib/db";

function validateBearer(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.JWT_SECRET || "gogi-dev-secret";

  if (!authHeader?.startsWith("Bearer ")) return false;

  try {
    jwt.verify(authHeader.split(" ")[1], secret);
    return true;
  } catch {
    return false;
  }
}

function toMySQLDate(date: Date) {
  const pad = (n: number) => (n < 10 ? `0${n}` : n);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

type ProductPromotionRow = RowDataPacket & {
  id: number;
  name: string;
  price: number | string;
  discount_price: number | string | null;
  promotion_id: number | null;
};

type PromotionLookupRow = RowDataPacket & {
  id: number;
  promo_type: string | null;
};

async function syncOfferPromotionForProduct(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  product: ProductPromotionRow,
) {
  const productId = Number(product.id);
  const regularPrice = Number(product.price ?? 0);
  const offerPrice =
    product.discount_price === null || product.discount_price === undefined
      ? null
      : Number(product.discount_price);
  const promotionId =
    product.promotion_id === null || product.promotion_id === undefined
      ? null
      : Number(product.promotion_id);

  if (
    !offerPrice ||
    !Number.isFinite(offerPrice) ||
    !Number.isFinite(regularPrice) ||
    offerPrice <= 0 ||
    offerPrice >= regularPrice
  ) {
    if (promotionId) {
      const [promotionRows] = await connection.query<PromotionLookupRow[]>(
        `
          SELECT id, promo_type
          FROM promotions
          WHERE id = ?
          LIMIT 1
        `,
        [promotionId],
      );

      if (promotionRows[0]?.promo_type === "precio_oferta") {
        await connection.query(
          `
            UPDATE products
            SET promotion_id = NULL, updated_at = NOW()
            WHERE id = ?
          `,
          [productId],
        );
        await connection.query("DELETE FROM promotions WHERE id = ?", [
          promotionId,
        ]);
      }
    }

    return;
  }

  const discountPercentage = Number(
    (((regularPrice - offerPrice) / regularPrice) * 100).toFixed(2),
  );

  if (promotionId) {
    const [promotionRows] = await connection.query<PromotionLookupRow[]>(
      `
        SELECT id, promo_type
        FROM promotions
        WHERE id = ?
        LIMIT 1
      `,
      [promotionId],
    );

    if (promotionRows[0]?.promo_type === "precio_oferta") {
      await connection.query(
        `
          UPDATE promotions
          SET
            name = ?,
            description = ?,
            discount_value = ?,
            start_date = COALESCE(start_date, NOW()),
            end_date = NULL,
            is_active = 1,
            updated_at = NOW()
          WHERE id = ?
        `,
        [
          `Oferta ${product.name}`,
          `Precio oferta automático para ${product.name}`,
          discountPercentage,
          promotionId,
        ],
      );
    }

    return;
  }

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
      VALUES (?, ?, 'precio_oferta', ?, NOW(), NULL, 1, NOW(), NOW())
    `,
    [
      `Oferta ${product.name}`,
      `Precio oferta automático para ${product.name}`,
      discountPercentage,
    ],
  );

  await connection.query(
    `
      UPDATE products
      SET promotion_id = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [promotionResult.insertId, productId],
  );
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const requestedBusinessId = Number(url.searchParams.get("business_id"));
    logDbUsage("/api/business/products", {
      userId: authUser.user.id,
    });

    const access = await resolveBusinessAccess(
      authUser.user.id,
      Number.isFinite(requestedBusinessId) ? requestedBusinessId : null,
    );

    if (!access.businessId) {
      return NextResponse.json({
        success: true,
        products: [],
        message: "No tienes un negocio asignado",
      });
    }
    const businessId = access.businessId;

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          p.id,
          p.business_id,
          p.sku,
          p.barcode,
          p.name,
          p.description_short,
          p.description_long,
          MAX(pcm.category_id) AS product_category_id,
          p.price,
          p.discount_price,
          p.currency,
          p.sale_format,
          p.price_per_unit,
          p.tax_included,
          p.tax_rate,
          p.commission_rate,
          p.is_stock_available,
          p.max_per_order,
          p.min_per_order,
          p.promotion_id,
          p.thumbnail_url,
          p.stock_average,
          p.stock_danger,
          p.expires_at,
          p.status_id,
          p.created_at,
          p.updated_at,
          MAX(c.name) AS category_name
        FROM products p
        LEFT JOIN product_category_map pcm ON pcm.product_id = p.id
        LEFT JOIN product_categories c ON c.id = pcm.category_id
        WHERE p.business_id = ?
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `,
      [businessId],
    );

    return NextResponse.json(
      {
        success: true,
        business_id: businessId,
        products: rows,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("GET /api/business/products ERROR:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    if (!validateBearer(req)) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const { product } = await req.json();

    if (!product) {
      return NextResponse.json(
        { error: "Objeto 'product' requerido" },
        { status: 400 },
      );
    }

    const sanitizedProduct =
      product && typeof product === "object"
        ? (product as Record<string, unknown>)
        : null;

    if (!sanitizedProduct) {
      return NextResponse.json(
        { error: "Objeto 'product' inválido" },
        { status: 400 },
      );
    }

    const {
      business_id,
      sku,
      barcode,
      name,
      description_long,
      description_short,
      product_category_id,
      price,
      discount_price,
      currency,
      sale_format,
      price_per_unit,
      tax_included,
      tax_rate,
      commission_rate,
      is_stock_available,
      max_per_order,
      min_per_order,
      promotion_id,
      thumbnail_url,
      stock_average,
      stock_danger,
      expires_at,
      status_id,
      customization_groups,
    } = sanitizedProduct;

    if (!business_id || !product_category_id || !name || !price) {
      return NextResponse.json(
        {
          error:
            "Campos obligatorios faltantes: business_id, product_category_id, name, price",
        },
        { status: 400 },
      );
    }

    const access = await resolveBusinessAccess(
      Number(authUser.user.id),
      Number(business_id),
    );

    if (!access.businessId) {
      return NextResponse.json(
        { error: "No tienes un negocio asignado" },
        { status: 403 },
      );
    }
    const resolvedBusinessId = access.businessId;

    await connection.beginTransaction();

    const now = new Date();
    const createdAt = toMySQLDate(now);
    const updatedAt = toMySQLDate(now);

    const [result] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO products (
          business_id,
          sku,
          barcode,
          name,
          description_long,
          description_short,
          price,
          discount_price,
          currency,
          sale_format,
          price_per_unit,
          tax_included,
          tax_rate,
          commission_rate,
          is_stock_available,
          max_per_order,
          min_per_order,
          promotion_id,
          thumbnail_url,
          stock_average,
          stock_danger,
          created_at,
          updated_at,
          expires_at,
          status_id
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        resolvedBusinessId,
        sku ?? `SKU-${Date.now()}`,
        barcode ?? null,
        name,
        description_long ?? null,
        description_short ?? null,
        price,
        discount_price ?? null,
        currency ?? "MXN",
        sale_format ?? "UNIDAD",
        price_per_unit ?? null,
        tax_included === undefined ? 1 : tax_included ? 1 : 0,
        tax_rate ?? null,
        commission_rate ?? null,
        is_stock_available === undefined ? 1 : is_stock_available ? 1 : 0,
        max_per_order ?? null,
        min_per_order ?? null,
        promotion_id ?? null,
        thumbnail_url ?? null,
        stock_average ?? 0,
        stock_danger ?? 0,
        createdAt,
        updatedAt,
        expires_at ? toMySQLDate(new Date(String(expires_at))) : null,
        status_id ?? 1,
      ],
    );

    await connection.query(
      `
        INSERT INTO product_category_map (product_id, category_id)
        VALUES (?, ?)
      `,
      [result.insertId, product_category_id],
    );

    const normalizedCustomizationGroups = Array.isArray(customization_groups)
      ? customization_groups
      : [];

    if (normalizedCustomizationGroups.length > 0) {
      const [tableRows] = await connection.query<RowDataPacket[]>(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (
            'product_customization_groups',
            'product_customization_options'
          )
        `,
      );

      if (tableRows.length === 2) {
        for (const [
          groupIndex,
          group,
        ] of normalizedCustomizationGroups.entries()) {
          const [groupResult] = await connection.query<ResultSetHeader>(
            `
            INSERT INTO product_customization_groups (
              product_id,
              name,
              min_selections,
              max_selections,
              is_required,
              sort_order,
              is_active,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            `,
            [
              result.insertId,
              group?.name ?? `Grupo ${groupIndex + 1}`,
              Number(group?.minSelections) || 0,
              group?.maxSelections === null ||
              group?.maxSelections === undefined ||
              group?.maxSelections === ""
                ? null
                : Number(group.maxSelections),
              group?.isRequired ? 1 : 0,
              Number(group?.sortOrder) || groupIndex + 1,
              createdAt,
              updatedAt,
            ],
          );

          const options = Array.isArray(group?.options) ? group.options : [];

          for (const [optionIndex, option] of options.entries()) {
            await connection.query(
              `
              INSERT INTO product_customization_options (
                group_id,
                name,
                extra_price,
                sort_order,
                is_default,
                is_active,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, 1, ?, ?)
              `,
              [
                groupResult.insertId,
                option?.name ?? `Opción ${optionIndex + 1}`,
                Number(option?.extraPrice) || 0,
                Number(option?.sortOrder) || optionIndex + 1,
                option?.isDefault ? 1 : 0,
                createdAt,
                updatedAt,
              ],
            );
          }
        }
      }
    }

    await syncOfferPromotionForProduct(
      connection,
      ({
        id: result.insertId,
        name: String(name),
        price: Number(price),
        discount_price:
          discount_price === null || discount_price === undefined
            ? null
            : Number(discount_price),
        promotion_id:
          promotion_id === null || promotion_id === undefined
            ? null
            : Number(promotion_id),
      } as unknown) as ProductPromotionRow,
    );

    await connection.commit();

    return NextResponse.json(
      {
        message: "Producto creado correctamente",
        product_id: result.insertId,
      },
      { status: 201 },
    );
  } catch (error) {
    await connection.rollback();
    console.error("Error en POST /products:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}

export async function PATCH(req: Request) {
  const connection = await pool.getConnection();

  try {
    if (!validateBearer(req)) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const authUser = getAuthUser(req as NextRequest);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const {
      id,
      business_id,
      name,
      price,
      stock_average,
      stock_danger,
      description_short,
      discount_price,
      is_stock_available,
      status_id,
      product_category_id,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const access = await resolveBusinessAccess(
      authUser.user.id,
      Number.isFinite(Number(business_id)) ? Number(business_id) : null,
    );

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes negocio asignado" },
        { status: 403 },
      );
    }

    const [productRows] = await connection.query<ProductPromotionRow[]>(
      `
        SELECT id, name, price, discount_price, promotion_id
        FROM products
        WHERE id = ? AND business_id = ?
        LIMIT 1
      `,
      [id, access.businessId],
    );

    if (!productRows.length) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado para este negocio" },
        { status: 404 },
      );
    }

    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (name !== undefined) {
      const parsedName = String(name).trim();
      if (!parsedName) {
        return NextResponse.json({ error: "name inválido" }, { status: 400 });
      }
      fields.push("name = ?");
      values.push(parsedName);
    }

    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return NextResponse.json({ error: "price inválido" }, { status: 400 });
      }
      fields.push("price = ?");
      values.push(parsedPrice);
    }

    if (stock_average !== undefined) {
      const stock = Number(stock_average);
      if (Number.isNaN(stock) || stock < 0) {
        return NextResponse.json(
          { error: "stock_average inválido" },
          { status: 400 },
        );
      }

      fields.push("stock_average = ?");
      values.push(stock);
      fields.push("is_stock_available = ?");
      values.push(stock > 0 ? 1 : 0);
    }

    if (stock_danger !== undefined) {
      const dangerStock = Number(stock_danger);
      if (Number.isNaN(dangerStock) || dangerStock < 0) {
        return NextResponse.json(
          { error: "stock_danger inválido" },
          { status: 400 },
        );
      }
      fields.push("stock_danger = ?");
      values.push(dangerStock);
    }

    if (description_short !== undefined) {
      fields.push("description_short = ?");
      values.push(String(description_short).trim() || null);
    }

    if (discount_price !== undefined) {
      const parsedDiscountPrice = Number(discount_price);
      if (Number.isNaN(parsedDiscountPrice) || parsedDiscountPrice < 0) {
        return NextResponse.json(
          { error: "discount_price inválido" },
          { status: 400 },
        );
      }
      fields.push("discount_price = ?");
      values.push(parsedDiscountPrice || null);
    }

    if (is_stock_available !== undefined) {
      fields.push("is_stock_available = ?");
      values.push(is_stock_available ? 1 : 0);
    }

    if (status_id !== undefined) {
      const parsedStatusId = Number(status_id);
      if (Number.isNaN(parsedStatusId) || parsedStatusId <= 0) {
        return NextResponse.json(
          { error: "status_id inválido" },
          { status: 400 },
        );
      }
      fields.push("status_id = ?");
      values.push(parsedStatusId);
    }

    if (!fields.length) {
      if (product_category_id === undefined) {
        return NextResponse.json(
          { error: "Nada que actualizar" },
          { status: 400 },
        );
      }
    }

    await connection.beginTransaction();

    if (fields.length) {
      fields.push("updated_at = NOW()");
      values.push(id);

      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );

      if (!result.affectedRows) {
        await connection.rollback();
        return NextResponse.json(
          { error: `No se encontró producto con id=${id}` },
          { status: 404 },
        );
      }
    }

    if (product_category_id !== undefined) {
      await connection.query(
        "DELETE FROM product_category_map WHERE product_id = ?",
        [id],
      );
      await connection.query(
        `
          INSERT INTO product_category_map (product_id, category_id)
          VALUES (?, ?)
        `,
        [id, Number(product_category_id)],
      );
    }

    const [updatedProductRows] = await connection.query<ProductPromotionRow[]>(
      `
        SELECT id, name, price, discount_price, promotion_id
        FROM products
        WHERE id = ? AND business_id = ?
        LIMIT 1
      `,
      [id, access.businessId],
    );

    if (updatedProductRows[0]) {
      await syncOfferPromotionForProduct(connection, updatedProductRows[0]);
    }

    await connection.commit();

    return NextResponse.json({
      message: "OK",
      affectedRows: 1,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error en PATCH /products:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  } finally {
    connection.release();
  }
}

export async function DELETE(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    if (!validateBearer(req)) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const productId = Number(req.nextUrl.searchParams.get("id"));

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json(
        { success: false, error: "Producto inválido" },
        { status: 400 },
      );
    }

    const [productRows] = await connection.query<RowDataPacket[]>(
      `
        SELECT business_id
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId],
    );
    const businessId = Number(productRows[0]?.business_id ?? 0);

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 },
      );
    }

    const access = await resolveBusinessAccess(authUser.user.id, businessId);

    if (access.businessId !== businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso a este producto" },
        { status: 403 },
      );
    }

    await connection.beginTransaction();
    await connection.query(
      "DELETE FROM product_category_map WHERE product_id = ?",
      [productId],
    );
    const [result] = await connection.query<ResultSetHeader>(
      "DELETE FROM products WHERE id = ? AND business_id = ?",
      [productId, businessId],
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 },
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Producto eliminado correctamente",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error DELETE /api/business/products:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el producto.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
