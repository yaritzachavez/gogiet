import dotenv from "dotenv";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

type CountRow = RowDataPacket & { count: number };
type IdRow = RowDataPacket & { id: number };
type TableRow = RowDataPacket & { table_name: string };
type ColumnRow = RowDataPacket & { column_name: string };

type CleanupSummary = {
  database: string;
  confirmed: boolean;
  tables: {
    businessTable: string | null;
    businesses: number;
    products: number;
    productImages: number;
    relations: Record<string, number>;
  };
  affectedIds: {
    businesses: number;
    products: number;
    carts: number;
    orders: number;
    deliveries: number;
    productCategories: number;
    businessCategories: number;
  };
};

const CONFIRMATION_VARIABLE = "CONFIRM_CLEANUP_TEST_DATA";
const CONFIRMATION_VALUE = "true";

function resolveSslConfig() {
  const caCertificate = process.env.DB_CA || process.env.DB_SSL_CA;

  if (!caCertificate || !caCertificate.includes("BEGIN CERTIFICATE")) {
    return { rejectUnauthorized: false };
  }

  return {
    ca: caCertificate.replace(/\\n/g, "\n"),
  };
}

function getConnectionConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
      ssl: resolveSslConfig(),
      multipleStatements: false,
    };
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
    database: process.env.DB_NAME,
    ssl: resolveSslConfig(),
    multipleStatements: false,
  };
}

function assertSafeIdentifier(identifier: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
    throw new Error(`Identificador SQL inseguro: ${identifier}`);
  }
  return `\`${identifier}\``;
}

function placeholders(values: readonly unknown[]) {
  if (values.length === 0) {
    throw new Error("No se puede construir IN() con una lista vacía.");
  }
  return values.map(() => "?").join(", ");
}

async function listTables(connection: Connection) {
  const [rows] = await connection.query<TableRow[]>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `,
  );

  return new Set(rows.map((row) => row.table_name));
}

async function listColumns(connection: Connection, table: string) {
  const [rows] = await connection.query<ColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
    `,
    [table],
  );

  return new Set(rows.map((row) => row.column_name));
}

async function countRows(
  connection: Connection,
  table: string,
  where = "1 = 1",
  params: unknown[] = [],
) {
  const [rows] = await connection.query<CountRow[]>(
    `SELECT COUNT(*) AS count FROM ${assertSafeIdentifier(table)} WHERE ${where}`,
    params,
  );

  return Number(rows[0]?.count ?? 0);
}

async function selectIds(
  connection: Connection,
  table: string,
  idColumn: string,
  where = "1 = 1",
  params: unknown[] = [],
) {
  const [rows] = await connection.query<IdRow[]>(
    `
      SELECT ${assertSafeIdentifier(idColumn)} AS id
      FROM ${assertSafeIdentifier(table)}
      WHERE ${where}
    `,
    params,
  );

  return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
}

async function deleteRows(
  connection: Connection,
  tableNames: Set<string>,
  table: string,
  where = "1 = 1",
  params: unknown[] = [],
) {
  if (!tableNames.has(table)) {
    return 0;
  }

  const [result] = await connection.query<mysql.ResultSetHeader>(
    `DELETE FROM ${assertSafeIdentifier(table)} WHERE ${where}`,
    params,
  );

  return Number(result.affectedRows ?? 0);
}

async function safeCount(
  connection: Connection,
  tableNames: Set<string>,
  table: string,
  where = "1 = 1",
  params: unknown[] = [],
) {
  if (!tableNames.has(table)) {
    return 0;
  }

  return countRows(connection, table, where, params);
}

async function safeIds(
  connection: Connection,
  tableNames: Set<string>,
  table: string,
  idColumn: string,
  where = "1 = 1",
  params: unknown[] = [],
) {
  if (!tableNames.has(table)) {
    return [];
  }

  return selectIds(connection, table, idColumn, where, params);
}

async function getOrderStatusId(connection: Connection, names: string[]) {
  if (names.length === 0) {
    return null;
  }

  const [rows] = await connection.query<IdRow[]>(
    `
      SELECT id
      FROM order_status_catalog
      WHERE LOWER(TRIM(name)) IN (${placeholders(names)})
      ORDER BY id ASC
      LIMIT 1
    `,
    names.map((name) => name.toLowerCase()),
  );

  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function collectState(connection: Connection, tableNames: Set<string>) {
  const businessTable = tableNames.has("business")
    ? "business"
    : tableNames.has("businesses")
      ? "businesses"
      : null;
  const businessIds = businessTable
    ? await selectIds(connection, businessTable, "id")
    : [];
  const productIds = await safeIds(connection, tableNames, "products", "id");

  const businessIdClause = businessIds.length
    ? `business_id IN (${placeholders(businessIds)})`
    : "1 = 0";
  const productIdClause = productIds.length
    ? `product_id IN (${placeholders(productIds)})`
    : "1 = 0";

  const productCategoryIds = await safeIds(
    connection,
    tableNames,
    "product_category_map",
    "category_id",
    productIdClause,
    productIds,
  );
  const businessCategoryIds = await safeIds(
    connection,
    tableNames,
    "business_category_map",
    "category_id",
    businessIdClause,
    businessIds,
  );
  const cartIds = await safeIds(
    connection,
    tableNames,
    "products_cart",
    "cart_id",
    productIdClause,
    productIds,
  );
  const orderIdsByBusiness = await safeIds(
    connection,
    tableNames,
    "orders",
    "id",
    businessIdClause,
    businessIds,
  );
  const orderIdsByItems = await safeIds(
    connection,
    tableNames,
    "order_items",
    "order_id",
    productIdClause,
    productIds,
  );
  const orderIds = Array.from(
    new Set([...orderIdsByBusiness, ...orderIdsByItems]),
  );
  const orderIdClause = orderIds.length
    ? `order_id IN (${placeholders(orderIds)})`
    : "1 = 0";
  const deliveryIds = await safeIds(
    connection,
    tableNames,
    "delivery",
    "id",
    orderIdClause,
    orderIds,
  );

  return {
    businessTable,
    businessIds,
    productIds,
    productCategoryIds: Array.from(new Set(productCategoryIds)),
    businessCategoryIds: Array.from(new Set(businessCategoryIds)),
    cartIds: Array.from(new Set(cartIds)),
    orderIds,
    deliveryIds,
  };
}

async function buildSummary(
  connection: Connection,
  tableNames: Set<string>,
  confirmed: boolean,
) {
  const state = await collectState(connection, tableNames);
  const businessIds = state.businessIds;
  const productIds = state.productIds;
  const orderIds = state.orderIds;

  const businessIdClause = businessIds.length
    ? `business_id IN (${placeholders(businessIds)})`
    : "1 = 0";
  const productIdClause = productIds.length
    ? `product_id IN (${placeholders(productIds)})`
    : "1 = 0";
  const relations: Record<string, number> = {
    product_category_map: await safeCount(
      connection,
      tableNames,
      "product_category_map",
      productIdClause,
      productIds,
    ),
    products_cart: await safeCount(
      connection,
      tableNames,
      "products_cart",
      productIdClause,
      productIds,
    ),
    cart: state.cartIds.length,
    favorites: await safeCount(
      connection,
      tableNames,
      "favorites",
      `
        (LOWER(favorite_type) IN ('product', 'products', 'producto')
          AND target_id IN (${productIds.length ? placeholders(productIds) : "NULL"}))
        OR
        (LOWER(favorite_type) IN ('business', 'businesses', 'negocio', 'tienda')
          AND target_id IN (${businessIds.length ? placeholders(businessIds) : "NULL"}))
      `,
      [...productIds, ...businessIds],
    ),
    reviews: await safeCount(
      connection,
      tableNames,
      "reviews",
      `
        (order_id IN (${orderIds.length ? placeholders(orderIds) : "NULL"}))
        OR
        (LOWER(review_type) IN ('product', 'products', 'producto')
          AND target_id IN (${productIds.length ? placeholders(productIds) : "NULL"}))
        OR
        (LOWER(review_type) IN ('business', 'businesses', 'negocio', 'tienda')
          AND target_id IN (${businessIds.length ? placeholders(businessIds) : "NULL"}))
      `,
      [...orderIds, ...productIds, ...businessIds],
    ),
    order_items: await safeCount(
      connection,
      tableNames,
      "order_items",
      orderIds.length
        ? `order_id IN (${placeholders(orderIds)})`
        : productIdClause,
      orderIds.length ? orderIds : productIds,
    ),
    orders: orderIds.length,
    business_images: await safeCount(
      connection,
      tableNames,
      "business_images",
      businessIdClause,
      businessIds,
    ),
    business_hours: await safeCount(
      connection,
      tableNames,
      "business_hours",
      businessIdClause,
      businessIds,
    ),
    business_details: await safeCount(
      connection,
      tableNames,
      "business_details",
      businessIdClause,
      businessIds,
    ),
    business_managers: await safeCount(
      connection,
      tableNames,
      "business_managers",
      businessIdClause,
      businessIds,
    ),
    business_owners: await safeCount(
      connection,
      tableNames,
      "business_owners",
      businessIdClause,
      businessIds,
    ),
    business_category_map: await safeCount(
      connection,
      tableNames,
      "business_category_map",
      businessIdClause,
      businessIds,
    ),
  };

  const [databaseRows] = await connection.query<RowDataPacket[]>(
    "SELECT DATABASE() AS database_name",
  );

  return {
    database: String(databaseRows[0]?.database_name ?? ""),
    confirmed,
    tables: {
      businessTable: state.businessTable,
      businesses: state.businessTable
        ? await countRows(connection, state.businessTable)
        : 0,
      products: await safeCount(connection, tableNames, "products"),
      productImages: await safeCount(connection, tableNames, "product_images"),
      relations,
    },
    affectedIds: {
      businesses: state.businessIds.length,
      products: state.productIds.length,
      carts: state.cartIds.length,
      orders: state.orderIds.length,
      deliveries: state.deliveryIds.length,
      productCategories: state.productCategoryIds.length,
      businessCategories: state.businessCategoryIds.length,
    },
  } satisfies CleanupSummary;
}

async function deleteByIds(
  connection: Connection,
  tableNames: Set<string>,
  table: string,
  column: string,
  ids: readonly number[],
) {
  if (!ids.length) {
    return 0;
  }

  return deleteRows(
    connection,
    tableNames,
    table,
    `${assertSafeIdentifier(column)} IN (${placeholders(ids)})`,
    Array.from(ids),
  );
}

async function cleanupData(connection: Connection, tableNames: Set<string>) {
  const state = await collectState(connection, tableNames);
  const deleted: Record<string, number> = {};
  const productIds = state.productIds;
  const businessIds = state.businessIds;
  const orderIds = state.orderIds;
  const deliveryIds = state.deliveryIds;
  const cartIds = state.cartIds;

  const orderStatusCancelledId =
    tableNames.has("order_status_catalog") && orderIds.length
      ? await getOrderStatusId(connection, ["cancelled", "cancelado"])
      : null;

  if (orderStatusCancelledId) {
    await connection.query(
      `
        UPDATE orders
        SET order_status_id = ?,
            cancelled_at = COALESCE(cancelled_at, NOW()),
            customer_notes = CONCAT(COALESCE(customer_notes, ''), ' [cleanup:test-data]'),
            updated_at = NOW()
        WHERE id IN (${placeholders(orderIds)})
      `,
      [orderStatusCancelledId, ...orderIds],
    );
  }

  deleted.product_images = await deleteByIds(
    connection,
    tableNames,
    "product_images",
    "product_id",
    productIds,
  );
  deleted.product_category_map = await deleteByIds(
    connection,
    tableNames,
    "product_category_map",
    "product_id",
    productIds,
  );
  deleted.products_cart = await deleteByIds(
    connection,
    tableNames,
    "products_cart",
    "product_id",
    productIds,
  );
  deleted.cart = await deleteByIds(
    connection,
    tableNames,
    "cart",
    "id",
    cartIds,
  );
  deleted.favorites_products = productIds.length
    ? await deleteRows(
        connection,
        tableNames,
        "favorites",
        `
          LOWER(favorite_type) IN ('product', 'products', 'producto')
          AND target_id IN (${placeholders(productIds)})
        `,
        productIds,
      )
    : 0;
  deleted.favorites_businesses = businessIds.length
    ? await deleteRows(
        connection,
        tableNames,
        "favorites",
        `
          LOWER(favorite_type) IN ('business', 'businesses', 'negocio', 'tienda')
          AND target_id IN (${placeholders(businessIds)})
        `,
        businessIds,
      )
    : 0;
  deleted.reviews_orders = await deleteByIds(
    connection,
    tableNames,
    "reviews",
    "order_id",
    orderIds,
  );
  deleted.reviews_products = productIds.length
    ? await deleteRows(
        connection,
        tableNames,
        "reviews",
        `
          LOWER(review_type) IN ('product', 'products', 'producto')
          AND target_id IN (${placeholders(productIds)})
        `,
        productIds,
      )
    : 0;
  deleted.reviews_businesses = businessIds.length
    ? await deleteRows(
        connection,
        tableNames,
        "reviews",
        `
          LOWER(review_type) IN ('business', 'businesses', 'negocio', 'tienda')
          AND target_id IN (${placeholders(businessIds)})
        `,
        businessIds,
      )
    : 0;

  deleted.delivery_metrics = await deleteByIds(
    connection,
    tableNames,
    "delivery_metrics",
    "delivery_id",
    deliveryIds,
  );
  deleted.delivery_payments = await deleteByIds(
    connection,
    tableNames,
    "delivery_payments",
    "delivery_id",
    deliveryIds,
  );
  deleted.delivery_tips_by_delivery = await deleteByIds(
    connection,
    tableNames,
    "delivery_tips",
    "delivery_id",
    deliveryIds,
  );
  deleted.delivery_tips_by_order = await deleteByIds(
    connection,
    tableNames,
    "delivery_tips",
    "order_id",
    orderIds,
  );
  deleted.delivery = await deleteByIds(
    connection,
    tableNames,
    "delivery",
    "id",
    deliveryIds,
  );
  deleted.driver_earnings = await deleteByIds(
    connection,
    tableNames,
    "driver_earnings",
    "order_id",
    orderIds,
  );
  deleted.admin_messages = await deleteByIds(
    connection,
    tableNames,
    "admin_messages",
    "order_id",
    orderIds,
  );
  deleted.payments = await deleteByIds(
    connection,
    tableNames,
    "payments",
    "order_id",
    orderIds,
  );
  deleted.order_notes = await deleteByIds(
    connection,
    tableNames,
    "order_notes",
    "order_id",
    orderIds,
  );
  deleted.order_items = orderIds.length
    ? await deleteByIds(
        connection,
        tableNames,
        "order_items",
        "order_id",
        orderIds,
      )
    : await deleteByIds(
        connection,
        tableNames,
        "order_items",
        "product_id",
        productIds,
      );
  deleted.orders = await deleteByIds(
    connection,
    tableNames,
    "orders",
    "id",
    orderIds,
  );

  deleted.products = await deleteByIds(
    connection,
    tableNames,
    "products",
    "id",
    productIds,
  );

  if (state.productCategoryIds.length) {
    deleted.product_categories = await deleteRows(
      connection,
      tableNames,
      "product_categories",
      `
        id IN (${placeholders(state.productCategoryIds)})
        AND NOT EXISTS (
          SELECT 1
          FROM product_category_map pcm
          WHERE pcm.category_id = product_categories.id
        )
      `,
      state.productCategoryIds,
    );
  }

  deleted.business_images = await deleteByIds(
    connection,
    tableNames,
    "business_images",
    "business_id",
    businessIds,
  );
  deleted.business_hours = await deleteByIds(
    connection,
    tableNames,
    "business_hours",
    "business_id",
    businessIds,
  );
  deleted.business_details = await deleteByIds(
    connection,
    tableNames,
    "business_details",
    "business_id",
    businessIds,
  );
  deleted.business_managers = await deleteByIds(
    connection,
    tableNames,
    "business_managers",
    "business_id",
    businessIds,
  );
  deleted.business_owners = await deleteByIds(
    connection,
    tableNames,
    "business_owners",
    "business_id",
    businessIds,
  );
  deleted.business_category_map = await deleteByIds(
    connection,
    tableNames,
    "business_category_map",
    "business_id",
    businessIds,
  );

  if (tableNames.has("delivery_settlements")) {
    const settlementColumns = await listColumns(
      connection,
      "delivery_settlements",
    );
    if (settlementColumns.has("business_id")) {
      deleted.delivery_settlements = await deleteByIds(
        connection,
        tableNames,
        "delivery_settlements",
        "business_id",
        businessIds,
      );
    }
  }

  if (state.businessCategoryIds.length) {
    deleted.business_categories = await deleteRows(
      connection,
      tableNames,
      "business_categories",
      `
        id IN (${placeholders(state.businessCategoryIds)})
        AND NOT EXISTS (
          SELECT 1
          FROM business_category_map bcm
          WHERE bcm.category_id = business_categories.id
        )
      `,
      state.businessCategoryIds,
    );
  }

  if (state.businessTable) {
    deleted[state.businessTable] = await deleteByIds(
      connection,
      tableNames,
      state.businessTable,
      "id",
      businessIds,
    );
  }

  return deleted;
}

async function resetAutoIncrementIfEmpty(
  connection: Connection,
  tableNames: Set<string>,
  table: string,
) {
  if (!tableNames.has(table)) {
    return false;
  }

  const remaining = await countRows(connection, table);
  if (remaining !== 0) {
    return false;
  }

  await connection.query(
    `ALTER TABLE ${assertSafeIdentifier(table)} AUTO_INCREMENT = 1`,
  );
  return true;
}

async function verifyCleanup(
  connection: Connection,
  tableNames: Set<string>,
  businessTable: string | null,
) {
  const checks: Record<string, number> = {};

  checks.businesses_remaining =
    businessTable && tableNames.has(businessTable)
      ? await countRows(connection, businessTable)
      : 0;
  checks.products_remaining = await safeCount(
    connection,
    tableNames,
    "products",
  );
  checks.product_images_orphaned =
    tableNames.has("product_images") && tableNames.has("products")
      ? await countRows(
          connection,
          "product_images",
          "NOT EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id)",
        )
      : 0;
  checks.product_category_map_orphaned =
    tableNames.has("product_category_map") && tableNames.has("products")
      ? await countRows(
          connection,
          "product_category_map",
          "NOT EXISTS (SELECT 1 FROM products p WHERE p.id = product_category_map.product_id)",
        )
      : 0;
  checks.products_cart_orphaned =
    tableNames.has("products_cart") && tableNames.has("products")
      ? await countRows(
          connection,
          "products_cart",
          "NOT EXISTS (SELECT 1 FROM products p WHERE p.id = products_cart.product_id)",
        )
      : 0;
  checks.order_items_orphaned =
    tableNames.has("order_items") && tableNames.has("products")
      ? await countRows(
          connection,
          "order_items",
          "NOT EXISTS (SELECT 1 FROM products p WHERE p.id = order_items.product_id)",
        )
      : 0;

  return checks;
}

async function main() {
  const confirmed =
    String(process.env[CONFIRMATION_VARIABLE] ?? "")
      .trim()
      .toLowerCase() === CONFIRMATION_VALUE;
  const connection = await mysql.createConnection(getConnectionConfig());

  try {
    const tableNames = await listTables(connection);
    const summary = await buildSummary(connection, tableNames, confirmed);

    console.log("[cleanup-test-stores-products] Resumen previo");
    console.log(JSON.stringify(summary, null, 2));

    if (!summary.tables.businessTable) {
      throw new Error("No se encontró tabla business/businesses.");
    }

    if (!confirmed) {
      console.log(
        `[cleanup-test-stores-products] Modo seguro: no se ejecutó limpieza. Define ${CONFIRMATION_VARIABLE}=true para aplicar.`,
      );
      return;
    }

    await connection.beginTransaction();

    try {
      const deleted = await cleanupData(connection, tableNames);
      await connection.commit();
      console.log("[cleanup-test-stores-products] Limpieza aplicada");
      console.log(JSON.stringify({ deleted }, null, 2));
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const resetTables = [
      "product_images",
      "product_categories",
      "cart",
      "business_images",
      "business_hours",
      "business_categories",
      "products",
      summary.tables.businessTable,
    ].filter(Boolean) as string[];
    const autoIncrementReset: Record<string, boolean> = {};

    for (const table of resetTables) {
      autoIncrementReset[table] = await resetAutoIncrementIfEmpty(
        connection,
        tableNames,
        table,
      );
    }

    const verification = await verifyCleanup(
      connection,
      tableNames,
      summary.tables.businessTable,
    );

    console.log("[cleanup-test-stores-products] Verificación posterior");
    console.log(JSON.stringify({ autoIncrementReset, verification }, null, 2));

    const failedChecks = Object.entries(verification).filter(
      ([, value]) => Number(value) !== 0,
    );
    if (failedChecks.length) {
      throw new Error(
        `La limpieza terminó con verificaciones pendientes: ${JSON.stringify(
          failedChecks,
        )}`,
      );
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[cleanup-test-stores-products] ERROR");
  console.error(error);
  process.exitCode = 1;
});
