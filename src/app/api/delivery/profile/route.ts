import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import pool, { getDbRuntimeConfig } from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import {
  buildUserAvatarSelect,
  ensureUserAvatarColumn,
  getPreferredUserAvatarColumn,
} from "@/lib/user-avatar";

type DeliveryProfileRow = RowDataPacket & {
  id: number;
  name: string | null;
  phone: string | null;
  profile_image_url: string | null;
  delivery_zone: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  delivery_notes: string | null;
  is_available: number | boolean | null;
};

type CurrentDatabaseRow = RowDataPacket & {
  current_database: string | null;
};

type DescribeUserRow = RowDataPacket & {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
};

type DeliveryProfileColumns = {
  avatarColumns: Awaited<ReturnType<typeof ensureUserAvatarColumn>>;
  hasDeliveryZone: boolean;
  hasVehicleType: boolean;
  hasVehiclePlate: boolean;
  hasDeliveryNotes: boolean;
  hasIsAvailable: boolean;
};

const ALLOWED_VEHICLES = new Set(["moto", "bicicleta", "auto", "a_pie"]);

function getFileExtension(file: File) {
  const originalExtension = path.extname(file.name || "").toLowerCase();

  if (originalExtension) {
    return originalExtension;
  }

  switch (file.type) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

async function ensureDeliveryProfileColumns() {
  const avatarColumns = await ensureUserAvatarColumn();

  const [rows] = await pool.query<DescribeUserRow[]>("DESCRIBE users");

  const columnNames = new Set(
    rows.map((row) => String(row.Field).toLowerCase()),
  );

  return {
    avatarColumns,
    hasDeliveryZone: columnNames.has("delivery_zone"),
    hasVehicleType: columnNames.has("vehicle_type"),
    hasVehiclePlate: columnNames.has("vehicle_plate"),
    hasDeliveryNotes: columnNames.has("delivery_notes"),
    hasIsAvailable: columnNames.has("is_available"),
  } satisfies DeliveryProfileColumns;
}

async function logDeliveryProfileDbDiagnostics() {
  const runtimeConfig = getDbRuntimeConfig();
  const [databases] = await pool.query<RowDataPacket[]>("SHOW DATABASES");
  const [currentDatabaseRows] = await pool.query<CurrentDatabaseRow[]>(
    "SELECT DATABASE() AS current_database",
  );
  const [describeUsersRows] =
    await pool.query<DescribeUserRow[]>("DESCRIBE users");

  console.log("[delivery-profile] db diagnostics", {
    DB_HOST: runtimeConfig.DB_HOST,
    DB_NAME: runtimeConfig.DB_NAME,
    DB_USER: runtimeConfig.DB_USER,
    DB_PORT: runtimeConfig.DB_PORT,
    currentDatabase: currentDatabaseRows[0]?.current_database ?? null,
    databases: databases.map((row) => {
      const values = Object.values(row);
      return values[0] ? String(values[0]) : null;
    }),
    usersColumns: describeUsersRows.map((row) => row.Field),
    hasProfileImageUrl: describeUsersRows.some(
      (row) => String(row.Field).toLowerCase() === "profile_image_url",
    ),
  });
}

function normalizeProfilePayload(row: DeliveryProfileRow | undefined) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: row.name ?? "Repartidor",
    phone: row.phone ?? "",
    profile_image_url: row.profile_image_url ?? null,
    delivery_zone: row.delivery_zone ?? "",
    vehicle_type: row.vehicle_type ?? "",
    vehicle_plate: row.vehicle_plate ?? "",
    delivery_notes: row.delivery_notes ?? "",
    is_available: Boolean(row.is_available),
  };
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const access = await resolveDeliveryAccess(authUser.user.id);

    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    await logDeliveryProfileDbDiagnostics();

    const profileColumns = await ensureDeliveryProfileColumns();
    const avatarSelect = buildUserAvatarSelect(
      "u",
      profileColumns.avatarColumns,
    );
    const deliveryZoneSelect = profileColumns.hasDeliveryZone
      ? "u.delivery_zone"
      : "NULL AS delivery_zone";
    const vehicleTypeSelect = profileColumns.hasVehicleType
      ? "u.vehicle_type"
      : "NULL AS vehicle_type";
    const vehiclePlateSelect = profileColumns.hasVehiclePlate
      ? "u.vehicle_plate"
      : "NULL AS vehicle_plate";
    const deliveryNotesSelect = profileColumns.hasDeliveryNotes
      ? "u.delivery_notes"
      : "NULL AS delivery_notes";
    const isAvailableSelect = profileColumns.hasIsAvailable
      ? "u.is_available"
      : "1 AS is_available";

    const [rows] = await pool.query<DeliveryProfileRow[]>(
      `
        SELECT
          u.id,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
          u.phone,
          ${avatarSelect},
          ${deliveryZoneSelect},
          ${vehicleTypeSelect},
          ${vehiclePlateSelect},
          ${deliveryNotesSelect},
          ${isAvailableSelect}
        FROM users u
        WHERE u.id = ?
        LIMIT 1
      `,
      [authUser.user.id],
    );

    return NextResponse.json({
      success: true,
      profile: normalizeProfilePayload(rows[0]),
    });
  } catch (error) {
    console.error("Error GET /api/delivery/profile:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el perfil del repartidor.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const access = await resolveDeliveryAccess(authUser.user.id);

    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 },
      );
    }

    await logDeliveryProfileDbDiagnostics();

    const profileColumns = await ensureDeliveryProfileColumns();

    if (
      !profileColumns.hasDeliveryZone ||
      !profileColumns.hasVehicleType ||
      !profileColumns.hasVehiclePlate ||
      !profileColumns.hasDeliveryNotes ||
      !profileColumns.hasIsAvailable
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Faltan columnas del perfil de repartidor en users. Ejecuta la migración correspondiente.",
        },
        { status: 500 },
      );
    }

    const targetAvatarColumn = getPreferredUserAvatarColumn(
      profileColumns.avatarColumns,
    );
    const contentType = req.headers.get("content-type") || "";

    let name = "";
    let phone = "";
    let deliveryZone = "";
    let vehicleType = "";
    let vehiclePlate = "";
    let deliveryNotes = "";
    let isAvailable = true;
    let avatarUrlToSave: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      name = String(formData.get("name") ?? "").trim();
      phone = String(formData.get("phone") ?? "").trim();
      deliveryZone = String(formData.get("delivery_zone") ?? "").trim();
      vehicleType = String(formData.get("vehicle_type") ?? "")
        .trim()
        .toLowerCase();
      vehiclePlate = String(formData.get("vehicle_plate") ?? "").trim();
      deliveryNotes = String(formData.get("delivery_notes") ?? "").trim();
      isAvailable = String(formData.get("is_available") ?? "1") === "1";

      const avatar = formData.get("avatar");

      if (avatar instanceof File && avatar.size > 0) {
        const allowedTypes = new Set([
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
        ]);

        if (!allowedTypes.has(avatar.type)) {
          return NextResponse.json(
            { success: false, error: "Solo se permiten JPG, PNG o WEBP" },
            { status: 400 },
          );
        }

        if (avatar.size > 5 * 1024 * 1024) {
          return NextResponse.json(
            { success: false, error: "La imagen no debe superar 5 MB" },
            { status: 400 },
          );
        }

        const buffer = Buffer.from(await avatar.arrayBuffer());
        const extension = getFileExtension(avatar);
        const fileName = `avatar-${authUser.user.id}-${randomUUID()}${extension}`;
        const uploadDir = path.join(
          process.cwd(),
          "public",
          "uploads",
          "avatars",
        );
        const filePath = path.join(uploadDir, fileName);
        avatarUrlToSave = `/uploads/avatars/${fileName}`;

        await mkdir(uploadDir, { recursive: true });
        await writeFile(filePath, buffer);
      }
    } else {
      const body = (await req.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      name = String(body?.name ?? "").trim();
      phone = String(body?.phone ?? "").trim();
      deliveryZone = String(body?.delivery_zone ?? "").trim();
      vehicleType = String(body?.vehicle_type ?? "")
        .trim()
        .toLowerCase();
      vehiclePlate = String(body?.vehicle_plate ?? "").trim();
      deliveryNotes = String(body?.delivery_notes ?? "").trim();
      isAvailable = Boolean(body?.is_available);
    }

    if (!name) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 },
      );
    }

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "El teléfono es obligatorio" },
        { status: 400 },
      );
    }

    if (!vehicleType || !ALLOWED_VEHICLES.has(vehicleType)) {
      return NextResponse.json(
        { success: false, error: "El vehículo es obligatorio" },
        { status: 400 },
      );
    }

    if ((vehicleType === "moto" || vehicleType === "auto") && !vehiclePlate) {
      return NextResponse.json(
        {
          success: false,
          error: "Las placas son obligatorias para moto o auto",
        },
        { status: 400 },
      );
    }

    const nameParts = name.split(/\s+/).filter(Boolean);
    const firstName = nameParts.slice(0, 1).join(" ");
    const lastName = nameParts.slice(1).join(" ");

    const fields = [
      "first_name = ?",
      "last_name = ?",
      "phone = ?",
      "delivery_zone = ?",
      "vehicle_type = ?",
      "vehicle_plate = ?",
      "delivery_notes = ?",
      "is_available = ?",
      "updated_at = NOW()",
    ];
    const values: Array<string | number | null> = [
      firstName,
      lastName || null,
      phone,
      deliveryZone || null,
      vehicleType,
      vehiclePlate || null,
      deliveryNotes || null,
      isAvailable ? 1 : 0,
    ];

    if (avatarUrlToSave) {
      fields.splice(7, 0, `${targetAvatarColumn} = ?`);
      values.splice(7, 0, avatarUrlToSave);
    }

    values.push(authUser.user.id);

    await pool.query<ResultSetHeader>(
      `
        UPDATE users
        SET ${fields.join(", ")}
        WHERE id = ?
      `,
      values,
    );

    const refreshedColumns = await ensureDeliveryProfileColumns();
    const avatarSelect = buildUserAvatarSelect(
      "u",
      refreshedColumns.avatarColumns,
    );

    const [rows] = await pool.query<DeliveryProfileRow[]>(
      `
        SELECT
          u.id,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
          u.phone,
          ${avatarSelect},
          u.delivery_zone,
          u.vehicle_type,
          u.vehicle_plate,
          u.delivery_notes,
          u.is_available
        FROM users u
        WHERE u.id = ?
        LIMIT 1
      `,
      [authUser.user.id],
    );

    return NextResponse.json({
      success: true,
      message: "Perfil actualizado correctamente",
      profile: normalizeProfilePayload(rows[0]),
    });
  } catch (error) {
    console.error("Error PATCH /api/delivery/profile:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el perfil del repartidor.",
      },
      { status: 500 },
    );
  }
}
