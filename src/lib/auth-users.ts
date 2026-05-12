import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";

type UserPasswordColumn = "password_hash" | "password";

type AuthUserRow = RowDataPacket & {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string;
  password: string;
  statusId: number;
};

type CreatedAuthUserRow = RowDataPacket & {
  id: number;
  firstName: string;
  email: string;
  phone: string | null;
  createdAt: Date;
};

type StatusCatalogRow = RowDataPacket & {
  id: number;
  name: string;
};

let cachedUsersColumns: Set<string> | null = null;
let cachedPasswordColumn: UserPasswordColumn | null = null;
let cachedActiveStatusId: number | null = null;

async function getUsersColumns() {
  if (cachedUsersColumns) {
    return cachedUsersColumns;
  }

  const [rows] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM users");
  const columns = new Set(rows.map((row) => String(row.Field ?? "")));
  cachedUsersColumns = columns;
  return columns;
}

export async function getUserPasswordColumn(): Promise<UserPasswordColumn> {
  if (cachedPasswordColumn) {
    return cachedPasswordColumn;
  }

  const columns = await getUsersColumns();

  if (columns.has("password_hash")) {
    cachedPasswordColumn = "password_hash";
    return cachedPasswordColumn;
  }

  if (columns.has("password")) {
    cachedPasswordColumn = "password";
    return cachedPasswordColumn;
  }

  throw new Error(
    "La tabla users no tiene una columna de contraseña compatible (password_hash o password).",
  );
}

export async function findAuthUserByEmail(email: string) {
  const passwordColumn = await getUserPasswordColumn();

  const [rows] = await pool.query<AuthUserRow[]>(
    `
      SELECT
        id,
        first_name AS firstName,
        last_name AS lastName,
        email,
        \`${passwordColumn}\` AS password,
        status_id AS statusId
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email],
  );

  return rows[0] ?? null;
}

export async function findAuthUserById(id: number) {
  const passwordColumn = await getUserPasswordColumn();

  const [rows] = await pool.query<AuthUserRow[]>(
    `
      SELECT
        id,
        first_name AS firstName,
        last_name AS lastName,
        email,
        \`${passwordColumn}\` AS password,
        status_id AS statusId
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  );

  return rows[0] ?? null;
}

export async function findNormalizedEmailMatchId(normalizedEmail: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id
      FROM users
      WHERE LOWER(TRIM(email)) = ?
      LIMIT 1
    `,
    [normalizedEmail],
  );

  return Number(rows[0]?.id ?? 0);
}

export async function findUserIdByPhone(phone: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id
      FROM users
      WHERE phone = ?
      LIMIT 1
    `,
    [phone],
  );

  return Number(rows[0]?.id ?? 0);
}

export async function getActiveAuthStatusId() {
  if (cachedActiveStatusId && cachedActiveStatusId > 0) {
    return cachedActiveStatusId;
  }

  const [rows] = await pool.query<StatusCatalogRow[]>(
    `
      SELECT id, name
      FROM status_catalog
      WHERE LOWER(TRIM(name)) IN ('activo', 'active')
      ORDER BY id ASC
    `,
  );

  const activeStatusId = Number(rows[0]?.id ?? 0);

  if (activeStatusId > 0) {
    cachedActiveStatusId = activeStatusId;
    return activeStatusId;
  }

  throw new Error(
    "No se encontró un estado activo en status_catalog para registrar usuarios.",
  );
}

export async function createAuthUser(params: {
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  passwordHash: string;
  statusId: number;
}) {
  const passwordColumn = await getUserPasswordColumn();

  const [result] = await pool.query<ResultSetHeader>(
    `
      INSERT INTO users (
        first_name,
        last_name,
        email,
        phone,
        \`${passwordColumn}\`,
        status_id
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      params.firstName,
      params.lastName,
      params.email,
      params.phone,
      params.passwordHash,
      params.statusId,
    ],
  );

  const insertedId = Number(result.insertId ?? 0);

  const [rows] = await pool.query<CreatedAuthUserRow[]>(
    `
      SELECT
        id,
        first_name AS firstName,
        email,
        phone,
        created_at AS createdAt
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [insertedId],
  );

  return rows[0] ?? null;
}

export async function updateAuthUserPassword(
  userId: number,
  passwordHash: string,
) {
  const passwordColumn = await getUserPasswordColumn();

  await pool.query<ResultSetHeader>(
    `
      UPDATE users
      SET \`${passwordColumn}\` = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [passwordHash, userId],
  );
}

export async function updateAuthUserLastLogin(userId: number) {
  await pool.query<ResultSetHeader>(
    `
      UPDATE users
      SET last_login = NOW(), updated_at = NOW()
      WHERE id = ?
    `,
    [userId],
  );
}
