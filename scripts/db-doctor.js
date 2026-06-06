require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const mysql = require("mysql2/promise");

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

function getConnectionConfig() {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
      ssl: {
        rejectUnauthorized: false,
      },
    };
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
    database: process.env.DB_NAME,
    ssl: {
      rejectUnauthorized: false,
    },
  };
}

async function getTableCount(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
    `,
    [tableName],
  );

  return Number(rows[0]?.total ?? 0);
}

async function getRowCount(connection, tableName) {
  try {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS total FROM \`${tableName}\``,
    );
    return Number(rows[0]?.total ?? 0);
  } catch {
    return null;
  }
}

async function getColumns(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT column_name AS columnName
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?
      ORDER BY ordinal_position
    `,
    [tableName],
  );

  return rows.map((row) => row.columnName);
}

async function main() {
  const config = getConnectionConfig();
  const connection = await mysql.createConnection(config);

  try {
    const [dbRows] = await connection.query("SELECT DATABASE() AS dbName");
    const database = dbRows[0]?.dbName ?? null;

    const criticalTables = [
      "users",
      "roles",
      "user_roles",
      "status_catalog",
      "business",
      "products",
      "orders",
      "payments",
      "order_status_catalog",
      "payment_methods",
      "delivery_status_catalog",
      "business_owners",
      "business_managers",
    ];

    const summary = [];
    for (const tableName of criticalTables) {
      const exists = (await getTableCount(connection, tableName)) > 0;
      summary.push({
        tableName,
        exists,
        rowCount: exists ? await getRowCount(connection, tableName) : null,
        columns: exists ? await getColumns(connection, tableName) : [],
      });
    }

    const [fkRows] = await connection.query(`
      SELECT
        table_name AS tableName,
        column_name AS columnName,
        referenced_table_name AS referencedTableName
      FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND referenced_table_name IS NOT NULL
      ORDER BY table_name, column_name
    `);

    console.log("[db-doctor] connection", {
      nodeEnv: process.env.NODE_ENV || "development",
      database,
      host: config.host,
      port: config.port,
      user: config.user ? `${config.user.slice(0, 2)}***` : null,
      databaseUrlMasked: maskUrl(process.env.DATABASE_URL),
      sslEnabled: Boolean(config.ssl),
    });

    console.log(
      JSON.stringify(
        {
          success: true,
          database,
          summary,
          foreignKeys: fkRows,
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
  console.error("[db-doctor] fatal", {
    message: error instanceof Error ? error.message : String(error),
    code: error && typeof error === "object" ? error.code : undefined,
    errno: error && typeof error === "object" ? error.errno : undefined,
    sqlMessage:
      error && typeof error === "object" ? error.sqlMessage : undefined,
  });
  process.exitCode = 1;
});
