#!/usr/bin/env node

const { assertSafeWriteTarget } = require("./lib/db-write-guard");

const CONFIRMATION_VALUE = "REPAIR_BUSINESS_OWNERSHIP";
const WRITE_OPERATION = "scripts/business-ownership-repair.js --write";

function getCliArgs(argv = process.argv.slice(2)) {
  const businessIdArg = argv.find((arg) => arg.startsWith("--business-id="));
  const businessId = businessIdArg
    ? Number(businessIdArg.split("=", 2)[1])
    : null;

  return {
    write: argv.includes("--write"),
    dryRun: argv.includes("--dry-run") || !argv.includes("--write"),
    allowDeletes: argv.includes("--allow-deletes"),
    confirmation: process.env.CONFIRM_BUSINESS_OWNERSHIP_REPAIR?.trim() || null,
    businessId:
      Number.isInteger(businessId) && businessId > 0 ? businessId : null,
  };
}

function isProductionLikeEnvironment(env = process.env) {
  const nodeEnv = String(env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  const appEnv = String(env.APP_ENV ?? env.RUNTIME_ENV ?? "")
    .trim()
    .toLowerCase();
  const databaseUrl = String(env.DATABASE_URL ?? "")
    .trim()
    .toLowerCase();

  return (
    nodeEnv === "production" ||
    appEnv === "production" ||
    databaseUrl.includes("gogi_prod") ||
    databaseUrl.includes("prod")
  );
}

function assertSafeWriteEnvironment(env = process.env) {
  if (isProductionLikeEnvironment(env)) {
    throw new Error(
      "OWNERSHIP REPAIR BLOCKED: el script no puede escribir en producción.",
    );
  }
}

function normalizeCandidateSet(values) {
  return [
    ...new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
}

function buildRepairPlan(businesses) {
  const actions = [];
  const conflicts = [];

  for (const business of businesses) {
    const explicitOwners = normalizeCandidateSet(
      business.explicitOwnerIds ?? [],
    );
    const legacyOwnerIds = normalizeCandidateSet([
      ...(business.legacyOwnerIds ?? []),
      ...(business.legacyOwnerUserIds ?? []),
    ]);
    const emailMatches = normalizeCandidateSet(
      business.emailMatchedUserIds ?? [],
    );

    if (emailMatches.length > 0) {
      conflicts.push({
        businessId: business.businessId,
        reason: "email_match_requires_manual_review",
      });
      continue;
    }

    if (explicitOwners.length > 0) {
      actions.push({
        businessId: business.businessId,
        type: "keep_explicit_owners",
        createOwnerIds: [],
        deleteOwnerIds: [],
      });
      continue;
    }

    if (legacyOwnerIds.length === 1) {
      actions.push({
        businessId: business.businessId,
        type: "create_missing_owner",
        createOwnerIds: legacyOwnerIds,
        deleteOwnerIds: [],
      });
      continue;
    }

    if (legacyOwnerIds.length > 1) {
      conflicts.push({
        businessId: business.businessId,
        reason: "ambiguous_legacy_owners",
        candidateOwnerIds: legacyOwnerIds,
      });
      continue;
    }

    conflicts.push({
      businessId: business.businessId,
      reason: "no_explicit_owner",
    });
  }

  return {
    actions,
    conflicts,
  };
}

function buildDryRunReport({ plan, auditedBusinesses }) {
  return {
    mode: "dry-run",
    operation: WRITE_OPERATION,
    confirmationRequired: CONFIRMATION_VALUE,
    writesExecuted: false,
    auditedBusinesses,
    proposedCreates: plan.actions.flatMap((action) => action.createOwnerIds),
    proposedDeletes: [],
    conflicts: plan.conflicts,
  };
}

async function runBusinessOwnershipRepair({
  args = getCliArgs(),
  env = process.env,
  loadBusinesses,
  transaction,
  assignOwner,
  auditLogger = () => {},
}) {
  const auditedBusinesses = await loadBusinesses(args.businessId);
  const plan = buildRepairPlan(auditedBusinesses);

  if (args.dryRun) {
    return buildDryRunReport({
      plan,
      auditedBusinesses: auditedBusinesses.length,
    });
  }

  assertSafeWriteEnvironment(env);
  assertSafeWriteTarget({ operation: WRITE_OPERATION, env });

  if (args.confirmation !== CONFIRMATION_VALUE) {
    throw new Error(
      `OWNERSHIP REPAIR BLOCKED: confirma con CONFIRM_BUSINESS_OWNERSHIP_REPAIR=${CONFIRMATION_VALUE}`,
    );
  }

  if (plan.conflicts.length > 0) {
    throw new Error(
      "OWNERSHIP REPAIR BLOCKED: existen conflictos o ambigüedades por resolver.",
    );
  }

  return transaction(async () => {
    const created = [];

    for (const action of plan.actions) {
      for (const ownerId of action.createOwnerIds) {
        await assignOwner(action.businessId, ownerId);
        created.push({ businessId: action.businessId, ownerId });
        auditLogger({
          businessId: action.businessId,
          ownerId,
          operation: "create_owner_relation",
        });
      }
    }

    return {
      mode: "write",
      writesExecuted: true,
      created,
      deleted: [],
      conflicts: [],
    };
  });
}

async function main() {
  const _args = getCliArgs();
  const report = buildDryRunReport({
    plan: { actions: [], conflicts: [] },
    auditedBusinesses: 0,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION_VALUE,
  assertSafeWriteEnvironment,
  buildDryRunReport,
  buildRepairPlan,
  getCliArgs,
  isProductionLikeEnvironment,
  runBusinessOwnershipRepair,
};
