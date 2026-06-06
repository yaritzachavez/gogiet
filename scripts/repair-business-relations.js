#!/usr/bin/env node

require("dotenv").config({ path: ".env" });

const mysql = require("mysql2/promise");
const {
  assertSafeWriteTarget,
  logDbOperationTarget,
} = require("./lib/db-write-guard");

function resolveSslConfig() {
  const caCertificate = process.env.DB_CA || process.env.DB_SSL_CA;

  if (!caCertificate || !caCertificate.includes("BEGIN CERTIFICATE")) {
    return { rejectUnauthorized: false };
  }

  return {
    ca: caCertificate.replace(/\\n/g, "\n"),
  };
}

async function main() {
  const applyChanges = process.argv.includes("--apply");
  if (applyChanges) {
    assertSafeWriteTarget({
      operation: "scripts/repair-business-relations.js --apply",
    });
  } else {
    logDbOperationTarget({
      operation: "scripts/repair-business-relations.js dry-run",
      mode: "read",
    });
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
    database: process.env.DB_NAME,
    ssl: resolveSslConfig(),
  });

  try {
    const [orphanedOwners] = await connection.query(`
      SELECT
        bo.business_id,
        bo.user_id,
        b.id AS existing_business_id,
        u.id AS existing_user_id
      FROM business_owners bo
      LEFT JOIN businesses b ON b.id = bo.business_id
      LEFT JOIN users u ON u.id = bo.user_id
      WHERE b.id IS NULL OR u.id IS NULL
      ORDER BY bo.business_id ASC, bo.user_id ASC
    `);

    const [orphanedManagers] = await connection.query(`
      SELECT
        bm.business_id,
        bm.user_id,
        b.id AS existing_business_id,
        u.id AS existing_user_id
      FROM business_managers bm
      LEFT JOIN businesses b ON b.id = bm.business_id
      LEFT JOIN users u ON u.id = bm.user_id
      WHERE b.id IS NULL OR u.id IS NULL
      ORDER BY bm.business_id ASC, bm.user_id ASC
    `);

    console.log(
      JSON.stringify(
        {
          applyChanges,
          orphaned_business_owners: orphanedOwners,
          orphaned_business_managers: orphanedManagers,
        },
        null,
        2,
      ),
    );

    if (!applyChanges) {
      console.log(
        "Dry run completado. Usa `npm run repair:business-relations -- --apply` para eliminar relaciones rotas.",
      );
      return;
    }

    await connection.beginTransaction();

    for (const row of orphanedOwners) {
      await connection.query(
        `
          DELETE FROM business_owners
          WHERE business_id = ? AND user_id = ?
        `,
        [row.business_id, row.user_id],
      );
    }

    for (const row of orphanedManagers) {
      await connection.query(
        `
          DELETE FROM business_managers
          WHERE business_id = ? AND user_id = ?
        `,
        [row.business_id, row.user_id],
      );
    }

    await connection.commit();

    console.log(
      `Reparacion completada. Eliminadas ${orphanedOwners.length} relaciones en business_owners y ${orphanedManagers.length} en business_managers.`,
    );
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("Error reparando relaciones de negocio:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Fallo inesperado en repair-business-relations:", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
