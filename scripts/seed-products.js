const { PRODUCT_CATALOGS } = require("../prisma/seed-products");
const { assertSafeWriteTarget } = require("./lib/db-write-guard");
const { prisma } = require("./prisma-runtime");

assertSafeWriteTarget({
  operation: "scripts/seed-products.js",
});

const CLOUDINARY_BASE = "https://res.cloudinary.com/demo/image/upload";

const IMAGE_POOLS = {
  restaurante: [
    `${CLOUDINARY_BASE}/samples/food/spices`,
    `${CLOUDINARY_BASE}/samples/food/fish-vegetables`,
    `${CLOUDINARY_BASE}/samples/food/dessert`,
    `${CLOUDINARY_BASE}/samples/food/pot-mussels`,
    `${CLOUDINARY_BASE}/sample`,
  ],
  supermercado: [
    `${CLOUDINARY_BASE}/samples/ecommerce/accessories-bag`,
    `${CLOUDINARY_BASE}/samples/ecommerce/leather-bag-gray`,
    `${CLOUDINARY_BASE}/samples/ecommerce/analog-classic`,
    `${CLOUDINARY_BASE}/samples/ecommerce/shoes`,
    `${CLOUDINARY_BASE}/samples/coffee`,
  ],
  farmacia: [
    `${CLOUDINARY_BASE}/samples/people/bicycle`,
    `${CLOUDINARY_BASE}/samples/cloudinary-group`,
    `${CLOUDINARY_BASE}/sample`,
    `${CLOUDINARY_BASE}/samples/landscapes/nature-mountains`,
  ],
  regalos: [
    `${CLOUDINARY_BASE}/samples/ecommerce/accessories-bag`,
    `${CLOUDINARY_BASE}/samples/balloons`,
    `${CLOUDINARY_BASE}/samples/people/jazz`,
    `${CLOUDINARY_BASE}/sample`,
  ],
};

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCatalogKey(businessName, categoryNames) {
  const normalizedName = slugify(businessName);
  const normalizedCategories = categoryNames.map(slugify);

  if (
    normalizedCategories.some((category) =>
      ["regalos", "flores"].includes(category),
    ) ||
    normalizedName.includes("store") ||
    normalizedName.includes("regalo") ||
    normalizedName.includes("flor")
  ) {
    return "regalos";
  }

  if (
    normalizedCategories.some((category) => ["farmacia"].includes(category)) ||
    normalizedName.includes("farmacia")
  ) {
    return "farmacia";
  }

  if (
    normalizedCategories.some((category) =>
      ["supermercado", "abarrotes", "bebidas"].includes(category),
    ) ||
    normalizedName.includes("super")
  ) {
    return "supermercado";
  }

  if (
    normalizedCategories.some((category) =>
      [
        "restaurante",
        "comida",
        "pizza",
        "postres",
        "bebidas",
        "cafe-y-postres",
      ].includes(category),
    ) ||
    normalizedName.includes("comida") ||
    normalizedName.includes("food") ||
    normalizedName.includes("pizza")
  ) {
    return "restaurante";
  }

  return "restaurante";
}

function formatDescription(product) {
  const labels = [];

  if (product.badge === "Mas vendido") {
    labels.push("Mas vendido");
  }

  if (product.badge === "Nuevo") {
    labels.push("Nuevo");
  }

  return labels.length > 0
    ? `${labels.join(" · ")}. ${product.description}`
    : product.description;
}

async function getActiveStatusId() {
  const activeStatus = await prisma.status_catalog.findFirst({
    where: {
      OR: [{ name: "activo" }, { name: "active" }],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return activeStatus?.id ?? 1;
}

async function getProductCategories() {
  const categories = await prisma.product_categories.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: { id: "asc" },
  });

  return {
    categories,
    byName: new Map(
      categories.map((category) => [slugify(category.name), category]),
    ),
  };
}

function resolveCategory(categoryName, productCategoryMap) {
  const exact = productCategoryMap.get(slugify(categoryName));

  if (exact) {
    return exact;
  }

  for (const [key, category] of productCategoryMap.entries()) {
    if (
      key.includes(slugify(categoryName)) ||
      slugify(categoryName).includes(key)
    ) {
      return category;
    }
  }

  return null;
}

async function seedBusinessProducts({
  business,
  catalogKey,
  activeStatusId,
  productCategoryMap,
}) {
  const catalog = PRODUCT_CATALOGS[catalogKey] ?? PRODUCT_CATALOGS.restaurante;
  const imagePool = IMAGE_POOLS[catalogKey] ?? IMAGE_POOLS.restaurante;

  let created = 0;
  let skipped = 0;

  for (const [index, product] of catalog.entries()) {
    const sku = `${catalogKey.toUpperCase()}-${String(business.id).padStart(3, "0")}-${String(index + 1).padStart(3, "0")}`;
    const imageUrl = imagePool[index % imagePool.length];

    const existing = await prisma.products.findUnique({
      where: { sku },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const savedProduct = await prisma.products.create({
      data: {
        business_id: business.id,
        name: product.name,
        sku,
        description_short: formatDescription(product),
        description_long: `${product.description} Disponible para entrega rapida en Gogi Eats.`,
        price: product.price,
        discount_price: product.discountPrice ?? null,
        currency: "MXN",
        sale_format: "UNIDAD",
        tax_included: true,
        is_stock_available: true,
        stock_average: product.stock ?? 20,
        stock_danger: Math.max(3, Math.floor((product.stock ?? 20) * 0.2)),
        thumbnail_url: imageUrl,
        status_id: activeStatusId,
      },
      select: {
        id: true,
      },
    });

    const category = resolveCategory(product.categoryName, productCategoryMap);

    if (category) {
      await prisma.product_category_map.upsert({
        where: {
          product_id_category_id: {
            product_id: savedProduct.id,
            category_id: category.id,
          },
        },
        update: {},
        create: {
          product_id: savedProduct.id,
          category_id: category.id,
        },
      });
    }

    await prisma.product_images.create({
      data: {
        product_id: savedProduct.id,
        image_url: imageUrl,
        alt_text: product.name,
        sort_order: 1,
        is_primary: true,
      },
    });

    created += 1;
  }

  return {
    businessId: business.id,
    businessName: business.name,
    catalogKey,
    created,
    skipped,
  };
}

async function main() {
  const activeStatusId = await getActiveStatusId();
  const { categories, byName } = await getProductCategories();
  const businesses = await prisma.business.findMany({
    include: {
      business_category_map: {
        include: {
          business_categories: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  let totalCreated = 0;
  let totalSkipped = 0;
  const summary = [];

  for (const business of businesses) {
    const categoryNames = business.business_category_map.map(
      (item) => item.business_categories.name,
    );
    const catalogKey = getCatalogKey(business.name, categoryNames);

    const result = await seedBusinessProducts({
      business,
      catalogKey,
      activeStatusId,
      productCategoryMap: byName,
    });

    totalCreated += result.created;
    totalSkipped += result.skipped;
    summary.push(result);
  }

  console.log("\nSeed de productos completado.");
  console.log(`Negocios encontrados: ${businesses.length}`);
  console.log(`Categorias encontradas: ${categories.length}`);
  console.log(`Productos creados: ${totalCreated}`);
  console.log(`Productos omitidos por duplicado: ${totalSkipped}`);
  console.log("\nResumen por negocio:");

  for (const item of summary) {
    console.log(
      `- ${item.businessName} (${item.catalogKey}): ${item.created} creados, ${item.skipped} omitidos`,
    );
  }
}

main()
  .catch((error) => {
    console.error("Error ejecutando scripts/seed-products.js:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
