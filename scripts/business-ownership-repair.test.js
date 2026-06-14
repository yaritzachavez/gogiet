const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CONFIRMATION_VALUE,
  assertSafeWriteEnvironment,
  buildRepairPlan,
  getCliArgs,
  runBusinessOwnershipRepair,
} = require("./business-ownership-repair");

const safeWriteEnv = {
  APP_ENV: "staging",
  DATABASE_ENV: "staging",
  NODE_ENV: "development",
  VERCEL_ENV: "preview",
  ALLOW_STAGING_DB_WRITES: "true",
  DATABASE_URL:
    "mysql://staging_user:pass@staging-db.example.com:3306/gogi_staging",
  DB_NAME: "gogi_staging",
  DB_HOST: "staging-db.example.com",
  DB_USER: "staging_user",
  PRODUCTION_DB_NAME: "gogi_prod",
  PRODUCTION_DB_HOST_FINGERPRINT: "prodhost0001",
  PRODUCTION_DB_USER_FINGERPRINT: "produser0001",
};

test("ownership repair defaults to dry-run", () => {
  const args = getCliArgs([]);
  assert.equal(args.dryRun, true);
  assert.equal(args.write, false);
});

test("ownership repair blocks production-like environments", () => {
  assert.throws(
    () =>
      assertSafeWriteEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "mysql://user:pass@host/gogi_prod",
      }),
    /BLOCKED/,
  );
});

test("ownership repair reports ambiguities and ignores email matches", () => {
  const plan = buildRepairPlan([
    {
      businessId: 1,
      explicitOwnerIds: [],
      legacyOwnerIds: [7, 8],
      legacyOwnerUserIds: [],
      emailMatchedUserIds: [],
    },
    {
      businessId: 2,
      explicitOwnerIds: [],
      legacyOwnerIds: [],
      legacyOwnerUserIds: [],
      emailMatchedUserIds: [9],
    },
  ]);

  assert.equal(plan.actions.length, 0);
  assert.equal(plan.conflicts.length, 2);
});

test("ownership repair does not write in dry-run mode", async () => {
  let assigned = 0;
  const report = await runBusinessOwnershipRepair({
    args: {
      dryRun: true,
      write: false,
      allowDeletes: false,
      confirmation: null,
    },
    loadBusinesses: async () => [
      {
        businessId: 1,
        explicitOwnerIds: [],
        legacyOwnerIds: [12],
        legacyOwnerUserIds: [],
        emailMatchedUserIds: [],
      },
    ],
    transaction: async (handler) => handler(),
    assignOwner: async () => {
      assigned += 1;
    },
  });

  assert.equal(report.mode, "dry-run");
  assert.equal(report.writesExecuted, false);
  assert.equal(assigned, 0);
});

test("ownership repair requires explicit confirmation before writing", async () => {
  await assert.rejects(
    () =>
      runBusinessOwnershipRepair({
        args: {
          dryRun: false,
          write: true,
          allowDeletes: false,
          confirmation: "WRONG",
        },
        env: safeWriteEnv,
        loadBusinesses: async () => [],
        transaction: async (handler) => handler(),
        assignOwner: async () => {},
      }),
    /CONFIRM_BUSINESS_OWNERSHIP_REPAIR/,
  );
});

test("ownership repair write mode is transactional and idempotent", async () => {
  const created = new Set();
  let transactionCalls = 0;

  const execute = () =>
    runBusinessOwnershipRepair({
      args: {
        dryRun: false,
        write: true,
        allowDeletes: false,
        confirmation: CONFIRMATION_VALUE,
      },
      env: safeWriteEnv,
      loadBusinesses: async () => [
        {
          businessId: 1,
          explicitOwnerIds: [],
          legacyOwnerIds: [21],
          legacyOwnerUserIds: [],
          emailMatchedUserIds: [],
        },
      ],
      transaction: async (handler) => {
        transactionCalls += 1;
        return handler();
      },
      assignOwner: async (businessId, ownerId) => {
        created.add(`${businessId}:${ownerId}`);
      },
    });

  const first = await execute();
  const second = await execute();

  assert.equal(first.writesExecuted, true);
  assert.equal(second.writesExecuted, true);
  assert.deepEqual([...created], ["1:21"]);
  assert.equal(transactionCalls, 2);
});
