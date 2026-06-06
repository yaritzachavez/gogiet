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

const WRITE_OPERATION = "scripts/cleanup-staging-qa.js --write";

function getCliArgs(argv = process.argv.slice(2)) {
  const confirmationArg = argv.find((arg) => arg.startsWith("--confirm="));
  return {
    write: argv.includes("--write"),
    confirmation: confirmationArg
      ? (confirmationArg.split("=", 2)[1] ?? "")
      : "",
  };
}

function buildCleanupSelectors() {
  return {
    tag: STAGING_QA_TAG,
    emailDomain: QA_EMAIL_DOMAIN,
    businessName: STAGING_QA_FIXTURES.business.name,
    businessEmail: STAGING_QA_FIXTURES.business.email,
    productSku: STAGING_QA_FIXTURES.product.sku,
    shippingZoneName: STAGING_QA_FIXTURES.shippingZone.nombre,
    addressLabel: STAGING_QA_FIXTURES.address.label,
  };
}

function buildDryRunPreview(env = process.env) {
  return {
    mode: "dry-run",
    operation: WRITE_OPERATION,
    confirmationRequired: STAGING_QA_TAG,
    guard: buildSanitizedDbOperationSummary({
      operation: WRITE_OPERATION,
      mode: "read",
      env,
    }),
    manifest: buildStagingQaManifest(),
    selectors: buildCleanupSelectors(),
    writesExecuted: false,
  };
}

function assertExplicitConfirmation(confirmation) {
  if (confirmation !== STAGING_QA_TAG) {
    throw new Error(
      `Cleanup blocked: pass --confirm=${STAGING_QA_TAG} to delete QA staging records.`,
    );
  }
}

async function collectQaScope() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        endsWith: `@${QA_EMAIL_DOMAIN}`,
      },
    },
    select: {
      id: true,
      email: true,
    },
  });
  const userIds = users.map((user) => user.id);

  const businesses = await prisma.business.findMany({
    where: {
      OR: [
        {
          email: STAGING_QA_FIXTURES.business.email,
        },
        {
          name: STAGING_QA_FIXTURES.business.name,
        },
      ],
    },
    select: {
      id: true,
      name: true,
    },
  });
  const businessIds = businesses.map((business) => business.id);

  const products = await prisma.products.findMany({
    where: {
      OR: [
        {
          sku: {
            startsWith: "QA-STAGING-",
          },
        },
        {
          business_id: {
            in: businessIds.length > 0 ? businessIds : [-1],
          },
        },
      ],
    },
    select: {
      id: true,
      sku: true,
    },
  });
  const productIds = products.map((product) => product.id);

  const orders = await prisma.orders.findMany({
    where: {
      OR: [
        {
          user_id: {
            in: userIds.length > 0 ? userIds : [-1],
          },
        },
        {
          business_id: {
            in: businessIds.length > 0 ? businessIds : [-1],
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });
  const orderIds = orders.map((order) => order.id);

  const carts = await prisma.cart.findMany({
    where: {
      user_id: {
        in: userIds.length > 0 ? userIds : [-1],
      },
    },
    select: {
      id: true,
    },
  });
  const cartIds = carts.map((cart) => cart.id);

  const conversations = await prisma.support_conversations.findMany({
    where: {
      requester_user_id: {
        in: userIds.length > 0 ? userIds : [-1],
      },
    },
    select: {
      id: true,
    },
  });
  const conversationIds = conversations.map((conversation) => conversation.id);

  return {
    users,
    userIds,
    businesses,
    businessIds,
    products,
    productIds,
    orders,
    orderIds,
    carts,
    cartIds,
    conversationIds,
  };
}

async function runCleanup({
  env = process.env,
  write = false,
  confirmation = "",
} = {}) {
  if (!write) {
    return buildDryRunPreview(env);
  }

  assertExplicitConfirmation(confirmation);
  const guard = assertSafeWriteTarget({
    operation: WRITE_OPERATION,
    env,
  });
  const scope = await collectQaScope();

  const orderIds = scope.orderIds.length > 0 ? scope.orderIds : [-1];
  const productIds = scope.productIds.length > 0 ? scope.productIds : [-1];
  const cartIds = scope.cartIds.length > 0 ? scope.cartIds : [-1];
  const userIds = scope.userIds.length > 0 ? scope.userIds : [-1];
  const businessIds = scope.businessIds.length > 0 ? scope.businessIds : [-1];
  const conversationIds =
    scope.conversationIds.length > 0 ? scope.conversationIds : [-1];

  const results = {};
  results.products_cart = await prisma.products_cart.deleteMany({
    where: {
      OR: [{ cart_id: { in: cartIds } }, { product_id: { in: productIds } }],
    },
  });
  results.order_items = await prisma.order_items.deleteMany({
    where: {
      OR: [{ order_id: { in: orderIds } }, { product_id: { in: productIds } }],
    },
  });
  results.order_notes = await prisma.order_notes.deleteMany({
    where: {
      order_id: {
        in: orderIds,
      },
    },
  });
  results.admin_messages = await prisma.admin_messages.deleteMany({
    where: {
      order_id: {
        in: orderIds,
      },
    },
  });
  results.delivery_tips = await prisma.delivery_tips.deleteMany({
    where: {
      order_id: {
        in: orderIds,
      },
    },
  });
  results.payments = await prisma.payments.deleteMany({
    where: {
      order_id: {
        in: orderIds,
      },
    },
  });
  results.delivery = await prisma.delivery.deleteMany({
    where: {
      order_id: {
        in: orderIds,
      },
    },
  });
  results.reviews = await prisma.reviews.deleteMany({
    where: {
      OR: [{ order_id: { in: orderIds } }, { user_id: { in: userIds } }],
    },
  });
  results.notifications = await prisma.notifications.deleteMany({
    where: {
      OR: [{ user_id: { in: userIds } }, { business_id: { in: businessIds } }],
    },
  });
  results.support_messages = await prisma.support_messages.deleteMany({
    where: {
      conversation_id: {
        in: conversationIds,
      },
    },
  });
  results.support_conversations = await prisma.support_conversations.deleteMany(
    {
      where: {
        id: {
          in: conversationIds,
        },
      },
    },
  );
  results.orders = await prisma.orders.deleteMany({
    where: {
      id: {
        in: orderIds,
      },
    },
  });
  results.favorites = await prisma.favorites.deleteMany({
    where: {
      OR: [{ user_id: { in: userIds } }, { product_id: { in: productIds } }],
    },
  });
  results.cart = await prisma.cart.deleteMany({
    where: {
      id: {
        in: cartIds,
      },
    },
  });
  results.addresses = await prisma.addresses.deleteMany({
    where: {
      OR: [
        { user_id: { in: userIds } },
        { reference_notes: STAGING_QA_TAG },
        { label: STAGING_QA_FIXTURES.address.label },
      ],
    },
  });
  results.product_images = await prisma.product_images.deleteMany({
    where: {
      product_id: {
        in: productIds,
      },
    },
  });
  results.product_category_map = await prisma.product_category_map.deleteMany({
    where: {
      product_id: {
        in: productIds,
      },
    },
  });
  results.products = await prisma.products.deleteMany({
    where: {
      id: {
        in: productIds,
      },
    },
  });
  results.shipping_zones = await prisma.shipping_zones.deleteMany({
    where: {
      nombre: STAGING_QA_FIXTURES.shippingZone.nombre,
    },
  });
  results.business_managers = await prisma.business_managers.deleteMany({
    where: {
      business_id: {
        in: businessIds,
      },
    },
  });
  results.business_owners = await prisma.business_owners.deleteMany({
    where: {
      business_id: {
        in: businessIds,
      },
    },
  });
  results.business = await prisma.business.deleteMany({
    where: {
      id: {
        in: businessIds,
      },
    },
  });
  results.user_roles = await prisma.user_roles.deleteMany({
    where: {
      user_id: {
        in: userIds,
      },
    },
  });
  results.user_sessions = await prisma.userSession.deleteMany({
    where: {
      userId: {
        in: userIds,
      },
    },
  });
  results.password_reset_tokens = await prisma.passwordResetToken.deleteMany({
    where: {
      userId: {
        in: userIds,
      },
    },
  });
  results.auth_audit_logs = await prisma.authAuditLog.deleteMany({
    where: {
      identifier: {
        endsWith: `@${QA_EMAIL_DOMAIN}`,
      },
    },
  });
  results.audit_logs = await prisma.audit_logs.deleteMany({
    where: {
      user_id: {
        in: userIds,
      },
    },
  });
  results.users = await prisma.user.deleteMany({
    where: {
      id: {
        in: userIds,
      },
    },
  });

  return {
    mode: "write",
    operation: WRITE_OPERATION,
    confirmationRequired: STAGING_QA_TAG,
    guard,
    selectors: buildCleanupSelectors(),
    scope: {
      userCount: scope.userIds.length,
      businessCount: scope.businessIds.length,
      productCount: scope.productIds.length,
      orderCount: scope.orderIds.length,
      cartCount: scope.cartIds.length,
      conversationCount: scope.conversationIds.length,
    },
    deleted: Object.fromEntries(
      Object.entries(results).map(([key, value]) => [key, value.count]),
    ),
    writesExecuted: true,
  };
}

async function main() {
  const { write, confirmation } = getCliArgs();
  const result = await runCleanup({
    write,
    confirmation,
  });
  console.info(JSON.stringify(result, null, 2));
  if (!write) {
    console.info("STAGING QA CLEANUP DRY RUN ONLY");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exit(1);
  });
}

module.exports = {
  WRITE_OPERATION,
  assertExplicitConfirmation,
  buildCleanupSelectors,
  buildDryRunPreview,
  getCliArgs,
  runCleanup,
};
