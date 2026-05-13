#!/usr/bin/env node

require("dotenv").config({ path: ".env" });

const mysql = require("mysql2/promise");

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
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
    database: process.env.DB_NAME,
    ssl: resolveSslConfig(),
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS business_owners (
        business_id INT NOT NULL,
        user_id INT NOT NULL,
        assigned_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
        notes VARCHAR(255) NULL,
        PRIMARY KEY (business_id, user_id),
        INDEX fk_business_owners_user (user_id),
        CONSTRAINT fk_business_owners_business
          FOREIGN KEY (business_id) REFERENCES businesses(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_business_owners_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    console.log(
      "Tabla business_owners verificada/creada correctamente en la base actual.",
    );
  } catch (error) {
    console.error("Error asegurando business_owners:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Fallo inesperado en ensure-business-owners-table:", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
