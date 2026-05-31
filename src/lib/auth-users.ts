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
  email_verified?: number | boolean | null;
  login_attempts?: number | null;
  locked_until?: Date | string | null;
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

type BaseStatusDefinition = {
  id: number;
  name: string;
  description: string;
};

const BASE_AUTH_STATUSES: BaseStatusDefinition[] = [
  {
    id: 1,
    name: "active",
    description: "Activo",
  },
  {
    id: 2,
    name: "inactive",
    description: "Inactivo",
  },
  {
    id: 3,
    name: "pending",
    description: "Pendiente",
  },
];

const ACTIVE_STATUS_NAMES = ["active", "activo"];

let cachedUsersColumns: Set<string> | null = null;
let cachedPasswordColumn: UserPasswordColumn | null = null;
let cachedActiveStatusId: number | null = null;
let cachedInactiveStatusId: number | null = null;

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
        status_id AS statusId,
        email_verified,
        login_attempts,
        locked_until
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
        status_id AS statusId,
        email_verified,
        login_attempts,
        locked_until
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

export async function ensureBaseAuthStatuses() {
  for (const status of BASE_AUTH_STATUSES) {
    await pool.query<ResultSetHeader>(
      `
        INSERT INTO status_catalog (
          id,
          name,
          description,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          updated_at = NOW()
      `,
      [status.id, status.name, status.description],
    );
  }
}

export async function getActiveAuthStatusId() {
  if (cachedActiveStatusId && cachedActiveStatusId > 0) {
    return cachedActiveStatusId;
  }

  await ensureBaseAuthStatuses();

  const [rows] = await pool.query<StatusCatalogRow[]>(
    `
      SELECT id, name
      FROM status_catalog
      WHERE LOWER(TRIM(name)) IN (?, ?)
      ORDER BY id ASC
    `,
    ACTIVE_STATUS_NAMES,
  );

  const activeStatusId = Number(rows[0]?.id ?? 0);

  if (activeStatusId > 0) {
    cachedActiveStatusId = activeStatusId;
    return activeStatusId;
  }

  throw new Error(
    "No se encontró ni se pudo crear un estado activo en status_catalog para registrar usuarios.",
  );
}

export async function getInactiveAuthStatusId() {
  if (cachedInactiveStatusId && cachedInactiveStatusId > 0) {
    return cachedInactiveStatusId;
  }

  await ensureBaseAuthStatuses();

  const [rows] = await pool.query<StatusCatalogRow[]>(
    `
      SELECT id, name
      FROM status_catalog
      WHERE LOWER(TRIM(name)) IN (?, ?)
      ORDER BY id ASC
    `,
    ["inactive", "inactivo"],
  );

  const inactiveStatusId = Number(rows[0]?.id ?? 0);

  if (inactiveStatusId > 0) {
    cachedInactiveStatusId = inactiveStatusId;
    return inactiveStatusId;
  }

  throw new Error(
    "No se encontró ni se pudo crear un estado inactivo en status_catalog para administrar usuarios.",
  );
}

export async function isAuthUserActive(userId: number) {
  const activeStatusId = await getActiveAuthStatusId();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id
      FROM users
      WHERE id = ? AND status_id = ?
      LIMIT 1
    `,
    [userId, activeStatusId],
  );

  return rows.length > 0;
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
