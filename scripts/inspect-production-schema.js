require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const mysql = require("mysql2/promise");

const TABLES_TO_CHECK = [
  "users",
  "roles",
  "user_roles",
  "business",
  "businesses",
  "notifications",
  "user_notifications",
  "addresses",
  "account_address",
  "account_addresses",
  "business_owners",
  "business_managers",
];

function maskUrl(value) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    const username = parsed.username
      ? `${decodeURIComponent(parsed.username).slice(0, 2)}***`
      : "";
    const database = parsed.pathname.replace(/^\//, "");

    return `${parsed.protocol}//${username}:***@${parsed.hostname}${
      parsed.port ? `:${parsed.port}` : ""
    }/${database}${parsed.search}`;
  } catch {
    return "[invalid DATABASE_URL]";
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida.");
  }

  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete("ssl-mode");

  const connection = await mysql.createConnection({
    uri: url.toString(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    const [tables] = await connection.query(
      `
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (${TABLES_TO_CHECK.map(() => "?").join(", ")})
        ORDER BY TABLE_NAME ASC
      `,
      TABLES_TO_CHECK,
    );

    const existingTables = new Set(
      tables.map((row) => String(row.TABLE_NAME ?? "").trim()).filter(Boolean),
    );

    const report = [];

    for (const tableName of TABLES_TO_CHECK) {
      if (!existingTables.has(tableName)) {
        report.push({
          table: tableName,
          exists: false,
          columns: [],
          rows: null,
        });
        continue;
      }

      const [columns] = await connection.query(
        `
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION ASC
        `,
        [tableName],
      );

      const [countRows] = await connection.query(
        `SELECT COUNT(*) AS total FROM \`${tableName}\``,
      );

      report.push({
        table: tableName,
        exists: true,
        columns: columns.map((row) => String(row.COLUMN_NAME ?? "")),
        rows: Number(countRows[0]?.total ?? 0),
      });
    }

    console.log(
      JSON.stringify(
        {
          databaseUrlMasked: maskUrl(process.env.DATABASE_URL),
          report,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
