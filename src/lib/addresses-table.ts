import type { RowDataPacket } from "mysql2/promise";

import { prisma } from "@/lib/prisma";

type AddressColumnRow = RowDataPacket & {
  COLUMN_NAME: string;
};

async function getAddressColumns() {
  const rows = await prisma.$queryRaw<AddressColumnRow[]>`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'addresses'
  `;

  return new Set(rows.map((row) => String(row.COLUMN_NAME ?? "")));
}

async function addAddressColumnIfMissing(
  columnName: string,
  definition: string,
  availableColumns: Set<string>,
) {
  if (availableColumns.has(columnName)) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE addresses ADD COLUMN \`${columnName}\` ${definition}`,
  );
  availableColumns.add(columnName);
}

export async function ensureAddressesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      label VARCHAR(50) NULL,
      recipient_name VARCHAR(120) NULL,
      phone VARCHAR(20) NULL,
      street VARCHAR(120) NOT NULL,
      external_number VARCHAR(20) NULL,
      internal_number VARCHAR(20) NULL,
      neighborhood VARCHAR(120) NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      postal_code VARCHAR(10) NOT NULL DEFAULT '49500',
      reference_notes VARCHAR(255) NULL,
      latitude DECIMAL(10,7) NULL,
      longitude DECIMAL(10,7) NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      status_id INT NOT NULL DEFAULT 1,
      created_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_addresses_user_id (user_id),
      INDEX idx_addresses_status_id (status_id),
      INDEX idx_addresses_is_default (is_default)
    )
  `);

  const availableColumns = await getAddressColumns();

  await addAddressColumnIfMissing("user_id", "INT NULL", availableColumns);
  await addAddressColumnIfMissing(
    "label",
    "VARCHAR(50) NULL",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "recipient_name",
    "VARCHAR(120) NULL",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "phone",
    "VARCHAR(20) NULL",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "street",
    "VARCHAR(120) NOT NULL DEFAULT ''",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "external_number",
    "VARCHAR(20) NULL",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "internal_number",
    "VARCHAR(20) NULL",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "neighborhood",
    "VARCHAR(120) NOT NULL DEFAULT ''",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "city",
    "VARCHAR(100) NOT NULL DEFAULT 'Mazamitla'",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "state",
    "VARCHAR(100) NOT NULL DEFAULT 'Jalisco'",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "postal_code",
    "VARCHAR(10) NOT NULL DEFAULT '49500'",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "reference_notes",
    "VARCHAR(255) NULL",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "latitude",
    "DECIMAL(10,7) NULL",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "longitude",
    "DECIMAL(10,7) NULL",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "is_default",
    "BOOLEAN NOT NULL DEFAULT FALSE",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "status_id",
    "INT NOT NULL DEFAULT 1",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "created_at",
    "DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP",
    availableColumns,
  );
  await addAddressColumnIfMissing(
    "updated_at",
    "DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    availableColumns,
  );
}
