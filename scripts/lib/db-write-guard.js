const {
  evaluateWriteTarget,
  getEnvironmentSignals,
  getRuntimeEnvironment,
  parseDatabaseTarget,
} = require("./staging-environment");

function buildSanitizedDbOperationSummary({
  operation,
  mode,
  env = process.env,
}) {
  const target = parseDatabaseTarget(env);
  const signals = getEnvironmentSignals(env);
  const evaluatedWriteTarget = evaluateWriteTarget({
    operation,
    env,
    requireExplicitFlag: false,
  });

  return {
    operation,
    mode,
    runtimeEnvironment: signals.runtimeEnvironment,
    appEnv: signals.appEnv || null,
    databaseEnv: signals.databaseEnv || null,
    nodeEnv: signals.nodeEnv || null,
    vercelEnv: signals.vercelEnv || null,
    databaseHost: evaluatedWriteTarget.databaseHost,
    databaseHostFingerprint: evaluatedWriteTarget.databaseHostFingerprint,
    databaseName: target.databaseName ?? null,
    databaseUserFingerprint: evaluatedWriteTarget.databaseUserFingerprint,
    databaseUrlPresent: target.rawUrlPresent,
    databaseUrlParseable: target.rawUrlParseable,
    isProductionDatabase: evaluatedWriteTarget.isProductionDatabase,
    allowStagingWrites: signals.allowStagingWrites,
    productionReferenceConfigured:
      evaluatedWriteTarget.productionReferenceConfigured,
    writeAllowed: evaluatedWriteTarget.writeAllowed,
    blockingReasons: evaluatedWriteTarget.blockingReasons,
  };
}

function logDbOperationTarget(options) {
  const summary = buildSanitizedDbOperationSummary(options);
  console.info("[db-guard]", JSON.stringify(summary));
  return summary;
}

function assertSafeWriteTarget({
  operation,
  env = process.env,
  requireExplicitFlag = true,
}) {
  const evaluatedWriteTarget = evaluateWriteTarget({
    operation,
    env,
    requireExplicitFlag,
  });
  logDbOperationTarget({
    operation,
    mode: "write",
    env,
  });

  if (!evaluatedWriteTarget.writeAllowed) {
    throw new Error(
      `Write blocked: ${evaluatedWriteTarget.blockingReasons.join(", ")}`,
    );
  }

  return evaluatedWriteTarget;
}

module.exports = {
  assertSafeWriteTarget,
  buildSanitizedDbOperationSummary,
  getRuntimeEnvironment,
  logDbOperationTarget,
  parseDatabaseTarget,
  evaluateWriteTarget,
};
