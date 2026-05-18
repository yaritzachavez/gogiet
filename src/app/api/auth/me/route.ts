import type { RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { ensureAddressesTable } from "@/lib/addresses-table";
import pool from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/permissions";
import { mapDbRoleToPublicRole } from "@/lib/role-utils";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";

type AddressRow = RowDataPacket & {
  id: number;
  label: string | null;
  neighborhood: string;
  phone: string | null;
  street: string;
  external_number: string | null;
  internal_number: string | null;
  city: string;
  state: string;
};

type UserRow = RowDataPacket & {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

function formatFullAddress(address: AddressRow) {
  const numberBlock = [
    address.external_number?.trim(),
    address.internal_number?.trim()
      ? `Int. ${address.internal_number.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    address.street,
    numberBlock,
    address.neighborhood,
    address.city,
    address.state,
  ]
    .filter(Boolean)
    .join(", ");
}

export async function GET(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return withCors(req, response);
  };

  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      return withCors(req, auth.response);
    }

    await ensureAddressesTable();

    const [userRows] = await pool.query<UserRow[]>(
      `
        SELECT first_name, last_name, email
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [auth.access.userId],
    );
    const userRow = userRows[0] ?? null;

    const [addressRows] = await pool.query<AddressRow[]>(
      `
        SELECT
          id,
          label,
          neighborhood,
          phone,
          street,
          external_number,
          internal_number,
          city,
          state
        FROM addresses
        WHERE user_id = ?
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `,
      [auth.access.userId],
    );

    const address = addressRows[0] ?? null;

    return json({
      success: true,
      user: {
        id: auth.access.userId,
        name:
          `${userRow?.first_name ?? ""} ${userRow?.last_name ?? ""}`.trim() ||
          auth.access.email ||
          "",
        email: userRow?.email ?? auth.access.email,
        roles: auth.access.roles,
        dbRoles: auth.access.dbRoles.map((role) => ({
          name: mapDbRoleToPublicRole(role) ?? role,
        })),
        address: address
          ? {
              id: address.id,
              fullAddress: formatFullAddress(address),
              neighborhood: address.neighborhood,
              phone: address.phone ?? "",
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error GET /api/auth/me:", error);
    return json(
      {
        success: false,
        error: "No pudimos obtener la sesión actual.",
      },
      { status: 500 },
    );
  }
}
