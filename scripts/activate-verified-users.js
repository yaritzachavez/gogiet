require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const mysql = require("mysql2/promise");

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
      ssl: { rejectUnauthorized: false },
    };
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  };
}

async function getStatusId(connection, names) {
  const placeholders = names.map(() => "?").join(",");
  const [rows] = await connection.query(
    `
      SELECT id, name
      FROM status_catalog
      WHERE LOWER(TRIM(name)) IN (${placeholders})
      ORDER BY id ASC
      LIMIT 1
    `,
    names,
  );

  return Number(rows[0]?.id ?? 0);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const includeAdminDisabled = process.argv.includes(
    "--include-admin-disabled",
  );
  const connection = await mysql.createConnection(getConnectionConfig());

  try {
    const activeStatusId = await getStatusId(connection, ["active", "activo"]);

    if (!activeStatusId) {
      throw new Error("No se encontró status ACTIVE/activo en status_catalog.");
    }

    const adminDisabledFilter = includeAdminDisabled
      ? ""
      : `
        AND NOT EXISTS (
          SELECT 1
          FROM audit_logs al
          WHERE al.resource_type = 'user'
            AND al.resource_id = CAST(u.id AS CHAR)
            AND al.action = 'DEACTIVATE_USER'
        )
      `;

    const [candidates] = await connection.query(
      `
        SELECT u.id, u.email, u.status_id, u.email_verified, u.email_verified_at
        FROM users u
        WHERE COALESCE(u.email_verified, 0) = 1
          AND u.status_id <> ?
          ${adminDisabledFilter}
        ORDER BY u.id ASC
      `,
      [activeStatusId],
    );

    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          activeStatusId,
          includeAdminDisabled,
          candidatesCount: candidates.length,
          candidates: candidates.map((user) => ({
            id: user.id,
            email: user.email,
            currentStatusId: user.status_id,
            emailVerifiedAt: user.email_verified_at,
          })),
        },
        null,
        2,
      ),
    );

    if (!apply || candidates.length === 0) {
      if (!apply) {
        console.log(
          "[activate-verified-users] Dry-run. Ejecuta con --apply para actualizar.",
        );
      }
      return;
    }

    const [result] = await connection.query(
      `
        UPDATE users u
        SET u.status_id = ?,
            u.email_verified_at = COALESCE(u.email_verified_at, NOW()),
            u.updated_at = NOW()
        WHERE COALESCE(u.email_verified, 0) = 1
          AND u.status_id <> ?
          ${adminDisabledFilter}
      `,
      [activeStatusId, activeStatusId],
    );

    console.log("[activate-verified-users] Usuarios activados:", {
      affectedRows: result.affectedRows,
    });
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[activate-verified-users] fatal", {
    message: error instanceof Error ? error.message : String(error),
    code: error && typeof error === "object" ? error.code : undefined,
  });
  process.exitCode = 1;
});
