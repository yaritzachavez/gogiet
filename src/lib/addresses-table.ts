import pool from "@/lib/db";
import { assertColumnsExist, assertIndexesExist, assertTablesExist } from "@/lib/runtime-schema";

export async function ensureAddressesTable() {
  await assertTablesExist(pool, ["addresses"]);
  await assertColumnsExist(pool, "addresses", [
    "user_id",
    "label",
    "recipient_name",
    "phone",
    "street",
    "external_number",
    "internal_number",
    "neighborhood",
    "city",
    "state",
    "postal_code",
    "reference_notes",
    "latitude",
    "longitude",
    "is_default",
    "status_id",
    "created_at",
    "updated_at",
  ]);
  await assertIndexesExist(pool, "addresses", [
    "idx_addresses_user_id",
    "idx_addresses_status_id",
    "idx_addresses_is_default",
  ]);
}
