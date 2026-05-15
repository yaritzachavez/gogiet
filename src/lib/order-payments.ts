import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

type Queryable = Pool | PoolConnection;

type ColumnRow = RowDataPacket & {
  Field: string;
};

export async function ensureOrderPaymentColumns(conn: Queryable) {
  const [columns] = await conn.query<ColumnRow[]>("SHOW COLUMNS FROM orders");
  const columnNames = new Set(columns.map((column) => String(column.Field)));

  if (!columnNames.has("payment_provider")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN payment_provider VARCHAR(50) NULL
        AFTER payment_method
      `,
    );
  }

  if (!columnNames.has("provider_payment_id")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN provider_payment_id VARCHAR(120) NULL
        AFTER payment_provider
      `,
    );
  }

  if (!columnNames.has("payment_status")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN payment_status VARCHAR(50) NULL
        AFTER provider_payment_id
      `,
    );
  }

  if (!columnNames.has("paid_at")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN paid_at DATETIME NULL
        AFTER cancelled_at
      `,
    );
  }

  if (!columnNames.has("amount_paid")) {
    await conn.query(
      `
        ALTER TABLE orders
        ADD COLUMN amount_paid DECIMAL(10,2) NULL
        AFTER paid_at
      `,
    );
  }
}

export async function ensurePaymentsTable(conn: Queryable) {
  await conn.query(
    `
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        provider VARCHAR(50) NOT NULL,
        provider_payment_id VARCHAR(120) NULL,
        status VARCHAR(50) NOT NULL,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) NOT NULL DEFAULT 'MXN',
        raw_response MEDIUMTEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_payments_order_id (order_id),
        INDEX idx_payments_provider (provider),
        INDEX idx_payments_provider_payment_id (provider_payment_id)
      )
    `,
  );
}

type UpsertPaymentRecordInput = {
  orderId: number;
  provider: string;
  providerPaymentId?: string | null;
  status: string;
  amount: number;
  currency?: string | null;
  rawResponse?: unknown;
};

export async function upsertPaymentRecord(
  conn: Queryable,
  input: UpsertPaymentRecordInput,
) {
  await ensurePaymentsTable(conn);

  const providerPaymentId =
    typeof input.providerPaymentId === "string" &&
    input.providerPaymentId.trim().length > 0
      ? input.providerPaymentId.trim()
      : null;

  const serializedRawResponse =
    input.rawResponse == null ? null : JSON.stringify(input.rawResponse);

  if (providerPaymentId) {
    const [existingRows] = await conn.query<RowDataPacket[]>(
      `
        SELECT id
        FROM payments
        WHERE provider = ? AND provider_payment_id = ?
        LIMIT 1
      `,
      [input.provider, providerPaymentId],
    );

    if (existingRows[0]?.id) {
      await conn.query(
        `
          UPDATE payments
          SET
            order_id = ?,
            status = ?,
            amount = ?,
            currency = ?,
            raw_response = ?,
            updated_at = NOW()
          WHERE id = ?
        `,
        [
          input.orderId,
          input.status,
          input.amount,
          input.currency ?? "MXN",
          serializedRawResponse,
          existingRows[0].id,
        ],
      );

      return Number(existingRows[0].id);
    }
  }

  const [latestRows] = await conn.query<RowDataPacket[]>(
    `
      SELECT id
      FROM payments
      WHERE order_id = ? AND provider = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [input.orderId, input.provider],
  );

  if (latestRows[0]?.id) {
    await conn.query(
      `
        UPDATE payments
        SET
          provider_payment_id = COALESCE(?, provider_payment_id),
          status = ?,
          amount = ?,
          currency = ?,
          raw_response = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        providerPaymentId,
        input.status,
        input.amount,
        input.currency ?? "MXN",
        serializedRawResponse,
        latestRows[0].id,
      ],
    );

    return Number(latestRows[0].id);
  }

  const [result] = await conn.query<ResultSetHeader>(
    `
      INSERT INTO payments (
        order_id,
        provider,
        provider_payment_id,
        status,
        amount,
        currency,
        raw_response,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      input.orderId,
      input.provider,
      providerPaymentId,
      input.status,
      input.amount,
      input.currency ?? "MXN",
      serializedRawResponse,
    ],
  );

  return result.insertId;
}
