import bcrypt from "bcrypt";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";

import pool from "@/lib/db";

export const runtime = "nodejs";

const DEVELOPMENT_ADMIN_EMAIL = "yaritzachavezc@gmail.com";
const DEVELOPMENT_ADMIN_PASSWORD = "Admin123456*";
const ADMIN_ROLE_CANDIDATES = [
  "admin_general",
  "admin",
  "administrador_general",
  "administrador",
] as const;

type ExistingUserRow = RowDataPacket & {
  id: number;
};

type TableRow = RowDataPacket & {
  tableName: string;
};

type ColumnRow = RowDataPacket & {
  tableName: string;
  columnName: string;
};

type RoleRow = RowDataPacket & {
  id: number;
  name: string;
};

type DatabaseRow = RowDataPacket & {
  databaseName: string | null;
};

type SqlLikeError = {
  code?: string;
  errno?: number;
  sqlMessage?: string;
  message?: string;
  stack?: string;
};

async function inspectSchema(connection: PoolConnection) {
  const [databaseRows] = await connection.query<DatabaseRow[]>(
    "SELECT DATABASE() AS databaseName",
  );

  const [tableRows] = await connection.query<TableRow[]>(
    `
      SELECT TABLE_NAME AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
      ORDER BY TABLE_NAME ASC
    `,
  );

  const [columnRows] = await connection.query<ColumnRow[]>(
    `
      SELECT
        TABLE_NAME AS tableName,
        COLUMN_NAME AS columnName
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
      ORDER BY TABLE_NAME ASC, ORDINAL_POSITION ASC
    `,
  );

  const columnsByTable = new Map<string, Set<string>>();

  for (const row of columnRows) {
    const tableName = String(row.tableName ?? "").trim();
    const columnName = String(row.columnName ?? "").trim();

    if (!tableName || !columnName) {
      continue;
    }

    const existing = columnsByTable.get(tableName) ?? new Set<string>();
    existing.add(columnName);
    columnsByTable.set(tableName, existing);
  }

  return {
    database: String(databaseRows[0]?.databaseName ?? "").trim(),
    tables: tableRows
      .map((row) => String(row.tableName ?? "").trim())
      .filter(Boolean),
    columnsByTable,
  };
}

async function ensureColumn(
  connection: PoolConnection,
  tableName: string,
  currentColumns: Set<string>,
  columnName: string,
  definition: string,
) {
  if (currentColumns.has(columnName)) {
    return;
  }

  await connection.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
  );
  currentColumns.add(columnName);
}

async function ensureCoreTables(connection: PoolConnection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS status_catalog (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      description VARCHAR(150) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_status_catalog_name (name)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(80) NOT NULL,
      last_name VARCHAR(80) NULL,
      email VARCHAR(120) NOT NULL,
      phone VARCHAR(20) NULL,
      password_hash VARCHAR(255) NOT NULL,
      status_id INT NOT NULL,
      email_verified BOOLEAN NULL DEFAULT FALSE,
      verification_code VARCHAR(10) NULL,
      verification_expires_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_users_email (email),
      UNIQUE KEY uk_users_phone (phone),
      KEY fk_users_status (status_id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      description VARCHAR(150) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_roles_name (name)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INT NOT NULL,
      role_id INT NOT NULL,
      assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, role_id),
      KEY fk_user_roles_role (role_id)
    )
  `);
}

async function ensureCoreColumns(connection: PoolConnection) {
  const schema = await inspectSchema(connection);
  const usersColumns = schema.columnsByTable.get("users") ?? new Set<string>();
  const rolesColumns = schema.columnsByTable.get("roles") ?? new Set<string>();
  const userRolesColumns =
    schema.columnsByTable.get("user_roles") ?? new Set<string>();
  const statusColumns =
    schema.columnsByTable.get("status_catalog") ?? new Set<string>();

  await ensureColumn(connection, "users", usersColumns, "first_name", "VARCHAR(80) NOT NULL DEFAULT ''");
  await ensureColumn(connection, "users", usersColumns, "last_name", "VARCHAR(80) NULL");
  await ensureColumn(connection, "users", usersColumns, "email", "VARCHAR(120) NOT NULL DEFAULT ''");
  await ensureColumn(connection, "users", usersColumns, "phone", "VARCHAR(20) NULL");

  if (!usersColumns.has("password_hash") && !usersColumns.has("password")) {
    await ensureColumn(
      connection,
      "users",
      usersColumns,
      "password_hash",
      "VARCHAR(255) NOT NULL DEFAULT ''",
    );
  }

  await ensureColumn(connection, "users", usersColumns, "status_id", "INT NOT NULL DEFAULT 1");
  await ensureColumn(connection, "users", usersColumns, "email_verified", "BOOLEAN NULL DEFAULT FALSE");
  await ensureColumn(connection, "users", usersColumns, "verification_code", "VARCHAR(10) NULL");
  await ensureColumn(connection, "users", usersColumns, "verification_expires_at", "DATETIME NULL");
  await ensureColumn(connection, "users", usersColumns, "created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn(
    connection,
    "users",
    usersColumns,
    "updated_at",
    "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  );

  await ensureColumn(connection, "roles", rolesColumns, "name", "VARCHAR(50) NOT NULL DEFAULT ''");
  await ensureColumn(connection, "roles", rolesColumns, "description", "VARCHAR(150) NULL");
  await ensureColumn(connection, "roles", rolesColumns, "created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn(
    connection,
    "roles",
    rolesColumns,
    "updated_at",
    "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  );

  await ensureColumn(connection, "user_roles", userRolesColumns, "user_id", "INT NOT NULL");
  await ensureColumn(connection, "user_roles", userRolesColumns, "role_id", "INT NOT NULL");
  await ensureColumn(
    connection,
    "user_roles",
    userRolesColumns,
    "assigned_at",
    "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
  );

  await ensureColumn(connection, "status_catalog", statusColumns, "name", "VARCHAR(50) NOT NULL DEFAULT ''");
  await ensureColumn(connection, "status_catalog", statusColumns, "description", "VARCHAR(150) NULL");
  await ensureColumn(
    connection,
    "status_catalog",
    statusColumns,
    "created_at",
    "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
  );
  await ensureColumn(
    connection,
    "status_catalog",
    statusColumns,
    "updated_at",
    "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  );
}

function getPasswordColumn(usersColumns: Set<string>) {
  if (usersColumns.has("password_hash")) {
    return "password_hash";
  }

  if (usersColumns.has("password")) {
    return "password";
  }

  return "password_hash";
}

async function ensureActiveStatus(connection: PoolConnection) {
  await connection.query<ResultSetHeader>(
    `
      INSERT INTO status_catalog (name, description, created_at, updated_at)
      SELECT ?, ?, NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1
        FROM status_catalog
        WHERE LOWER(TRIM(name)) IN ('active', 'activo')
      )
    `,
    ["active", "Activo"],
  );

  const [statusRows] = await connection.query<RowDataPacket[]>(
    `
      SELECT id
      FROM status_catalog
      WHERE LOWER(TRIM(name)) IN ('active', 'activo')
      ORDER BY id ASC
      LIMIT 1
    `,
  );

  const statusId = Number(statusRows[0]?.id ?? 0);

  if (statusId <= 0) {
    throw new Error("No se pudo resolver el status activo.");
  }

  return statusId;
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        success: false,
        error: "Ruta no disponible en producción.",
      },
      { status: 403 },
    );
  }

  const configuredSaltRounds = Number(process.env.SALT_ROUNDS ?? 12);
  const saltRounds =
    Number.isFinite(configuredSaltRounds) && configuredSaltRounds > 0
      ? configuredSaltRounds
      : 12;
  const pepper = process.env.PASSWORD_PEPPER ?? "";

  try {
    const passwordHash = await bcrypt.hash(
      DEVELOPMENT_ADMIN_PASSWORD + pepper,
      saltRounds,
    );

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await ensureCoreTables(connection);
      await ensureCoreColumns(connection);

      let schema = await inspectSchema(connection);
      console.log("DEV CREATE ADMIN SCHEMA SAMPLE:", {
        database: schema.database,
        tables: schema.tables.slice(0, 10),
        usersColumns: Array.from(schema.columnsByTable.get("users") ?? []).slice(
          0,
          20,
        ),
      });

      const usersColumns = schema.columnsByTable.get("users") ?? new Set<string>();
      const passwordColumn = getPasswordColumn(usersColumns);
      const activeStatusId = await ensureActiveStatus(connection);

      const [existingUsers] = await connection.query<ExistingUserRow[]>(
        `
          SELECT id
          FROM users
          WHERE LOWER(TRIM(email)) = ?
          LIMIT 1
        `,
        [DEVELOPMENT_ADMIN_EMAIL],
      );

      let userId = Number(existingUsers[0]?.id ?? 0);

      if (userId > 0) {
        const updateAssignments: string[] = [
          "first_name = ?",
          "last_name = ?",
          `\`${passwordColumn}\` = ?`,
          "status_id = ?",
        ];
        const updateValues: Array<string | number | null> = [
          "Yaritza",
          "Chavez",
          passwordHash,
          activeStatusId,
        ];

        if (usersColumns.has("email_verified")) {
          updateAssignments.push("email_verified = ?");
          updateValues.push(1);
        }

        if (usersColumns.has("verification_code")) {
          updateAssignments.push("verification_code = ?");
          updateValues.push(null);
        }

        if (usersColumns.has("verification_expires_at")) {
          updateAssignments.push("verification_expires_at = ?");
          updateValues.push(null);
        }

        if (usersColumns.has("updated_at")) {
          updateAssignments.push("updated_at = NOW()");
        }

        updateValues.push(userId);

        await connection.query<ResultSetHeader>(
          `
            UPDATE users
            SET ${updateAssignments.join(", ")}
            WHERE id = ?
          `,
          updateValues,
        );
      } else {
        const insertColumns = [
          "first_name",
          "last_name",
          "email",
          `\`${passwordColumn}\``,
          "status_id",
        ];
        const insertValues: Array<string | number | null> = [
          "Yaritza",
          "Chavez",
          DEVELOPMENT_ADMIN_EMAIL,
          passwordHash,
          activeStatusId,
        ];
        const placeholders = ["?", "?", "?", "?", "?"];

        if (usersColumns.has("phone")) {
          insertColumns.push("phone");
          insertValues.push(null);
          placeholders.push("?");
        }

        if (usersColumns.has("email_verified")) {
          insertColumns.push("email_verified");
          insertValues.push(1);
          placeholders.push("?");
        }

        if (usersColumns.has("verification_code")) {
          insertColumns.push("verification_code");
          insertValues.push(null);
          placeholders.push("?");
        }

        if (usersColumns.has("verification_expires_at")) {
          insertColumns.push("verification_expires_at");
          insertValues.push(null);
          placeholders.push("?");
        }

        const [insertResult] = await connection.query<ResultSetHeader>(
          `
            INSERT INTO users (${insertColumns.join(", ")})
            VALUES (${placeholders.join(", ")})
          `,
          insertValues,
        );

        userId = Number(insertResult.insertId ?? 0);
      }

      const [existingRoleRows] = await connection.query<RoleRow[]>(
        `
          SELECT id, name
          FROM roles
          WHERE LOWER(TRIM(name)) IN (${ADMIN_ROLE_CANDIDATES.map(() => "?").join(", ")})
          ORDER BY id ASC
          LIMIT 1
        `,
        ADMIN_ROLE_CANDIDATES.map((role) => role.toLowerCase()),
      );

      let roleId = Number(existingRoleRows[0]?.id ?? 0);
      let roleName = String(existingRoleRows[0]?.name ?? "").trim();

      if (roleId <= 0) {
        const [roleInsert] = await connection.query<ResultSetHeader>(
          `
            INSERT INTO roles (name, description, created_at, updated_at)
            VALUES (?, ?, NOW(), NOW())
          `,
          ["admin_general", "Administrador general temporal de desarrollo"],
        );

        roleId = Number(roleInsert.insertId ?? 0);
        roleName = "admin_general";
      }

      const [existingRelationRows] = await connection.query<RowDataPacket[]>(
        `
          SELECT user_id
          FROM user_roles
          WHERE user_id = ? AND role_id = ?
          LIMIT 1
        `,
        [userId, roleId],
      );

      if (existingRelationRows.length === 0) {
        await connection.query<ResultSetHeader>(
          `
            INSERT INTO user_roles (user_id, role_id, assigned_at)
            VALUES (?, ?, NOW())
          `,
          [userId, roleId],
        );
      }

      await connection.commit();

      schema = await inspectSchema(connection);

      return NextResponse.json({
        success: true,
        email: DEVELOPMENT_ADMIN_EMAIL,
        role: roleName || "admin_general",
        database: schema.database,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    const sqlError =
      typeof error === "object" && error !== null
        ? (error as SqlLikeError)
        : null;

    console.error("DEV CREATE ADMIN ERROR:", {
      code: sqlError?.code ?? null,
      errno: sqlError?.errno ?? null,
      sqlMessage: sqlError?.sqlMessage ?? null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : sqlError?.stack,
      email: DEVELOPMENT_ADMIN_EMAIL,
      nodeEnv: process.env.NODE_ENV ?? "development",
    });

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo crear o actualizar el admin temporal.",
      },
      { status: 500 },
    );
  }
}
