#!/usr/bin/env node

const {
  assertSafeWriteTarget,
  buildSanitizedDbOperationSummary,
} = require("./lib/db-write-guard");
const {
  QA_EMAIL_DOMAIN,
  STAGING_QA_FIXTURES,
  STAGING_QA_TAG,
  buildStagingQaManifest,
} = require("./lib/staging-qa-fixtures");
const { prisma } = require("./prisma-runtime");
const { formatVerificationOutput } = require("./verify-staging-environment");

const WRITE_OPERATION = "scripts/cleanup-staging-qa.js --write";
const CONFIRMATION_ENV_VAR = "CONFIRM_STAGING_QA_CLEANUP";
const CONFIRMATION_VALUE = "DELETE_QA_DATA_ONLY";
const BLOCKED_ENVIRONMENT_MESSAGE =
  "CLEANUP BLOCKED: PRODUCTION OR UNVERIFIED ENVIRONMENT";
const DRY_RUN_MESSAGE = "DRY RUN ONLY — NO DATA MODIFIED";

const DELETE_ORDER = Object.freeze([
  "support_messages",
  "notifications",
  "auth_audit_logs",
  "audit_logs",
  "delivery_metrics",
  "delivery_payments",
  "delivery_tips",
  "payments",
  "order_notes",
  "admin_messages",
  "reviews",
  "order_items",
  "delivery",
  "orders",
  "products_cart",
  "cart",
  "favorites",
  "product_images",
  "product_category_map",
  "products",
  "business_category_map",
  "business_images",
  "business_hours",
  "business_details",
  "business_managers",
  "business_owners",
  "shipping_zones",
  "business",
  "password_reset_tokens",
  "user_sessions",
  "user_roles",
  "support_conversations",
  "addresses",
  "users",
]);

function getCliArgs(argv = process.argv.slice(2)) {
  return {
    write: argv.includes("--write"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--write"),
  };
}

function buildCleanupSelectors() {
  return {
    manifestTag: STAGING_QA_TAG,
    qaEmailDomain: QA_EMAIL_DOMAIN,
    fixtureEmails: Object.values(STAGING_QA_FIXTURES.users).map(
      (user) => user.email,
    ),
    businessName: STAGING_QA_FIXTURES.business.name,
    businessEmail: STAGING_QA_FIXTURES.business.email,
    businessNotes: STAGING_QA_FIXTURES.business.notes,
    productSku: STAGING_QA_FIXTURES.product.sku,
    productName: STAGING_QA_FIXTURES.product.name,
    shippingZoneName: STAGING_QA_FIXTURES.shippingZone.nombre,
    addressLabel: STAGING_QA_FIXTURES.address.label,
    addressReferenceNotes: STAGING_QA_FIXTURES.address.referenceNotes,
  };
}

function buildEmptyScope() {
  return {
    userIds: [],
    businessIds: [],
    productIds: [],
    orderIds: [],
    cartIds: [],
    addressIds: [],
    deliveryIds: [],
    conversationIds: [],
    businessCategoryIds: [],
    productCategoryIds: [],
  };
}

function buildScopeSummary(scope) {
  return {
    users: scope.userIds.length,
    businesses: scope.businessIds.length,
    products: scope.productIds.length,
    orders: scope.orderIds.length,
    carts: scope.cartIds.length,
    addresses: scope.addressIds.length,
    deliveries: scope.deliveryIds.length,
    supportConversations: scope.conversationIds.length,
    businessCategories: scope.businessCategoryIds.length,
    productCategories: scope.productCategoryIds.length,
  };
}

function buildDryRunPreview({
  env = process.env,
  verification = formatVerificationOutput(env),
  scope = buildEmptyScope(),
  databaseAudited = false,
} = {}) {
  return {
    mode: "dry-run",
    operation: WRITE_OPERATION,
    confirmationEnvVar: CONFIRMATION_ENV_VAR,
    confirmationRequired: CONFIRMATION_VALUE,
    result: DRY_RUN_MESSAGE,
    environmentVerified: verification.result === "STAGING ENVIRONMENT VERIFIED",
    blockedReason:
      verification.result === "STAGING ENVIRONMENT VERIFIED"
        ? null
        : BLOCKED_ENVIRONMENT_MESSAGE,
    verification,
    guard: buildSanitizedDbOperationSummary({
      operation: WRITE_OPERATION,
      mode: "read",
      env,
    }),
    manifest: buildStagingQaManifest(),
    selectors: buildCleanupSelectors(),
    deleteOrder: [...DELETE_ORDER],
    scope: buildScopeSummary(scope),
    databaseAudited,
    writesExecuted: false,
  };
}

function assertExplicitConfirmation(env = process.env) {
  if (env[CONFIRMATION_ENV_VAR] !== CONFIRMATION_VALUE) {
    throw new Error(
      `${BLOCKED_ENVIRONMENT_MESSAGE}: set ${CONFIRMATION_ENV_VAR}=${CONFIRMATION_VALUE}`,
    );
  }
}

function uniqueIds(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Number.isInteger))];
}

async function collectQaScope({ db = prisma } = {}) {
  const selectors = buildCleanupSelectors();
  const users = await db.user.findMany({
    where: {
      email: {
        endsWith: `@${selectors.qaEmailDomain}`,
      },
    },
    select: {
      id: true,
      email: true,
    },
  });
  const userIds = uniqueIds(users, "id");

  const businesses = await db.business.findMany({
    where: {
      OR: [
        { email: selectors.businessEmail },
        { name: selectors.businessName },
        { address_notes: selectors.businessNotes },
      ],
    },
    select: {
      id: true,
    },
  });
  const businessIds = uniqueIds(businesses, "id");

  const products = await db.products.findMany({
    where: {
      OR: [
        { sku: selectors.productSku },
        { name: selectors.productName },
        businessIds.length > 0 ? { business_id: { in: businessIds } } : null,
      ].filter(Boolean),
    },
    select: {
      id: true,
    },
  });
  const productIds = uniqueIds(products, "id");

  const addresses = await db.addresses.findMany({
    where: {
      OR: [
        { label: selectors.addressLabel },
        { reference_notes: selectors.addressReferenceNotes },
        userIds.length > 0 ? { user_id: { in: userIds } } : null,
      ].filter(Boolean),
    },
    select: {
      id: true,
    },
  });
  const addressIds = uniqueIds(addresses, "id");

  const carts = await db.cart.findMany({
    where: userIds.length > 0 ? { user_id: { in: userIds } } : { id: -1 },
    select: {
      id: true,
    },
  });
  const cartIds = uniqueIds(carts, "id");

  const orders = await db.orders.findMany({
    where: {
      OR: [
        userIds.length > 0 ? { user_id: { in: userIds } } : null,
        businessIds.length > 0 ? { business_id: { in: businessIds } } : null,
        addressIds.length > 0 ? { address_id: { in: addressIds } } : null,
        cartIds.length > 0 ? { cart_id: { in: cartIds } } : null,
      ].filter(Boolean),
    },
    select: {
      id: true,
    },
  });
  const orderIds = uniqueIds(orders, "id");

  const deliveries = await db.delivery.findMany({
    where: {
      OR: [
        orderIds.length > 0 ? { order_id: { in: orderIds } } : null,
        userIds.length > 0 ? { driver_user_id: { in: userIds } } : null,
      ].filter(Boolean),
    },
    select: {
      id: true,
    },
  });
  const deliveryIds = uniqueIds(deliveries, "id");

  const conversations = await db.support_conversations.findMany({
    where: {
      OR: [
        userIds.length > 0 ? { requester_user_id: { in: userIds } } : null,
        userIds.length > 0 ? { assigned_admin_id: { in: userIds } } : null,
      ].filter(Boolean),
    },
    select: {
      id: true,
    },
  });
  const conversationIds = uniqueIds(conversations, "id");

  const productCategoryMaps = await db.product_category_map.findMany({
    where:
      productIds.length > 0
        ? { product_id: { in: productIds } }
        : { product_id: -1 },
    select: {
      category_id: true,
      product_id: true,
    },
  });
  const productCategoryIds = uniqueIds(productCategoryMaps, "category_id");

  const businessCategoryMaps = await db.business_category_map.findMany({
    where:
      businessIds.length > 0
        ? { business_id: { in: businessIds } }
        : { business_id: -1 },
    select: {
      category_id: true,
      business_id: true,
    },
  });
  const businessCategoryIds = uniqueIds(businessCategoryMaps, "category_id");

  return {
    userIds,
    businessIds,
    productIds,
    orderIds,
    cartIds,
    addressIds,
    deliveryIds,
    conversationIds,
    productCategoryIds,
    businessCategoryIds,
  };
}

async function deleteManyIf({ tx, model, where, run }) {
  if (!run) {
    return 0;
  }

  const result = await tx[model].deleteMany({ where });
  return result.count;
}

function createDeletionPlan(scope) {
  return [
    {
      key: "support_messages",
      model: "support_messages",
      run: scope.conversationIds.length > 0 || scope.userIds.length > 0,
      where: {
        OR: [
          scope.conversationIds.length > 0
            ? { conversation_id: { in: scope.conversationIds } }
            : null,
          scope.userIds.length > 0
            ? { sender_user_id: { in: scope.userIds } }
            : null,
        ].filter(Boolean),
      },
    },
    {
      key: "notifications",
      model: "notifications",
      run: scope.userIds.length > 0 || scope.businessIds.length > 0,
      where: {
        OR: [
          scope.userIds.length > 0 ? { user_id: { in: scope.userIds } } : null,
          scope.businessIds.length > 0
            ? { business_id: { in: scope.businessIds } }
            : null,
        ].filter(Boolean),
      },
    },
    {
      key: "auth_audit_logs",
      model: "authAuditLog",
      run: scope.userIds.length > 0,
      where: {
        OR: [
          { email: { endsWith: `@${QA_EMAIL_DOMAIN}` } },
          { userId: { in: scope.userIds } },
        ],
      },
    },
    {
      key: "audit_logs",
      model: "audit_logs",
      run: scope.userIds.length > 0,
      where: {
        user_id: {
          in: scope.userIds,
        },
      },
    },
    {
      key: "delivery_metrics",
      model: "delivery_metrics",
      run: scope.deliveryIds.length > 0,
      where: {
        delivery_id: {
          in: scope.deliveryIds,
        },
      },
    },
    {
      key: "delivery_payments",
      model: "delivery_payments",
      run: scope.deliveryIds.length > 0 || scope.userIds.length > 0,
      where: {
        OR: [
          scope.deliveryIds.length > 0
            ? { delivery_id: { in: scope.deliveryIds } }
            : null,
          scope.userIds.length > 0
            ? { driver_user_id: { in: scope.userIds } }
            : null,
        ].filter(Boolean),
      },
    },
    {
      key: "delivery_tips",
      model: "delivery_tips",
      run:
        scope.deliveryIds.length > 0 ||
        scope.orderIds.length > 0 ||
        scope.userIds.length > 0,
      where: {
        OR: [
          scope.deliveryIds.length > 0
            ? { delivery_id: { in: scope.deliveryIds } }
            : null,
          scope.orderIds.length > 0
            ? { order_id: { in: scope.orderIds } }
            : null,
          scope.userIds.length > 0
            ? { driver_user_id: { in: scope.userIds } }
            : null,
        ].filter(Boolean),
      },
    },
    {
      key: "payments",
      model: "payments",
      run: scope.orderIds.length > 0,
      where: {
        order_id: {
          in: scope.orderIds,
        },
      },
    },
    {
      key: "order_notes",
      model: "order_notes",
      run: scope.orderIds.length > 0,
      where: {
        order_id: {
          in: scope.orderIds,
        },
      },
    },
    {
      key: "admin_messages",
      model: "admin_messages",
      run: scope.orderIds.length > 0 || scope.userIds.length > 0,
      where: {
        OR: [
          scope.orderIds.length > 0
            ? { order_id: { in: scope.orderIds } }
            : null,
          scope.userIds.length > 0 ? { user_id: { in: scope.userIds } } : null,
        ].filter(Boolean),
      },
    },
    {
      key: "reviews",
      model: "reviews",
      run: scope.orderIds.length > 0 || scope.userIds.length > 0,
      where: {
        OR: [
          scope.orderIds.length > 0
            ? { order_id: { in: scope.orderIds } }
            : null,
          scope.userIds.length > 0 ? { user_id: { in: scope.userIds } } : null,
        ].filter(Boolean),
      },
    },
    {
      key: "order_items",
      model: "order_items",
      run: scope.orderIds.length > 0 || scope.productIds.length > 0,
      where: {
        OR: [
          scope.orderIds.length > 0
            ? { order_id: { in: scope.orderIds } }
            : null,
          scope.productIds.length > 0
            ? { product_id: { in: scope.productIds } }
            : null,
        ].filter(Boolean),
      },
    },
    {
      key: "delivery",
      model: "delivery",
      run: scope.deliveryIds.length > 0 || scope.orderIds.length > 0,
      where: {
        OR: [
          scope.deliveryIds.length > 0
            ? { id: { in: scope.deliveryIds } }
            : null,
          scope.orderIds.length > 0
            ? { order_id: { in: scope.orderIds } }
            : null,
        ].filter(Boolean),
      },
    },
    {
      key: "orders",
      model: "orders",
      run: scope.orderIds.length > 0,
      where: {
        id: {
          in: scope.orderIds,
        },
      },
    },
    {
      key: "products_cart",
      model: "products_cart",
      run: scope.cartIds.length > 0 || scope.productIds.length > 0,
      where: {
        OR: [
          scope.cartIds.length > 0 ? { cart_id: { in: scope.cartIds } } : null,
          scope.productIds.length > 0
            ? { product_id: { in: scope.productIds } }
            : null,
        ].filter(Boolean),
      },
    },
    {
      key: "cart",
      model: "cart",
      run: scope.cartIds.length > 0,
      where: {
        id: {
          in: scope.cartIds,
        },
      },
    },
    {
      key: "favorites",
      model: "favorites",
      run: scope.userIds.length > 0,
      where: {
        user_id: {
          in: scope.userIds,
        },
      },
    },
    {
      key: "product_images",
      model: "product_images",
      run: scope.productIds.length > 0,
      where: {
        product_id: {
          in: scope.productIds,
        },
      },
    },
    {
      key: "product_category_map",
      model: "product_category_map",
      run: scope.productIds.length > 0,
      where: {
        product_id: {
          in: scope.productIds,
        },
      },
    },
    {
      key: "products",
      model: "products",
      run: scope.productIds.length > 0,
      where: {
        id: {
          in: scope.productIds,
        },
      },
    },
    {
      key: "business_category_map",
      model: "business_category_map",
      run: scope.businessIds.length > 0,
      where: {
        business_id: {
          in: scope.businessIds,
        },
      },
    },
    {
      key: "business_images",
      model: "business_images",
      run: scope.businessIds.length > 0,
      where: {
        business_id: {
          in: scope.businessIds,
        },
      },
    },
    {
      key: "business_hours",
      model: "business_hours",
      run: scope.businessIds.length > 0,
      where: {
        business_id: {
          in: scope.businessIds,
        },
      },
    },
    {
      key: "business_details",
      model: "business_details",
      run: scope.businessIds.length > 0,
      where: {
        business_id: {
          in: scope.businessIds,
        },
      },
    },
    {
      key: "business_managers",
      model: "business_managers",
      run: scope.businessIds.length > 0 || scope.userIds.length > 0,
      where: {
        OR: [
          scope.businessIds.length > 0
            ? { business_id: { in: scope.businessIds } }
            : null,
          scope.userIds.length > 0 ? { user_id: { in: scope.userIds } } : null,
        ].filter(Boolean),
      },
    },
    {
      key: "business_owners",
      model: "business_owners",
      run: scope.businessIds.length > 0 || scope.userIds.length > 0,
      where: {
        OR: [
          scope.businessIds.length > 0
            ? { business_id: { in: scope.businessIds } }
            : null,
          scope.userIds.length > 0 ? { user_id: { in: scope.userIds } } : null,
        ].filter(Boolean),
      },
    },
    {
      key: "shipping_zones",
      model: "shipping_zones",
      run: true,
      where: {
        nombre: STAGING_QA_FIXTURES.shippingZone.nombre,
      },
    },
    {
      key: "business",
      model: "business",
      run: scope.businessIds.length > 0,
      where: {
        id: {
          in: scope.businessIds,
        },
      },
    },
    {
      key: "password_reset_tokens",
      model: "passwordResetToken",
      run: scope.userIds.length > 0,
      where: {
        OR: [
          { email: { endsWith: `@${QA_EMAIL_DOMAIN}` } },
          { userId: { in: scope.userIds } },
        ],
      },
    },
    {
      key: "user_sessions",
      model: "userSession",
      run: scope.userIds.length > 0,
      where: {
        userId: {
          in: scope.userIds,
        },
      },
    },
    {
      key: "user_roles",
      model: "user_roles",
      run: scope.userIds.length > 0,
      where: {
        user_id: {
          in: scope.userIds,
        },
      },
    },
    {
      key: "support_conversations",
      model: "support_conversations",
      run: scope.conversationIds.length > 0,
      where: {
        id: {
          in: scope.conversationIds,
        },
      },
    },
    {
      key: "addresses",
      model: "addresses",
      run: scope.addressIds.length > 0,
      where: {
        id: {
          in: scope.addressIds,
        },
      },
    },
    {
      key: "users",
      model: "user",
      run: scope.userIds.length > 0,
      where: {
        id: {
          in: scope.userIds,
        },
      },
    },
  ];
}

async function executeCleanupPlan({ tx, scope }) {
  const deleted = {};
  for (const step of createDeletionPlan(scope)) {
    deleted[step.key] = await deleteManyIf({
      tx,
      model: step.model,
      where: step.where,
      run: step.run,
    });
  }

  return deleted;
}

async function collectResidualCounts({ db = prisma, scope }) {
  const counts = {};
  counts.users = scope.userIds.length
    ? await db.user.count({ where: { id: { in: scope.userIds } } })
    : 0;
  counts.businesses = scope.businessIds.length
    ? await db.business.count({ where: { id: { in: scope.businessIds } } })
    : 0;
  counts.products = scope.productIds.length
    ? await db.products.count({ where: { id: { in: scope.productIds } } })
    : 0;
  counts.orders = scope.orderIds.length
    ? await db.orders.count({ where: { id: { in: scope.orderIds } } })
    : 0;
  counts.carts = scope.cartIds.length
    ? await db.cart.count({ where: { id: { in: scope.cartIds } } })
    : 0;
  counts.addresses = scope.addressIds.length
    ? await db.addresses.count({ where: { id: { in: scope.addressIds } } })
    : 0;
  counts.deliveries = scope.deliveryIds.length
    ? await db.delivery.count({ where: { id: { in: scope.deliveryIds } } })
    : 0;
  counts.supportConversations = scope.conversationIds.length
    ? await db.support_conversations.count({
        where: { id: { in: scope.conversationIds } },
      })
    : 0;
  counts.shippingZones = await db.shipping_zones.count({
    where: {
      nombre: STAGING_QA_FIXTURES.shippingZone.nombre,
    },
  });

  return counts;
}

async function runCleanup({
  env = process.env,
  db = prisma,
  write = false,
  verifyStaging = formatVerificationOutput,
  assertSafeWrite = assertSafeWriteTarget,
} = {}) {
  const verification = verifyStaging(env);
  const verified = verification.result === "STAGING ENVIRONMENT VERIFIED";

  if (!write) {
    if (!verified) {
      return buildDryRunPreview({
        env,
        verification,
        scope: buildEmptyScope(),
        databaseAudited: false,
      });
    }

    const scope = await collectQaScope({ db });
    return buildDryRunPreview({
      env,
      verification,
      scope,
      databaseAudited: true,
    });
  }

  if (!verified) {
    throw new Error(BLOCKED_ENVIRONMENT_MESSAGE);
  }

  assertExplicitConfirmation(env);
  const guard = assertSafeWrite({
    operation: WRITE_OPERATION,
    env,
  });
  const scope = await collectQaScope({ db });
  const deleted = await db.$transaction((tx) =>
    executeCleanupPlan({ tx, scope }),
  );
  const remaining = await collectResidualCounts({ db, scope });

  return {
    mode: "write",
    operation: WRITE_OPERATION,
    confirmationEnvVar: CONFIRMATION_ENV_VAR,
    confirmationRequired: CONFIRMATION_VALUE,
    result: "STAGING QA CLEANUP COMPLETED",
    environmentVerified: true,
    verification,
    guard,
    manifest: buildStagingQaManifest(),
    selectors: buildCleanupSelectors(),
    deleteOrder: [...DELETE_ORDER],
    scope: buildScopeSummary(scope),
    deleted,
    remaining,
    writesExecuted: true,
  };
}

async function main() {
  const { write } = getCliArgs();
  const result = await runCleanup({ write });
  console.info(JSON.stringify(result, null, 2));
  if (!write) {
    console.info(DRY_RUN_MESSAGE);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  BLOCKED_ENVIRONMENT_MESSAGE,
  CONFIRMATION_ENV_VAR,
  CONFIRMATION_VALUE,
  DELETE_ORDER,
  DRY_RUN_MESSAGE,
  WRITE_OPERATION,
  assertExplicitConfirmation,
  buildCleanupSelectors,
  buildDryRunPreview,
  buildScopeSummary,
  collectQaScope,
  collectResidualCounts,
  createDeletionPlan,
  executeCleanupPlan,
  getCliArgs,
  runCleanup,
};
