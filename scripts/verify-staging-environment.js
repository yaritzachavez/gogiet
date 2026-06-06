#!/usr/bin/env node

const { evaluateStagingEnvironment } = require("./lib/staging-environment");

function formatVerificationOutput(env = process.env) {
  const summary = evaluateStagingEnvironment(env);
  return {
    appEnv: summary.appEnv,
    databaseEnv: summary.databaseEnv,
    nodeEnv: summary.nodeEnv,
    vercelEnv: summary.vercelEnv,
    runtimeEnvironment: summary.runtimeEnvironment,
    databaseName: summary.databaseName,
    databaseHost: summary.databaseHost,
    databaseHostFingerprint: summary.databaseHostFingerprint,
    databaseUserFingerprint: summary.databaseUserFingerprint,
    databaseUrlPresent: summary.databaseUrlPresent,
    databaseUrlParseable: summary.databaseUrlParseable,
    productionReferenceConfigured: summary.productionReferenceConfigured,
    hostMatchesProduction: summary.hostMatchesProduction,
    userMatchesProduction: summary.userMatchesProduction,
    appUrlHost: summary.appUrlHost,
    appUrlFingerprint: summary.appUrlFingerprint,
    appUrlLooksPreview: summary.appUrlLooksPreview,
    mercadoPagoPublicKeyState: summary.mercadoPagoPublicKeyState,
    mercadoPagoPublicKeyFingerprint: summary.mercadoPagoPublicKeyFingerprint,
    mercadoPagoAccessTokenState: summary.mercadoPagoAccessTokenState,
    mercadoPagoAccessTokenFingerprint:
      summary.mercadoPagoAccessTokenFingerprint,
    writeGuardEligible: summary.writeGuardEligible,
    blockingReasons: summary.blockingReasons,
    result: summary.verified
      ? "STAGING ENVIRONMENT VERIFIED"
      : "STAGING ENVIRONMENT NOT VERIFIED",
  };
}

if (require.main === module) {
  const output = formatVerificationOutput();
  console.info(JSON.stringify(output, null, 2));
  console.info(output.result);
  process.exit(output.result === "STAGING ENVIRONMENT VERIFIED" ? 0 : 1);
}

module.exports = {
  formatVerificationOutput,
};
