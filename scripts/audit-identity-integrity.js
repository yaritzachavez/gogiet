#!/usr/bin/env node

const mysql = require("mysql2/promise");

const {
  IDENTITY_AUDIT_QUERIES,
  buildIdentityAuditReport,
  buildSessionIntegrityQuery,
} = require("./lib/read-only-audits");

async function getConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for read-only audits.");
  }

  const url = new URL(process.env.DATABASE_URL);
  return mysql.createConnection(url.toString());
}

async function detectSessionSchema(connection) {
  const [rows] = await connection.query("SHOW COLUMNS FROM user_sessions");
  const columns = new Set(
    rows
      .map((row) =>
        String(row.Field ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );

  return {
    hasLastActiveAt: columns.has("last_active_at"),
    hasLastUsedAt: columns.has("last_used_at"),
    hasExpiresAt: columns.has("expires_at"),
    hasRevokedAt: columns.has("revoked_at"),
    hasStatus: columns.has("status"),
  };
}

async function runIdentityAudit() {
  const connection = await getConnection();

  try {
    const sessionSchema = await detectSessionSchema(connection);
    const results = {};

    for (const [key, query] of Object.entries(IDENTITY_AUDIT_QUERIES)) {
      const [rows] = await connection.query(query);
      results[key] = rows[0] ?? { total: 0 };
    }

    const [sessionRows] = await connection.query(
      buildSessionIntegrityQuery(sessionSchema),
    );
    results.sessionIntegrity = sessionRows[0] ?? {};

    console.info(
      JSON.stringify(
        {
          mode: "read-only",
          database: new URL(process.env.DATABASE_URL).pathname.replace(
            /^\//,
            "",
          ),
          report: buildIdentityAuditReport(results),
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  runIdentityAudit().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  detectSessionSchema,
  runIdentityAudit,
};
