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

async function loadOrphanedOwners(connection) {
  const [rows] = await connection.query(`
    SELECT
      bo.business_id,
      bo.user_id,
      bo.assigned_at,
      bo.notes,
      b.id AS existing_business_id,
      u.id AS existing_user_id
    FROM business_owners bo
    LEFT JOIN businesses b ON b.id = bo.business_id
    LEFT JOIN users u ON u.id = bo.user_id
    WHERE b.id IS NULL OR u.id IS NULL
    ORDER BY bo.business_id ASC, bo.user_id ASC
  `);

  return rows;
}

async function loadDuplicateOwners(connection) {
  const [rows] = await connection.query(`
    SELECT
      business_id,
      user_id,
      COUNT(*) AS duplicate_count
    FROM business_owners
    GROUP BY business_id, user_id
    HAVING COUNT(*) > 1
    ORDER BY business_id ASC, user_id ASC
  `);

  return rows;
}

async function cleanupDuplicateOwners(connection) {
  await connection.query(`
    CREATE TEMPORARY TABLE tmp_business_owner_duplicates AS
    SELECT
      business_id,
      user_id,
      assigned_at,
      notes,
      ROW_NUMBER() OVER (
        PARTITION BY business_id, user_id
        ORDER BY assigned_at ASC, COALESCE(notes, '') ASC
      ) AS row_num
    FROM business_owners
  `);

  const [deleteResult] = await connection.query(`
    DELETE bo
    FROM business_owners bo
    INNER JOIN tmp_business_owner_duplicates tmp
      ON tmp.business_id = bo.business_id
      AND tmp.user_id = bo.user_id
      AND tmp.assigned_at <=> bo.assigned_at
      AND tmp.notes <=> bo.notes
    WHERE tmp.row_num > 1
  `);

  await connection.query(
    "DROP TEMPORARY TABLE IF EXISTS tmp_business_owner_duplicates",
  );

  return Number(deleteResult.affectedRows ?? 0);
}

async function main() {
  const applyChanges = process.argv.includes("--apply");
  if (applyChanges) {
    assertSafeWriteTarget({
      operation: "scripts/cleanup-business-owners.js --apply",
    });
  } else {
    logDbOperationTarget({
      operation: "scripts/cleanup-business-owners.js dry-run",
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
    const orphanedOwners = await loadOrphanedOwners(connection);
    const duplicateOwners = await loadDuplicateOwners(connection);

    console.log(
      JSON.stringify(
        {
          applyChanges,
          orphaned_business_owners: orphanedOwners,
          duplicate_business_owners: duplicateOwners,
        },
        null,
        2,
      ),
    );

    if (!applyChanges) {
      console.log(
        "Dry run completado. Usa `npm run cleanup:business-owners -- --apply` para limpiar relaciones huérfanas y duplicadas.",
      );
      return;
    }

    await connection.beginTransaction();

    let deletedOrphans = 0;
    for (const row of orphanedOwners) {
      const [result] = await connection.query(
        `
          DELETE FROM business_owners
          WHERE business_id = ? AND user_id = ?
        `,
        [row.business_id, row.user_id],
      );
      deletedOrphans += Number(result.affectedRows ?? 0);
    }

    const deletedDuplicates = await cleanupDuplicateOwners(connection);

    await connection.commit();

    console.log(
      JSON.stringify(
        {
          success: true,
          deleted_orphaned_business_owners: deletedOrphans,
          deleted_duplicate_business_owners: deletedDuplicates,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("Error limpiando business_owners:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Fallo inesperado en cleanup-business-owners:", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
