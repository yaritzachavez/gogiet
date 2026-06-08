const test = require("node:test");
const assert = require("node:assert/strict");

const { STAGING_QA_FIXTURES } = require("./lib/staging-qa-fixtures");
const {
  BLOCKED_ENVIRONMENT_MESSAGE,
  CONFIRMATION_ENV_VAR,
  CONFIRMATION_VALUE,
  DELETE_ORDER,
  DRY_RUN_MESSAGE,
  buildDryRunPreview,
  createDeletionPlan,
  assertExplicitConfirmation,
  runCleanup,
} = require("./cleanup-staging-qa");

test("staging QA cleanup stays in dry-run by default", () => {
  const preview = buildDryRunPreview({
    env: {
      APP_ENV: "development",
      DATABASE_ENV: "development",
      DATABASE_URL: "mysql://dev:dev@localhost:3306/gogi_dev",
    },
    verification: {
      result: "STAGING ENVIRONMENT NOT VERIFIED",
    },
  });

  assert.equal(preview.mode, "dry-run");
  assert.equal(preview.writesExecuted, false);
  assert.equal(preview.confirmationRequired, CONFIRMATION_VALUE);
  assert.equal(preview.confirmationEnvVar, CONFIRMATION_ENV_VAR);
  assert.equal(preview.result, DRY_RUN_MESSAGE);
  assert.equal(preview.blockedReason, BLOCKED_ENVIRONMENT_MESSAGE);
});

test("cleanup write mode requires explicit staging confirmation env var", () => {
  assert.throws(
    () => assertExplicitConfirmation({}),
    new RegExp(CONFIRMATION_ENV_VAR, "i"),
  );
  assert.doesNotThrow(() =>
    assertExplicitConfirmation({
      [CONFIRMATION_ENV_VAR]: CONFIRMATION_VALUE,
    }),
  );
});

test("dry-run stays read-only when staging is not verified", async () => {
  let databaseTouched = false;
  const result = await runCleanup({
    write: false,
    verifyStaging: () => ({
      result: "STAGING ENVIRONMENT NOT VERIFIED",
    }),
    db: new Proxy(
      {},
      {
        get() {
          databaseTouched = true;
          throw new Error("database should not be touched");
        },
      },
    ),
  });

  assert.equal(result.writesExecuted, false);
  assert.equal(result.databaseAudited, false);
  assert.equal(databaseTouched, false);
  assert.equal(result.blockedReason, BLOCKED_ENVIRONMENT_MESSAGE);
});

test("write mode is blocked when staging verification fails", async () => {
  await assert.rejects(
    () =>
      runCleanup({
        write: true,
        verifyStaging: () => ({
          result: "STAGING ENVIRONMENT NOT VERIFIED",
        }),
      }),
    new RegExp(BLOCKED_ENVIRONMENT_MESSAGE),
  );
});

test("dry-run audits scope when staging verification passes", async () => {
  const emptyRows = [];
  const db = {
    user: {
      findMany: async () => [{ id: 1, email: "qa.customer@gogieats.test" }],
    },
    business: { findMany: async () => [{ id: 2 }] },
    products: { findMany: async () => [{ id: 3 }] },
    addresses: { findMany: async () => [{ id: 4 }] },
    cart: { findMany: async () => [{ id: 5 }] },
    orders: { findMany: async () => [{ id: 6 }] },
    delivery: { findMany: async () => [{ id: 7 }] },
    support_conversations: { findMany: async () => [{ id: 8 }] },
    product_category_map: { findMany: async () => emptyRows },
    business_category_map: { findMany: async () => emptyRows },
  };

  const result = await runCleanup({
    write: false,
    db,
    verifyStaging: () => ({
      result: "STAGING ENVIRONMENT VERIFIED",
    }),
  });

  assert.equal(result.databaseAudited, true);
  assert.deepEqual(result.scope, {
    users: 1,
    businesses: 1,
    products: 1,
    orders: 1,
    carts: 1,
    addresses: 1,
    deliveries: 1,
    supportConversations: 1,
    businessCategories: 0,
    productCategories: 0,
  });
  assert.deepEqual(result.deleteOrder, DELETE_ORDER);
});

test("deletion plan starts with dependent records and ends with users", () => {
  const plan = createDeletionPlan({
    userIds: [1],
    businessIds: [2],
    productIds: [3],
    orderIds: [4],
    cartIds: [5],
    addressIds: [6],
    deliveryIds: [7],
    conversationIds: [8],
    businessCategoryIds: [],
    productCategoryIds: [],
  });

  assert.equal(plan[0].key, "support_messages");
  assert.equal(plan.at(-1).key, "users");
});

test("write mode uses a single transaction and reports post-validation counts", async () => {
  const calls = [];
  const countStub = async () => 0;
  const tx = new Proxy(
    {},
    {
      get(_target, model) {
        return {
          deleteMany: async () => {
            calls.push(model);
            return { count: 1 };
          },
        };
      },
    },
  );
  const db = {
    user: {
      findMany: async () => [{ id: 1, email: "qa.customer@gogieats.test" }],
      count: countStub,
    },
    business: { findMany: async () => [{ id: 2 }], count: countStub },
    products: { findMany: async () => [{ id: 3 }], count: countStub },
    addresses: { findMany: async () => [{ id: 4 }], count: countStub },
    cart: { findMany: async () => [{ id: 5 }], count: countStub },
    orders: { findMany: async () => [{ id: 6 }], count: countStub },
    delivery: { findMany: async () => [{ id: 7 }], count: countStub },
    support_conversations: {
      findMany: async () => [{ id: 8 }],
      count: countStub,
    },
    product_category_map: { findMany: async () => [] },
    business_category_map: { findMany: async () => [] },
    shipping_zones: { count: countStub },
    $transaction: async (callback) => callback(tx),
  };

  const result = await runCleanup({
    write: true,
    env: {
      [CONFIRMATION_ENV_VAR]: CONFIRMATION_VALUE,
    },
    db,
    verifyStaging: () => ({
      result: "STAGING ENVIRONMENT VERIFIED",
    }),
    assertSafeWrite: () => ({
      writeAllowed: true,
    }),
  });

  assert.equal(result.writesExecuted, true);
  assert.equal(result.remaining.users, 0);
  assert.equal(calls[0], "support_messages");
  assert.equal(calls.at(-1), "user");
});

test("selectors remain pinned to exact QA fixtures", () => {
  const preview = buildDryRunPreview({
    verification: { result: "STAGING ENVIRONMENT VERIFIED" },
  });

  assert.equal(
    preview.selectors.businessName,
    STAGING_QA_FIXTURES.business.name,
  );
  assert.equal(preview.selectors.productSku, STAGING_QA_FIXTURES.product.sku);
  assert.equal(
    preview.selectors.shippingZoneName,
    STAGING_QA_FIXTURES.shippingZone.nombre,
  );
});
