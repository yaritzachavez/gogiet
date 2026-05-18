import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { recordAuditLog } from "@/lib/audit-log";
import { ensureDeliveryStatus } from "@/lib/business-panel";
import { getCloudinaryConfigStatus } from "@/lib/cloudinary";
import pool from "@/lib/db";
import { ensureDeliveryEvidenceRuntimeSchema } from "@/lib/delivery-evidence-schema";
import {
  COURIER_EARNING_RATE,
  DEFAULT_DELIVERY_FEE_RATE,
  getExistingColumns,
  getShippingFeeSourceLabel,
  getShippingFeeSqlExpression,
  pickFirstExistingColumn,
  SHIPPING_FEE_COLUMN_CANDIDATES,
} from "@/lib/delivery-fees";
import { saveDriverEarning } from "@/lib/driver-earnings";
import { createNotificationsForUsersSafely } from "@/lib/notifications";
import {
  applyValidatedOrderStatusTransition,
  OrderStatusTransitionError,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";
import {
  uploadImageToCloudinary,
  validateImageFile,
} from "@/lib/server-image-upload";

type AssignedOrderRow = RowDataPacket & {
  delivery_id: number;
  order_id: number;
  business_id: number;
  customer_user_id: number;
  business_name: string;
  driver_user_id: number;
  payment_method: string | null;
  current_status: string | null;
  order_delivered_at: string | null;
  delivery_delivered_at: string | null;
  shipping_fee_amount: string | number | null;
};

type BusinessUserRow = RowDataPacket & {
  user_id: number;
};

async function ensureDeliveryEvidenceTable(connection: PoolConnection) {
  await ensureDeliveryEvidenceRuntimeSchema(connection);
}

async function getBusinessUserIds(
  connection: PoolConnection,
  businessId: number,
) {
  const [rows] = await connection.query<BusinessUserRow[]>(
    `
      SELECT DISTINCT user_id
      FROM (
        SELECT bo.user_id
        FROM business_owners bo
        WHERE bo.business_id = ?

        UNION

        SELECT bm.user_id
        FROM business_managers bm
        WHERE bm.business_id = ? AND COALESCE(bm.is_active, 1) = 1
      ) business_team
    `,
    [businessId, businessId],
  );

  return rows
    .map((row) => Number(row.user_id))
    .filter((userId) => Number.isInteger(userId) && userId > 0);
}

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const authUser = getAuthUser(req);

    if (!authUser?.token) {
      return NextResponse.json(
        { success: false, error: "Token faltante" },
        { status: 401 },
      );
    }

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido" },
        { status: 401 },
      );
    }

    const contentType = req.headers.get("content-type") ?? "";
    let orderId = 0;
    let evidenceNote = "";
    let evidenceLatitude: number | null = null;
    let evidenceLongitude: number | null = null;
    let evidenceFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      orderId = Number(formData.get("order_id"));
      evidenceNote = String(formData.get("note") ?? "").trim();
      const latitudeValue = String(formData.get("latitude") ?? "").trim();
      const longitudeValue = String(formData.get("longitude") ?? "").trim();
      evidenceLatitude = latitudeValue ? Number(latitudeValue) : null;
      evidenceLongitude = longitudeValue ? Number(longitudeValue) : null;
      const photoEntry = formData.get("photo");
      evidenceFile =
        photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
    } else {
      const body = await req.json().catch(() => null);
      orderId = Number(body?.order_id);
      evidenceNote = String(body?.note ?? "").trim();
      evidenceLatitude =
        body?.latitude == null || body?.latitude === ""
          ? null
          : Number(body.latitude);
      evidenceLongitude =
        body?.longitude == null || body?.longitude === ""
          ? null
          : Number(body.longitude);
    }

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { success: false, error: "order_id es obligatorio y debe ser válido" },
        { status: 400 },
      );
    }

    if (!evidenceFile) {
      return NextResponse.json(
        {
          success: false,
          error: "Agrega una foto de evidencia antes de confirmar la entrega.",
        },
        { status: 400 },
      );
    }

    const fileValidationError = validateImageFile(evidenceFile);

    if (fileValidationError) {
      return NextResponse.json(
        { success: false, error: fileValidationError },
        { status: 400 },
      );
    }

    const cloudinaryStatus = getCloudinaryConfigStatus();

    if (!cloudinaryStatus.isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se pudo subir la evidencia de entrega porque Cloudinary no está configurado.",
        },
        { status: 500 },
      );
    }

    const uploadResult = await uploadImageToCloudinary(evidenceFile, {
      kind: "generic",
    });
    const evidencePhotoUrl = String(uploadResult.secure_url ?? "").trim();

    if (!evidencePhotoUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo guardar la foto de evidencia de entrega.",
        },
        { status: 500 },
      );
    }

    await connection.beginTransaction();

    const deliveryColumns = await getExistingColumns(connection, "delivery", [
      "completed_at",
      "driver_earning",
    ]);
    const orderColumns = await getExistingColumns(
      connection,
      "orders",
      SHIPPING_FEE_COLUMN_CANDIDATES,
    );
    const hasCompletedAt = deliveryColumns.has("completed_at");
    const hasDriverEarning = deliveryColumns.has("driver_earning");
    const shippingFeeColumn = pickFirstExistingColumn(
      orderColumns,
      SHIPPING_FEE_COLUMN_CANDIDATES,
    );

    const shippingFeeExpression =
      getShippingFeeSqlExpression(shippingFeeColumn);
    const shippingFeeSource = getShippingFeeSourceLabel(shippingFeeColumn);

    const [rows] = await connection.query<AssignedOrderRow[]>(
      `
        SELECT
          d.id AS delivery_id,
          o.id AS order_id,
          o.business_id,
          o.user_id AS customer_user_id,
          b.name AS business_name,
          d.driver_user_id,
          COALESCE(o.payment_method, pm.name) AS payment_method,
          osc.name AS current_status,
          o.delivered_at AS order_delivered_at,
          d.delivered_at AS delivery_delivered_at,
          ${shippingFeeExpression} AS shipping_fee_amount
        FROM orders o
        INNER JOIN delivery d ON d.order_id = o.id
        INNER JOIN business b ON b.id = o.business_id
        LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
        LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
        WHERE o.id = ?
        LIMIT 1
      `,
      [orderId],
    );

    if (!rows.length) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, error: "Pedido no encontrado o sin asignación" },
        { status: 404 },
      );
    }

    const order = rows[0];

    if (Number(order.driver_user_id) !== authUser.user.id) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, error: "Este pedido no está asignado a tu cuenta" },
        { status: 403 },
      );
    }

    if (order.order_delivered_at || order.delivery_delivered_at) {
      await connection.rollback();
      return NextResponse.json(
        { success: false, error: "El pedido ya fue marcado como entregado" },
        { status: 409 },
      );
    }

    const shippingFeeAmount = Number(order.shipping_fee_amount ?? 0);
    const driverEarning = shippingFeeAmount * COURIER_EARNING_RATE;
    const platformFee = shippingFeeAmount - driverEarning;

    console.log("[delivery-complete] pedido entregado:", {
      orderId,
      driverUserId: authUser.user.id,
      columnaDetectada: shippingFeeColumn,
      fuenteEnvio: shippingFeeSource,
      shippingFeeAmount,
      driverEarning: Number(driverEarning.toFixed(2)),
      platformFee: Number(platformFee.toFixed(2)),
      fallbackRate: DEFAULT_DELIVERY_FEE_RATE,
    });

    const { currentStatus } = validateOrderStatusTransition({
      currentStatus: order.current_status,
      nextStatus: "delivered",
      role: "driver",
      order: {
        id: orderId,
        businessId: Number(order.business_id),
        customerUserId: Number(order.customer_user_id),
        driverUserId: Number(order.driver_user_id),
        paymentMethod: String(order.payment_method ?? ""),
        currentStatus: String(order.current_status ?? ""),
      },
      actorUserId: authUser.user.id,
    });
    const deliveryStatusId = await ensureDeliveryStatus(
      "completado",
      "Entrega completada por el repartidor",
      99,
      true,
      connection,
    );

    await connection.query<ResultSetHeader>(
      `
        UPDATE orders
        SET
          updated_at = NOW()
        WHERE id = ?
      `,
      [orderId],
    );

    await applyValidatedOrderStatusTransition(connection, {
      orderId,
      nextStatus: "delivered",
      actorUserId: authUser.user.id,
      actorRole: "driver",
      currentStatus,
      metadata: {
        endpoint: "/api/delivery/complete",
      },
    });

    await connection.query<ResultSetHeader>(
      `
        UPDATE delivery
        SET
          delivery_status_id = ?,
          delivered_at = NOW(),
          ${hasCompletedAt ? "completed_at = NOW()," : ""}
          ${hasDriverEarning ? "driver_earning = ?," : ""}
          updated_at = NOW()
        WHERE order_id = ?
      `,
      hasDriverEarning
        ? [deliveryStatusId, Number(driverEarning.toFixed(2)), orderId]
        : [deliveryStatusId, orderId],
    );

    await saveDriverEarning(
      {
        deliveryId: Number(order.delivery_id),
        orderId,
        driverUserId: authUser.user.id,
        deliveryFee: shippingFeeAmount,
        driverFee: driverEarning,
        platformFee,
        earningStatus: "pending",
      },
      connection,
    );

    await ensureDeliveryEvidenceTable(connection);

    await connection.query<ResultSetHeader>(
      `
        INSERT INTO delivery_evidence (
          delivery_id,
          order_id,
          driver_user_id,
          photo_url,
          note,
          latitude,
          longitude,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          photo_url = VALUES(photo_url),
          note = VALUES(note),
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          updated_at = NOW()
      `,
      [
        Number(order.delivery_id),
        orderId,
        authUser.user.id,
        evidencePhotoUrl,
        evidenceNote || null,
        evidenceLatitude,
        evidenceLongitude,
      ],
    );

    const businessUserIds = await getBusinessUserIds(
      connection,
      Number(order.business_id),
    );

    await createNotificationsForUsersSafely(
      [...businessUserIds, Number(order.customer_user_id)],
      {
        type: "pedido",
        title: `Pedido entregado #FG-${String(orderId).padStart(4, "0")}`,
        message: `El pedido de ${order.business_name} fue marcado como entregado.`,
        relatedId: orderId,
      },
      connection,
    );

    await recordAuditLog(
      {
        userId: authUser.user.id,
        action: "DRIVER_MARK_DELIVERED",
        resourceType: "order",
        resourceId: orderId,
        oldValue: {
          status: order.current_status,
        },
        newValue: {
          status: "delivered",
          evidencePhotoStored: true,
          hasEvidenceNote: Boolean(evidenceNote),
        },
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          req.headers.get("x-real-ip"),
        userAgent: req.headers.get("user-agent"),
      },
      connection,
    );

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: "Pedido marcado como entregado",
      evidenceSaved: true,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error POST /api/delivery/complete:", error);
    if (error instanceof OrderStatusTransitionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo marcar el pedido como entregado",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
