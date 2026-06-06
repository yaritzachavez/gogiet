import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { getSafeErrorMessage, safeErrorResponse } from "@/lib/api-error";
import { cloudinary, getCloudinaryConfigStatus } from "@/lib/cloudinary";
import pool from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import {
  type DriverOperationalStatus,
  driverStatusToLabel,
  ensureDriverStatusColumns,
  getDriverStatusColumns,
  isDriverAvailableStatus,
  normalizeDriverStatus,
} from "@/lib/driver-status";
import { getRequestLoggerContext, logger } from "@/lib/logger";
import {
  buildUserAvatarSelect,
  ensureUserAvatarColumn,
  getPreferredUserAvatarColumn,
} from "@/lib/user-avatar";

export const runtime = "nodejs";

type DeliveryProfileRow = RowDataPacket & {
  id: number;
  status_id: number | null;
  name: string | null;
  phone: string | null;
  profile_image_url: string | null;
  delivery_zone: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  delivery_notes: string | null;
  is_available: number | boolean | null;
  driver_status: DriverOperationalStatus | string | null;
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

function fileToDataUri(file: File, buffer: Buffer) {
  const mimeType = file.type || "application/octet-stream";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function uploadDeliveryProfileImage(file: File, userId: number) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const dataUri = fileToDataUri(file, buffer);

  return cloudinary.uploader.upload(dataUri, {
    folder: "gogi-eats/delivery-profiles",
    public_id: `delivery-profile-${userId}-${Date.now()}`,
    resource_type: "image",
  });
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

function normalizeProfilePayload(row: DeliveryProfileRow | undefined) {
  if (!row) {
    return null;
  }

  const driverStatus = normalizeDriverStatus(
    row.driver_status,
    Boolean(row.is_available),
  );
  const isAvailable = isDriverAvailableStatus(driverStatus);

  return {
    id: Number(row.id),
    name: row.name ?? "Repartidor",
    phone: row.phone ?? "",
    profile_image_url: row.profile_image_url ?? null,
    profileImageUrl: row.profile_image_url ?? null,
    profile_photo_url: row.profile_image_url ?? null,
    profilePhotoUrl: row.profile_image_url ?? null,
    photo_url: row.profile_image_url ?? null,
    photoUrl: row.profile_image_url ?? null,
    avatar_url: row.profile_image_url ?? null,
    image_url: row.profile_image_url ?? null,
    delivery_zone: row.delivery_zone ?? "",
    vehicle_type: row.vehicle_type ?? "",
    vehicle_plate: row.vehicle_plate ?? "",
    delivery_notes: row.delivery_notes ?? "",
    is_available: isAvailable,
    driver_status: driverStatus,
    driver_status_label: driverStatusToLabel(driverStatus),
  };
}

function parseDriverStatusInput(
  value: unknown,
  fallback: DriverOperationalStatus,
): DriverOperationalStatus {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  if (normalized === "OFFLINE" || normalized === "DISCONNECTED") {
    return "OFFLINE";
  }

  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "RESTING") return "RESTING";

  return fallback;
}

export async function GET(req: NextRequest) {
  const requestContext = getRequestLoggerContext(req);

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
    const driverStatusColumns = await getDriverStatusColumns();
    const driverStatusSelect = driverStatusColumns.hasDriverStatus
      ? "u.driver_status"
      : "NULL AS driver_status";

    const [rows] = await pool.query<DeliveryProfileRow[]>(
      `
        SELECT
          u.id,
          u.status_id,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
          u.phone,
          ${avatarSelect},
          ${deliveryZoneSelect},
          ${vehicleTypeSelect},
          ${vehiclePlateSelect},
          ${deliveryNotesSelect},
          ${isAvailableSelect},
          ${driverStatusSelect}
        FROM users u
        WHERE u.id = ?
        LIMIT 1
      `,
      [authUser.user.id],
    );

    const normalizedProfile = normalizeProfilePayload(rows[0]);
    logger.info("delivery.profile_loaded", "Perfil de repartidor cargado", {
      ...requestContext,
      userId: authUser.user.id,
      hasProfile: Boolean(normalizedProfile),
      isAvailable: normalizedProfile?.is_available ?? null,
      driverStatus: rows[0]?.driver_status ?? null,
    });

    return NextResponse.json({
      success: true,
      profile: normalizedProfile,
    });
  } catch (error) {
    return safeErrorResponse(
      "delivery.profile_get_error",
      error,
      getSafeErrorMessage(error, "No se pudo cargar el perfil del repartidor."),
      500,
      {
        request: req,
      },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const requestContext = getRequestLoggerContext(req);

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
    let isStatusOnlyUpdate = false;
    let requestedDriverStatus: string | null = null;

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
      isStatusOnlyUpdate = String(formData.get("status_only") ?? "") === "1";
      requestedDriverStatus = String(
        formData.get("driver_status") ?? "",
      ).trim();

      const avatar = formData.get("avatar");

      if (avatar instanceof File && avatar.size > 0) {
        const cloudinaryStatus = getCloudinaryConfigStatus();

        if (!cloudinaryStatus.isConfigured) {
          return NextResponse.json(
            {
              success: false,
              error: `Falta configuración de Cloudinary: ${cloudinaryStatus.missing.join(", ")}`,
            },
            { status: 500 },
          );
        }

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

        const uploadResult = await uploadDeliveryProfileImage(
          avatar,
          authUser.user.id,
        );
        avatarUrlToSave = uploadResult.secure_url;
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
      isStatusOnlyUpdate = Boolean(body?.status_only);
      requestedDriverStatus = String(body?.driver_status ?? "").trim();
    }

    if (isStatusOnlyUpdate) {
      await ensureDriverStatusColumns();
      const [currentRows] = await pool.query<DeliveryProfileRow[]>(
        `
          SELECT
            id,
            status_id,
            is_available,
            driver_status,
            NULL AS name,
            NULL AS phone,
            NULL AS profile_image_url,
            NULL AS delivery_zone,
            NULL AS vehicle_type,
            NULL AS vehicle_plate,
            NULL AS delivery_notes
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
        [authUser.user.id],
      );
      const currentDriverStatus = normalizeDriverStatus(
        currentRows[0]?.driver_status,
        Boolean(currentRows[0]?.is_available),
      );

      if (
        currentDriverStatus === "SUSPENDED" ||
        currentDriverStatus === "DISABLED"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Tu estado operativo requiere revisión del administrador general.",
          },
          { status: 403 },
        );
      }

      const nextDriverStatus = parseDriverStatusInput(
        requestedDriverStatus,
        isAvailable ? "ACTIVE" : "RESTING",
      );
      const nextIsAvailable = isDriverAvailableStatus(nextDriverStatus);
      await pool.query<ResultSetHeader>(
        `
          UPDATE users
          SET
            is_available = ?,
            driver_status = ?,
            driver_status_reason = NULL,
            driver_active_since = CASE
              WHEN ? = 'ACTIVE'
                THEN NOW()
              ELSE NULL
            END,
            updated_at = NOW()
          WHERE id = ?
        `,
        [
          nextIsAvailable ? 1 : 0,
          nextDriverStatus,
          nextDriverStatus,
          authUser.user.id,
        ],
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
            u.status_id,
            TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
            u.phone,
            ${avatarSelect},
            u.delivery_zone,
            u.vehicle_type,
            u.vehicle_plate,
            u.delivery_notes,
            u.is_available,
            u.driver_status
          FROM users u
          WHERE u.id = ?
          LIMIT 1
        `,
        [authUser.user.id],
      );

      const normalizedProfile = normalizeProfilePayload(rows[0]);
      logger.info(
        "delivery.profile_status_updated",
        "Estado operativo del repartidor actualizado",
        {
          ...requestContext,
          userId: authUser.user.id,
          isAvailable: nextIsAvailable,
          driverStatus: nextDriverStatus,
        },
      );

      return NextResponse.json({
        success: true,
        message: "Estado operativo actualizado correctamente",
        profile: normalizedProfile,
      });
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
    await ensureDriverStatusColumns();
    const nextDriverStatus = parseDriverStatusInput(
      requestedDriverStatus,
      isAvailable ? "ACTIVE" : "RESTING",
    );
    const nextIsAvailable = isDriverAvailableStatus(nextDriverStatus);

    const fields = [
      "first_name = ?",
      "last_name = ?",
      "phone = ?",
      "delivery_zone = ?",
      "vehicle_type = ?",
      "vehicle_plate = ?",
      "delivery_notes = ?",
      "is_available = ?",
      "driver_status = ?",
      "driver_status_reason = NULL",
      `driver_active_since = CASE
        WHEN ? = 'ACTIVE'
          THEN NOW()
        ELSE NULL
      END`,
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
      nextIsAvailable ? 1 : 0,
      nextDriverStatus,
      nextDriverStatus,
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
    const driverStatusColumns = await getDriverStatusColumns();
    const driverStatusSelect = driverStatusColumns.hasDriverStatus
      ? "u.driver_status"
      : "NULL AS driver_status";

    const [rows] = await pool.query<DeliveryProfileRow[]>(
      `
        SELECT
          u.id,
          u.status_id,
          TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS name,
          u.phone,
          ${avatarSelect},
          u.delivery_zone,
          u.vehicle_type,
          u.vehicle_plate,
          u.delivery_notes,
          u.is_available,
          ${driverStatusSelect}
        FROM users u
        WHERE u.id = ?
        LIMIT 1
      `,
      [authUser.user.id],
    );

    const normalizedProfile = normalizeProfilePayload(rows[0]);
    logger.info(
      "delivery.profile_updated",
      "Perfil del repartidor actualizado",
      {
        ...requestContext,
        userId: authUser.user.id,
        isAvailable: normalizedProfile?.is_available ?? isAvailable,
        driverStatus: rows[0]?.driver_status ?? null,
        hasAvatar: Boolean(avatarUrlToSave),
      },
    );

    return NextResponse.json({
      success: true,
      message: "Perfil actualizado correctamente",
      profile: normalizedProfile,
    });
  } catch (error) {
    return safeErrorResponse(
      "delivery.profile_patch_error",
      error,
      getSafeErrorMessage(
        error,
        "No se pudo actualizar el perfil del repartidor.",
      ),
      500,
      {
        request: req,
      },
    );
  }
}
