import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool from "@/lib/db";

type CustomizationGroupRow = RowDataPacket & {
  id: number;
  name: string;
  max_selections: number | null;
  min_selections: number | null;
  is_required: number | boolean;
  sort_order: number | null;
};

type CustomizationOptionRow = RowDataPacket & {
  id: number;
  group_id: number;
  name: string;
  extra_price: number | string | null;
  sort_order: number | null;
  is_default: number | boolean;
};

type ProductCategoryRow = RowDataPacket & {
  id: number;
  category_name: string | null;
};

function getPresetGroups(categoryName?: string | null) {
  const normalizedCategory = String(categoryName ?? "").toLowerCase();

  if (normalizedCategory.includes("hamburg")) {
    return [
      {
        id: "preset-basic",
        name: "Personalización básica",
        maxSelections: 3,
        minSelections: 0,
        isRequired: false,
        source: "preset",
        options: [
          { id: "lechuga", name: "Lechuga", extraPrice: 0, isDefault: false },
          { id: "jitomate", name: "Jitomate", extraPrice: 0, isDefault: false },
          { id: "cebolla", name: "Cebolla", extraPrice: 0, isDefault: false },
        ],
      },
      {
        id: "preset-extras",
        name: "Extras",
        maxSelections: 2,
        minSelections: 0,
        isRequired: false,
        source: "preset",
        options: [
          {
            id: "queso-extra",
            name: "Queso extra",
            extraPrice: 10,
            isDefault: false,
          },
          {
            id: "papas-extra",
            name: "Papas extra",
            extraPrice: 20,
            isDefault: false,
          },
        ],
      },
    ];
  }

  if (normalizedCategory.includes("taco")) {
    return [
      {
        id: "preset-tacos",
        name: "Salsas y acompañamientos",
        maxSelections: 5,
        minSelections: 0,
        isRequired: false,
        source: "preset",
        options: [
          {
            id: "salsa-verde",
            name: "Salsa verde",
            extraPrice: 0,
            isDefault: false,
          },
          {
            id: "salsa-roja",
            name: "Salsa roja",
            extraPrice: 0,
            isDefault: false,
          },
          {
            id: "cilantro",
            name: "Cilantro",
            extraPrice: 0,
            isDefault: false,
          },
          {
            id: "cebolla",
            name: "Cebolla",
            extraPrice: 0,
            isDefault: false,
          },
          { id: "limon", name: "Limón", extraPrice: 0, isDefault: false },
        ],
      },
    ];
  }

  if (
    normalizedCategory.includes("cafe") ||
    normalizedCategory.includes("café")
  ) {
    return [
      {
        id: "preset-milk",
        name: "Tipo de leche",
        maxSelections: 1,
        minSelections: 0,
        isRequired: false,
        source: "preset",
        options: [
          {
            id: "leche-entera",
            name: "Leche entera",
            extraPrice: 0,
            isDefault: true,
          },
          {
            id: "leche-deslactosada",
            name: "Leche deslactosada",
            extraPrice: 0,
            isDefault: false,
          },
          {
            id: "leche-almendra",
            name: "Leche de almendra",
            extraPrice: 12,
            isDefault: false,
          },
        ],
      },
      {
        id: "preset-coffee-extras",
        name: "Extras",
        maxSelections: 2,
        minSelections: 0,
        isRequired: false,
        source: "preset",
        options: [
          {
            id: "sin-azucar",
            name: "Sin azúcar",
            extraPrice: 0,
            isDefault: false,
          },
          {
            id: "extra-shot",
            name: "Extra shot",
            extraPrice: 15,
            isDefault: false,
          },
        ],
      },
    ];
  }

  return [];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const productId = Number(id);

    if (!productId || Number.isNaN(productId)) {
      return NextResponse.json(
        { success: false, error: "Producto inválido" },
        { status: 400 },
      );
    }

    const [productRows] = await pool.query<ProductCategoryRow[]>(
      `
      SELECT
        p.id,
        pc.name AS category_name
      FROM products p
      LEFT JOIN product_category_map pcm ON pcm.product_id = p.id
      LEFT JOIN product_categories pc ON pc.id = pcm.category_id
      WHERE p.id = ?
      LIMIT 1
      `,
      [productId],
    );

    if (!productRows.length) {
      return NextResponse.json(
        { success: false, error: "Producto no encontrado" },
        { status: 404 },
      );
    }

    const [tableRows] = await pool.query<RowDataPacket[]>(
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

    const hasCustomizationTables = tableRows.length === 2;

    if (!hasCustomizationTables) {
      return NextResponse.json({
        success: true,
        source: "preset",
        groups: getPresetGroups(productRows[0].category_name),
      });
    }

    const [groupRows] = await pool.query<CustomizationGroupRow[]>(
      `
      SELECT
        id,
        name,
        max_selections,
        min_selections,
        is_required,
        sort_order
      FROM product_customization_groups
      WHERE product_id = ?
        AND is_active = 1
      ORDER BY sort_order ASC, id ASC
      `,
      [productId],
    );

    if (!groupRows.length) {
      return NextResponse.json({
        success: true,
        source: "preset",
        groups: getPresetGroups(productRows[0].category_name),
      });
    }

    const groupIds = groupRows.map((group) => group.id);
    const placeholders = groupIds.map(() => "?").join(", ");

    const [optionRows] = await pool.query<CustomizationOptionRow[]>(
      `
      SELECT
        id,
        group_id,
        name,
        extra_price,
        sort_order,
        is_default
      FROM product_customization_options
      WHERE group_id IN (${placeholders})
        AND is_active = 1
      ORDER BY sort_order ASC, id ASC
      `,
      groupIds,
    );

    const groupedOptions = new Map<number, CustomizationOptionRow[]>();

    optionRows.forEach((option) => {
      if (!groupedOptions.has(option.group_id)) {
        groupedOptions.set(option.group_id, []);
      }

      groupedOptions.get(option.group_id)?.push(option);
    });

    const groups = groupRows.map((group) => ({
      id: String(group.id),
      name: group.name,
      maxSelections: group.max_selections,
      minSelections: group.min_selections ?? 0,
      isRequired: Boolean(group.is_required),
      source: "database",
      options: (groupedOptions.get(group.id) ?? []).map((option) => ({
        id: String(option.id),
        name: option.name,
        extraPrice: Number(option.extra_price ?? 0),
        isDefault: Boolean(option.is_default),
      })),
    }));

    return NextResponse.json({
      success: true,
      source: "database",
      groups,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "No pudimos cargar las personalizaciones" },
      { status: 500 },
    );
  }
}
