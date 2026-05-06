import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import pool from "@/lib/db";

type Queryable = Pool | PoolConnection;

type ColumnRow = RowDataPacket & {
  COLUMN_NAME: string;
};

export async function ensureFavoritesTable(executor: Queryable = pool) {
  await executor.query(
    `
      CREATE TABLE IF NOT EXISTS favorites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        favorite_type VARCHAR(30) NOT NULL,
        target_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_favorites_unique (user_id, favorite_type, target_id),
        KEY idx_favorites_user_id (user_id),
        CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `,
  );

  const [columns] = await executor.query<ColumnRow[]>(
    `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'favorites'
    `,
  );

  const hasCreatedAt = columns.some(
    (column) => column.COLUMN_NAME === "created_at",
  );

  if (!hasCreatedAt) {
    await executor.query(
      `
        ALTER TABLE favorites
        ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      `,
    );
  }
}
