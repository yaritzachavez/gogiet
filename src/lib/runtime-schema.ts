import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

type Queryable = Pool | PoolConnection;

type TableRow = RowDataPacket & {
  table_name?: string;
};

type ColumnRow = RowDataPacket & {
  COLUMN_NAME?: string;
  column_name?: string;
};

type IndexRow = RowDataPacket & {
  INDEX_NAME?: string;
  Key_name?: string;
};

export class RuntimeSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeSchemaError";
  }
}

function createMissingMigrationMessage(kind: string, name: string) {
  return `Falta ${kind} requerida en runtime: ${name}. Ejecuta migraciones con prisma migrate deploy antes de atender tráfico.`;
}

export async function getExistingTables(
  executor: Queryable,
  tableNames: string[],
) {
  const [rows] = await executor.query<TableRow[]>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (${tableNames.map(() => "?").join(", ")})
    `,
    tableNames,
  );

  return new Set(
    rows
      .map((row) => String(row.table_name ?? "").trim())
      .filter(Boolean),
  );
}

export async function assertTablesExist(
  executor: Queryable,
  tableNames: string[],
) {
  const existingTables = await getExistingTables(executor, tableNames);
  const missingTables = tableNames.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length > 0) {
    throw new RuntimeSchemaError(
      createMissingMigrationMessage("tabla", missingTables.join(", ")),
    );
  }
}

export async function getExistingColumns(
  executor: Queryable,
  tableName: string,
  columnNames?: string[],
) {
  const filters =
    columnNames && columnNames.length > 0
      ? ` AND column_name IN (${columnNames.map(() => "?").join(", ")})`
      : "";
  const values = columnNames && columnNames.length > 0 ? [tableName, ...columnNames] : [tableName];

  const [rows] = await executor.query<ColumnRow[]>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?${filters}
    `,
    values,
  );

  return new Set(
    rows
      .map((row) =>
        String(row.column_name ?? row.COLUMN_NAME ?? "").trim().toLowerCase(),
      )
      .filter(Boolean),
  );
}

export async function assertColumnsExist(
  executor: Queryable,
  tableName: string,
  columnNames: string[],
) {
  const existingColumns = await getExistingColumns(executor, tableName, columnNames);
  const missingColumns = columnNames.filter(
    (columnName) => !existingColumns.has(columnName.toLowerCase()),
  );

  if (missingColumns.length > 0) {
    throw new RuntimeSchemaError(
      createMissingMigrationMessage(
        `columnas en ${tableName}`,
        missingColumns.join(", "),
      ),
    );
  }
}

export async function assertIndexesExist(
  executor: Queryable,
  tableName: string,
  indexNames: string[],
) {
  const [rows] = await executor.query<IndexRow[]>(
    `
      SELECT index_name
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name IN (${indexNames.map(() => "?").join(", ")})
    `,
    [tableName, ...indexNames],
  );

  const existingIndexes = new Set(
    rows
      .map((row) => String(row.INDEX_NAME ?? row.Key_name ?? "").trim())
      .filter(Boolean),
  );
  const missingIndexes = indexNames.filter(
    (indexName) => !existingIndexes.has(indexName),
  );

  if (missingIndexes.length > 0) {
    throw new RuntimeSchemaError(
      createMissingMigrationMessage(
        `índices en ${tableName}`,
        missingIndexes.join(", "),
      ),
    );
  }
}
