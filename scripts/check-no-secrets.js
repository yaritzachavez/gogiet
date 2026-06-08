#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SECRET_PATTERNS = [
  {
    id: "database-url-with-credentials",
    test: (text) =>
      /\bDATABASE_URL\b\s*[:=]\s*["']?mysql:\/\/(?!REPLACE_WITH|USUARIO_STAGING|user:pass|staging_user:staging_password)[^:\s/]+:[^@\s/]+@/i.test(
        text,
      ),
  },
  {
    id: "private-key",
    test: (text) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text),
  },
  {
    id: "mercadopago-prod-token",
    test: (text) =>
      /\b(?:MERCADOPAGO_ACCESS_TOKEN|NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY)\b\s*[:=]\s*["']?APP_USR-[A-Za-z0-9_-]{12,}/.test(
        text,
      ) &&
      !text.includes("PEGA_AQUI") &&
      !text.includes("REPLACE_WITH"),
  },
];

function getTrackedFiles(rootDir = process.cwd()) {
  return execFileSync("git", ["ls-files"], {
    cwd: rootDir,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldScan(filePath) {
  const normalized = filePath.replace(/\\/g, "/");

  if (
    normalized.startsWith("docs/") ||
    normalized.startsWith("ops_backups/") ||
    normalized.includes("node_modules/") ||
    normalized.endsWith(".test.js") ||
    normalized.endsWith(".test.mjs")
  ) {
    return false;
  }

  return !normalized.endsWith(".example");
}

function scanTrackedFiles(rootDir = process.cwd()) {
  const findings = [];

  for (const relativePath of getTrackedFiles(rootDir)) {
    if (!shouldScan(relativePath)) {
      continue;
    }

    const absolutePath = path.join(rootDir, relativePath);
    const content = fs.readFileSync(absolutePath, "utf8");

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        findings.push({ file: relativePath, pattern: pattern.id });
      }
    }
  }

  return findings;
}

if (require.main === module) {
  const findings = scanTrackedFiles();
  if (findings.length > 0) {
    console.error(JSON.stringify({ ok: false, findings }, null, 2));
    process.exit(1);
  }

  console.info(JSON.stringify({ ok: true, findings: [] }, null, 2));
}

module.exports = {
  SECRET_PATTERNS,
  scanTrackedFiles,
  shouldScan,
};
