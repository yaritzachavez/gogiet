import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";
import { assertTablesExist } from "@/lib/runtime-schema";

type Queryable = {
  query: (...args: unknown[]) => Promise<unknown>;
};

type UserAvatarColumnRow = RowDataPacket & {
  column_name: string;
};

export type UserAvatarColumns = {
  hasProfileImageUrl: boolean;
  hasAvatarUrl: boolean;
};

export async function getUserAvatarColumns(
  executor: Queryable | PoolConnection | Pool = pool,
): Promise<UserAvatarColumns> {
  await assertTablesExist(executor as Pool | PoolConnection, ["users"]);
  const [rows] = (await executor.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name IN ('profile_image_url', 'avatar_url')
    `,
  )) as [UserAvatarColumnRow[], unknown];

  const columnNames = new Set(
    rows.map((row) => String(row.column_name).toLowerCase()),
  );

  return {
    hasProfileImageUrl: columnNames.has("profile_image_url"),
    hasAvatarUrl: columnNames.has("avatar_url"),
  };
}

export async function ensureUserAvatarColumn(
  executor: Queryable | PoolConnection | Pool = pool,
) {
  return getUserAvatarColumns(executor);
}

export function buildUserAvatarSelect(
  alias: string,
  columns: UserAvatarColumns,
  targetAlias = "profile_image_url",
) {
  const expressions = [
    columns.hasProfileImageUrl ? `${alias}.profile_image_url` : null,
    columns.hasAvatarUrl ? `${alias}.avatar_url` : null,
  ].filter(Boolean);

  if (!expressions.length) {
    return `NULL AS ${targetAlias}`;
  }

  return `COALESCE(${expressions.join(", ")}) AS ${targetAlias}`;
}

export function getPreferredUserAvatarColumn(columns: UserAvatarColumns) {
  if (columns.hasProfileImageUrl) {
    return "profile_image_url" as const;
  }

  if (columns.hasAvatarUrl) {
    return "avatar_url" as const;
  }

  return "profile_image_url" as const;
}
