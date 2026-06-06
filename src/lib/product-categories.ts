import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";

export type ProductCategoryOption = {
  id: number;
  name: string;
};

type ProductCategorySeed = {
  name: string;
  description: string;
};

const GENERAL_PRODUCT_CATEGORIES = [
  { name: "abarrotes", description: "Abarrotes y productos básicos" },
  { name: "accesorios", description: "Accesorios y complementos" },
  { name: "bebidas", description: "Bebidas generales" },
  { name: "bebidas frias", description: "Bebidas frías y refrescantes" },
  { name: "botanas", description: "Botanas y antojos" },
  { name: "cafe", description: "Café y bebidas calientes" },
  { name: "carnes", description: "Carnes frescas y productos cárnicos" },
  { name: "combos", description: "Promociones y combos" },
  { name: "comida corrida", description: "Comida corrida y menús del día" },
  { name: "complementos", description: "Complementos y acompañamientos" },
  { name: "congelados", description: "Productos congelados y refrigerados" },
  { name: "desayunos", description: "Desayunos y brunch" },
  { name: "detalles", description: "Detalles y obsequios" },
  { name: "entradas", description: "Entradas y aperitivos" },
  { name: "extras", description: "Extras y adicionales" },
  { name: "farmacia basica", description: "Productos básicos de farmacia" },
  { name: "flores", description: "Flores y arreglos" },
  { name: "frutas", description: "Frutas frescas y de temporada" },
  { name: "globos", description: "Globos y decoración" },
  { name: "hamburguesas", description: "Productos tipo hamburguesa" },
  { name: "higiene personal", description: "Higiene y cuidado diario" },
  { name: "lacteos", description: "Leche, quesos, yogurt y derivados" },
  { name: "limpieza", description: "Productos de limpieza para el hogar" },
  { name: "mascotas", description: "Productos para mascotas" },
  { name: "medicamentos", description: "Medicamentos y tratamiento general" },
  { name: "organicos", description: "Productos orgánicos y naturales" },
  { name: "panaderia", description: "Pan fresco y bollería" },
  { name: "papas", description: "Papas, aros y acompañamientos" },
  { name: "pizzas", description: "Productos tipo pizza" },
  { name: "platillos", description: "Platillos fuertes y especialidades" },
  { name: "postres", description: "Pasteles, pays y dulces" },
  { name: "primeros auxilios", description: "Curación y primeros auxilios" },
  { name: "regalos", description: "Regalos y obsequios" },
  { name: "snacks", description: "Snacks y colaciones" },
  { name: "supermercado", description: "Abarrotes y productos básicos" },
  { name: "verduras", description: "Verduras frescas y de temporada" },
] satisfies ProductCategorySeed[];

const CATEGORY_RULES: Array<{
  businessNames: string[];
  allowedCategoryNames: string[];
}> = [
  {
    businessNames: ["supermercado", "abarrotes"],
    allowedCategoryNames: [
      "abarrotes",
      "bebidas",
      "botanas",
      "carnes",
      "congelados",
      "farmacia basica",
      "frutas",
      "lacteos",
      "limpieza",
      "mascotas",
      "verduras",
    ],
  },
  {
    businessNames: ["restaurante", "tacos", "pollo", "mariscos", "sushi"],
    allowedCategoryNames: [
      "bebidas",
      "combos",
      "comida corrida",
      "desayunos",
      "entradas",
      "platillos",
      "postres",
    ],
  },
  {
    businessNames: ["hamburguesas"],
    allowedCategoryNames: [
      "bebidas",
      "combos",
      "extras",
      "hamburguesas",
      "papas",
      "postres",
    ],
  },
  {
    businessNames: ["pizza", "pizzas"],
    allowedCategoryNames: [
      "bebidas",
      "combos",
      "complementos",
      "pizzas",
      "postres",
    ],
  },
  {
    businessNames: ["cafe y postres", "cafeteria", "café y postres"],
    allowedCategoryNames: [
      "bebidas frias",
      "cafe",
      "desayunos",
      "panaderia",
      "postres",
      "snacks",
    ],
  },
  {
    businessNames: ["farmacia"],
    allowedCategoryNames: [
      "bebes",
      "cuidado personal",
      "higiene personal",
      "medicamentos",
      "primeros auxilios",
    ],
  },
  {
    businessNames: ["regalos", "tienda", "tienda de regalos"],
    allowedCategoryNames: [
      "accesorios",
      "detalles",
      "flores",
      "globos",
      "regalos",
    ],
  },
];

// Extend the catalog with categories referenced by rules.
const RUNTIME_ONLY_CATEGORIES = [
  { name: "bebes", description: "Productos para bebés" },
  { name: "cuidado personal", description: "Cuidado personal y belleza" },
] satisfies ProductCategorySeed[];

const PRODUCT_CATEGORY_CATALOG = [
  ...GENERAL_PRODUCT_CATEGORIES,
  ...RUNTIME_ONLY_CATEGORIES,
];

function normalizeCategoryName(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export async function ensureProductCategoryCatalog() {
  const values = PRODUCT_CATEGORY_CATALOG.map((category) => [
    category.name,
    category.description,
  ]);

  if (values.length === 0) return;

  await pool.query<ResultSetHeader>(
    `
      INSERT IGNORE INTO product_categories (name, description, created_at, updated_at)
      VALUES ${values.map(() => "(?, ?, NOW(), NOW())").join(", ")}
    `,
    values.flat(),
  );
}

export function getProductCategoriesForBusiness(
  businessCategoryName: string | null | undefined,
  categories: ProductCategoryOption[],
) {
  const normalizedBusinessCategory =
    normalizeCategoryName(businessCategoryName);

  if (!normalizedBusinessCategory) {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  const matchedRule = CATEGORY_RULES.find((rule) =>
    rule.businessNames.some(
      (businessName) =>
        normalizedBusinessCategory === normalizeCategoryName(businessName),
    ),
  );

  if (!matchedRule) {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  const allowedNames = new Set(
    matchedRule.allowedCategoryNames.map((name) => normalizeCategoryName(name)),
  );

  const filtered = categories.filter((category) =>
    allowedNames.has(normalizeCategoryName(category.name)),
  );

  if (filtered.length === 0) {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  const unique = new Map<string, ProductCategoryOption>();

  for (const category of filtered) {
    const key = normalizeCategoryName(category.name);
    if (!unique.has(key)) {
      unique.set(key, category);
    }
  }

  return Array.from(unique.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

type BusinessCategoryRow = RowDataPacket & {
  category_name: string | null;
};

export async function getBusinessCategoryName(businessId: number) {
  const [rows] = await pool.query<BusinessCategoryRow[]>(
    `
      SELECT bc.name AS category_name
      FROM business b
      LEFT JOIN business_category_map bcm ON bcm.business_id = b.id
      LEFT JOIN business_categories bc ON bc.id = bcm.category_id
      WHERE b.id = ?
      LIMIT 1
    `,
    [businessId],
  );

  return rows[0]?.category_name ?? null;
}
