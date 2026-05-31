import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { recordAuditLog } from "@/lib/audit-log";
import {
  ensureDeliveryStatus,
  findAvailableCourier,
  resolveBusinessAccess,
} from "@/lib/business-panel";
import pool from "@/lib/db";
import { resolveDeliveryAccess } from "@/lib/delivery-access";
import { ensureDriverStatusColumns } from "@/lib/driver-status";
import { logger } from "@/lib/logger";
import {
  createNotification,
  createNotificationForBusiness,
  createNotificationsForAdminGeneral,
  createNotificationsForUsers,
} from "@/lib/notifications";
import {
  applyValidatedOrderStatusTransition,
  validateOrderStatusTransition,
} from "@/lib/order-status-guard";
import { assertColumnsExist, assertTablesExist } from "@/lib/runtime-schema";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  business_name: string;
  customer_user_id: number;
  order_status_name: string | null;
};

type DeliveryRow = RowDataPacket & {
  id: number;
  driver_user_id: number | null;
  delivery_status_name: string | null;
  delivery_status_is_final: number | boolean | null;
};

type BusinessTeamRow = RowDataPacket & {
  user_id: number;
};

type CourierCapacityRow = RowDataPacket & {
  active_assignments: number | string | null;
};

type DeliveryDriverColumnRow = RowDataPacket & {
  is_nullable: string;
};

type CarouselStateRow = RowDataPacket & {
  id: number;
  last_driver_user_id: number | null;
};

type AssignmentAttemptRow = RowDataPacket & {
  driver_user_id: number;
};

type CarouselCourier = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  activeAssignments: number;
  activeSince?: string | null;
};

let deliveryCarouselSchemaReady = false;

export class DeliveryAssignmentError extends Error {
  status: number;
  debug?: Record<string, unknown>;

  constructor(message: string, status = 400, debug?: Record<string, unknown>) {
    super(message);
    this.name = "DeliveryAssignmentError";
    this.status = status;
    this.debug = debug;
  }
}

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

async function getCourierActiveAssignmentsCount(
  connection: PoolConnection,
  userId: number,
) {
  const [rows] = await connection.query<CourierCapacityRow[]>(
    `
      SELECT COUNT(*) AS active_assignments
      FROM delivery d
      LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
      WHERE d.driver_user_id = ?
        AND LOWER(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(COALESCE(dsc.name, ''), 'á', 'a'),
                'é',
                'e'
              ),
              'í',
              'i'
            ),
            ' ',
            '_'
          )
        ) IN (
          'pendiente',
          'pendiente_aceptacion',
          'aceptado',
          'en_camino',
          'repartidor_asignado',
          'driver_assigned',
          'asignado',
          'listo_para_recoger',
          'ready_for_pickup',
          'en_camino_negocio',
          'llegue_al_negocio',
          'recogido',
          'on_the_way'
        )
    `,
    [userId],
  );

  return Number(rows[0]?.active_assignments ?? 0);
}

async function deliverySupportsUnassignedDriver(connection: PoolConnection) {
  const [rows] = await connection.query<DeliveryDriverColumnRow[]>(
    `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'delivery'
        AND column_name = 'driver_user_id'
      LIMIT 1
    `,
  );

  return rows[0]?.is_nullable === "YES";
}

async function ensureDeliveryCarouselSchema(connection: PoolConnection) {
  if (deliveryCarouselSchemaReady) return;

  await connection.query(`
    CREATE TABLE IF NOT EXISTS delivery_assignment_carousel_state (
      id TINYINT NOT NULL PRIMARY KEY,
      last_driver_user_id INT NULL,
      last_order_id INT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS delivery_assignment_attempts (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      driver_user_id INT NOT NULL,
      status VARCHAR(24) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_delivery_assignment_attempt (
        order_id,
        driver_user_id
      ),
      KEY idx_delivery_assignment_attempt_order (order_id),
      KEY idx_delivery_assignment_attempt_driver (driver_user_id)
    )
  `);

  await connection.query(`
    INSERT IGNORE INTO delivery_assignment_carousel_state (id)
    VALUES (1)
  `);

  deliveryCarouselSchemaReady = true;
}

async function getRejectedCourierIdsForOrder(
  connection: PoolConnection,
  orderId: number,
) {
  const [rows] = await connection.query<AssignmentAttemptRow[]>(
    `
      SELECT driver_user_id
      FROM delivery_assignment_attempts
      WHERE order_id = ?
        AND status = 'REJECTED'
    `,
    [orderId],
  );

  return new Set(rows.map((row) => Number(row.driver_user_id)));
}

function rotateCouriersAfterLastAssigned(
  couriers: CarouselCourier[],
  lastDriverUserId: number | null,
) {
  if (couriers.length === 0 || !lastDriverUserId) return couriers;

  const lastIndex = couriers.findIndex(
    (courier) => Number(courier.id) === Number(lastDriverUserId),
  );

  if (lastIndex < 0) return couriers;

  return [
    ...couriers.slice(lastIndex + 1),
    ...couriers.slice(0, lastIndex + 1),
  ];
}

async function selectNextCarouselCourier(params: {
  connection: PoolConnection;
  orderId: number;
  availableCouriers: CarouselCourier[];
}) {
  await ensureDeliveryCarouselSchema(params.connection);

  const [stateRows] = await params.connection.query<CarouselStateRow[]>(
    `
      SELECT id, last_driver_user_id
      FROM delivery_assignment_carousel_state
      WHERE id = 1
      FOR UPDATE
    `,
  );
  const lastDriverUserId =
    Number(stateRows[0]?.last_driver_user_id ?? 0) || null;
  const rejectedCourierIds = await getRejectedCourierIdsForOrder(
    params.connection,
    params.orderId,
  );
  const rotatedCouriers = rotateCouriersAfterLastAssigned(
    params.availableCouriers,
    lastDriverUserId,
  );
  const selectedCourier =
    rotatedCouriers.find((courier) => !rejectedCourierIds.has(courier.id)) ??
    null;

  logger.info(
    "delivery.carousel_selection",
    "Carrusel de repartidores evaluado",
    {
      orderId: params.orderId,
      lastDriverUserId,
      activeCourierOrder: params.availableCouriers.map((courier) => ({
        id: courier.id,
        activeSince: courier.activeSince ?? null,
        activeAssignments: courier.activeAssignments,
      })),
      rejectedCourierIds: Array.from(rejectedCourierIds),
      selectedCourierId: selectedCourier?.id ?? null,
    },
  );

  if (!selectedCourier) return null;

  await params.connection.query<ResultSetHeader>(
    `
      INSERT INTO delivery_assignment_attempts (
        order_id,
        driver_user_id,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'OFFERED', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        updated_at = NOW()
    `,
    [params.orderId, selectedCourier.id],
  );

  await params.connection.query<ResultSetHeader>(
    `
      UPDATE delivery_assignment_carousel_state
      SET
        last_driver_user_id = ?,
        last_order_id = ?,
        updated_at = NOW()
      WHERE id = 1
    `,
    [selectedCourier.id, params.orderId],
  );

  return selectedCourier;
}

async function markCarouselAttemptStatus(params: {
  connection: PoolConnection;
  orderId: number;
  driverUserId: number;
  status: "ACCEPTED" | "REJECTED";
}) {
  await ensureDeliveryCarouselSchema(params.connection);
  await params.connection.query<ResultSetHeader>(
    `
      INSERT INTO delivery_assignment_attempts (
        order_id,
        driver_user_id,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        updated_at = NOW()
    `,
    [params.orderId, params.driverUserId, params.status],
  );

  if (params.status === "ACCEPTED") {
    await params.connection.query<ResultSetHeader>(
      `
        UPDATE delivery_assignment_carousel_state
        SET
          last_driver_user_id = ?,
          last_order_id = ?,
          updated_at = NOW()
        WHERE id = 1
      `,
      [params.driverUserId, params.orderId],
    );
  }
}

async function ensureOrdersDriverColumn(connection: PoolConnection) {
  await assertTablesExist(connection, ["orders"]);
  await assertColumnsExist(connection, "orders", ["driver_id"]);
}

async function getOrderForAssignment(
  connection: PoolConnection,
  orderId: number,
  options?: { forUpdate?: boolean },
) {
  const [rows] = await connection.query<OrderRow[]>(
    `
      SELECT
        o.id,
        o.business_id,
        b.name AS business_name,
        o.user_id AS customer_user_id,
        osc.name AS order_status_name
      FROM orders o
      INNER JOIN business b ON b.id = o.business_id
      LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
      WHERE o.id = ?
      LIMIT 1
      ${options?.forUpdate ? "FOR UPDATE" : ""}
    `,
    [orderId],
  );

  return rows[0] ?? null;
}

async function getDeliveryByOrderId(
  connection: PoolConnection,
  orderId: number,
  options?: { forUpdate?: boolean },
) {
  const [rows] = await connection.query<DeliveryRow[]>(
    `
      SELECT
        d.id,
        d.driver_user_id,
        dsc.name AS delivery_status_name,
        dsc.is_final AS delivery_status_is_final
      FROM delivery d
      LEFT JOIN delivery_status_catalog dsc ON dsc.id = d.delivery_status_id
      WHERE d.order_id = ?
      LIMIT 1
      ${options?.forUpdate ? "FOR UPDATE" : ""}
    `,
    [orderId],
  );

  return rows[0] ?? null;
}

async function getBusinessNotificationUserIds(
  connection: PoolConnection,
  businessId: number,
) {
  const [rows] = await connection.query<BusinessTeamRow[]>(
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

export async function requestCourierAssignment(params: {
  orderId: number;
  userId: number;
}) {
  const connection = await pool.getConnection();

  try {
    await ensureDeliveryCarouselSchema(connection);
    await ensureDriverStatusColumns(connection);
    logger.info(
      "delivery.assignment_requested",
      "Solicitud de repartidor recibida",
      {
        orderId: params.orderId,
        userId: params.userId,
      },
    );

    await connection.beginTransaction();
    await ensureOrdersDriverColumn(connection);

    const order = await getOrderForAssignment(connection, params.orderId, {
      forUpdate: true,
    });

    if (!order) {
      throw new DeliveryAssignmentError("Pedido no encontrado", 404);
    }

    logger.debug(
      "delivery.assignment_order_state",
      "Estado del pedido antes de solicitar repartidor",
      {
        orderId: Number(order.id),
        businessId: Number(order.business_id),
        status: order.order_status_name ?? "sin_status",
      },
    );

    const currentOrderStatus = normalizeStatus(order.order_status_name);

    if (
      currentOrderStatus !== "ready_for_pickup" &&
      currentOrderStatus !== "listo_para_recoger" &&
      currentOrderStatus !== "delivery_requested" &&
      currentOrderStatus !== "repartidor_solicitado"
    ) {
      throw new DeliveryAssignmentError(
        "El pedido debe estar listo antes de solicitar repartidor.",
        409,
      );
    }

    const access = await resolveBusinessAccess(
      params.userId,
      Number(order.business_id),
    );

    if (!access.businessIds.includes(Number(order.business_id))) {
      throw new DeliveryAssignmentError("No autorizado para este negocio", 403);
    }

    const existingDelivery = await getDeliveryByOrderId(
      connection,
      params.orderId,
      { forUpdate: true },
    );
    const existingDeliveryIsActive =
      existingDelivery && !existingDelivery.delivery_status_is_final;
    const existingDeliveryStatus = normalizeStatus(
      existingDelivery?.delivery_status_name,
    );

    const existingDriverId = Number(existingDelivery?.driver_user_id ?? 0);
    const existingOfferCanBeRetried =
      existingDeliveryIsActive &&
      existingDriverId > 0 &&
      (existingDeliveryStatus === "pendiente_aceptacion" ||
        existingDeliveryStatus === "pending_driver" ||
        existingDeliveryStatus === "disponible" ||
        existingDeliveryStatus === "available") &&
      !(await resolveDeliveryAccess(existingDriverId)
        .then((access) => access.canOperate)
        .catch(() => false));

    if (existingOfferCanBeRetried) {
      await markCarouselAttemptStatus({
        connection,
        orderId: params.orderId,
        driverUserId: existingDriverId,
        status: "REJECTED",
      });

      logger.warn(
        "delivery.inactive_pending_offer_retried",
        "Oferta pendiente reasignada porque el repartidor ya no puede operar",
        {
          orderId: params.orderId,
          previousDriverUserId: existingDriverId,
          previousDeliveryStatus: existingDeliveryStatus,
        },
      );
    }

    if (existingDeliveryIsActive && !existingOfferCanBeRetried) {
      await connection.commit();

      if (existingDriverId > 0) {
        return {
          courierId: existingDriverId,
          courierName: null,
          courierPhone: null,
          courierAvatarUrl: null,
          notifiedCourierIds: [],
          deliveryRequested: true,
          noActiveCouriers: false,
          adminNotified: false,
          message:
            "Este pedido ya tiene un repartidor asignado o pendiente de confirmación.",
        };
      }

      if (
        existingDeliveryStatus === "pending_driver" ||
        existingDeliveryStatus === "disponible" ||
        existingDeliveryStatus === "available" ||
        existingDeliveryStatus === "pendiente_aceptacion"
      ) {
        return {
          courierId: null,
          courierName: null,
          courierPhone: null,
          courierAvatarUrl: null,
          notifiedCourierIds: [],
          deliveryRequested: true,
          noActiveCouriers: false,
          adminNotified: false,
          message:
            "La solicitud de repartidor ya estaba activa para este pedido.",
        };
      }

      throw new DeliveryAssignmentError(
        "Este pedido ya tiene una solicitud de repartidor activa.",
        409,
      );
    }

    const courierSearch = await findAvailableCourier(connection);
    const availableCouriers = courierSearch.availableCouriers;
    const selectedCourier = await selectNextCarouselCourier({
      connection,
      orderId: params.orderId,
      availableCouriers,
    });
    const supportsUnassignedDriver =
      await deliverySupportsUnassignedDriver(connection);
    const noActiveCouriers = availableCouriers.length === 0;
    const adminAlertPayload = {
      type: "delivery",
      title: `Sin repartidores activos #FG-${String(params.orderId).padStart(4, "0")}`,
      message: `El pedido de ${order.business_name} quedó listo, pero no hay repartidores activos para tomarlo en este momento.`,
      relatedId: params.orderId,
      dataJson: {
        order_id: params.orderId,
        business_id: Number(order.business_id),
        issue: "no_active_couriers",
      },
    } as const;

    logger.info(
      "delivery.courier_candidates",
      "Repartidores evaluados para asignación",
      {
        orderId: params.orderId,
        candidateCourierIds: availableCouriers.map((courier) => courier.id),
        availableCourierCount: availableCouriers.length,
        supportsUnassignedDriver,
      },
    );

    if (!selectedCourier && supportsUnassignedDriver) {
      const deliveryStatusId = await ensureDeliveryStatus(
        "pending_driver",
        "Entrega sin repartidor disponible",
        2,
        false,
        connection,
      );
      if (existingDelivery) {
        await connection.query<ResultSetHeader>(
          `
            UPDATE delivery
            SET
              driver_user_id = NULL,
              delivery_status_id = ?,
              assigned_at = NULL,
              picked_up_at = NULL,
              in_route_at = NULL,
              delivered_at = NULL,
              failed_at = NULL,
              updated_at = NOW()
            WHERE order_id = ?
          `,
          [deliveryStatusId, params.orderId],
        );
      } else {
        await connection.query<ResultSetHeader>(
          `
            INSERT INTO delivery (
              order_id,
              delivery_status_id,
              created_at,
              updated_at
            )
            VALUES (?, ?, NOW(), NOW())
          `,
          [params.orderId, deliveryStatusId],
        );
      }

      await connection.query<ResultSetHeader>(
        `
          UPDATE orders
          SET
            driver_id = NULL,
            updated_at = NOW()
          WHERE id = ?
        `,
        [params.orderId],
      );

      await createNotificationsForAdminGeneral(adminAlertPayload, connection);
      const adminNotified = true;

      await recordAuditLog(
        {
          userId: params.userId,
          action: noActiveCouriers
            ? "REQUEST_DELIVERY_NO_ACTIVE_COURIERS"
            : "REQUEST_DELIVERY",
          resourceType: "order",
          resourceId: params.orderId,
          oldValue: {
            deliveryStatus: null,
            orderStatus: order.order_status_name,
          },
          newValue: {
            deliveryStatus: "pending_driver",
            orderStatus: order.order_status_name,
            notifiedCourierIds: [],
            noActiveCouriers,
          },
        },
        connection,
      );

      logger.info(
        "delivery.broadcast_created",
        "Solicitud de entrega creada sin repartidor disponible",
        {
          orderId: params.orderId,
          deliveryStatusId,
          businessId: Number(order.business_id),
          availableCourierIds: [],
        },
      );

      await connection.commit();

      return {
        courierId: null,
        courierName: null,
        courierPhone: null,
        courierAvatarUrl: null,
        notifiedCourierIds: [],
        deliveryRequested: true,
        noActiveCouriers: true,
        adminNotified,
        message:
          "El pedido quedó listo, pero no hay repartidores activos disponibles en el carrusel.",
      };
    }

    if (!selectedCourier) {
      await createNotificationsForAdminGeneral(adminAlertPayload, connection);
      await recordAuditLog(
        {
          userId: params.userId,
          action: "REQUEST_DELIVERY_NO_ACTIVE_COURIERS",
          resourceType: "order",
          resourceId: params.orderId,
          oldValue: {
            deliveryStatus: existingDelivery?.delivery_status_name ?? null,
            orderStatus: order.order_status_name,
          },
          newValue: {
            deliveryStatus: existingDelivery?.delivery_status_name ?? null,
            orderStatus: order.order_status_name,
            noActiveCouriers: true,
          },
        },
        connection,
      );
      await connection.commit();

      return {
        courierId: null,
        courierName: null,
        courierPhone: null,
        courierAvatarUrl: null,
        notifiedCourierIds: [],
        deliveryRequested: false,
        noActiveCouriers: true,
        adminNotified: true,
        message:
          "No hay repartidores activos disponibles en este momento. Avisamos al administrador.",
      };
    }

    const deliveryStatusId = await ensureDeliveryStatus(
      "pendiente_aceptacion",
      "Asignación pendiente de respuesta del repartidor",
      2,
      false,
      connection,
    );
    if (existingDelivery) {
      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            driver_user_id = ?,
            delivery_status_id = ?,
            assigned_at = NOW(),
            picked_up_at = NULL,
            in_route_at = NULL,
            delivered_at = NULL,
            failed_at = NULL,
            updated_at = NOW()
          WHERE order_id = ?
        `,
        [selectedCourier.id, deliveryStatusId, params.orderId],
      );
    } else {
      await connection.query<ResultSetHeader>(
        `
          INSERT INTO delivery (
            order_id,
            driver_user_id,
            delivery_status_id,
            assigned_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, NOW(), NOW(), NOW())
        `,
        [params.orderId, selectedCourier.id, deliveryStatusId],
      );
    }

    await connection.query<ResultSetHeader>(
      `
        UPDATE orders
        SET
          driver_id = NULL,
          updated_at = NOW()
        WHERE id = ?
      `,
      [params.orderId],
    );

    await createNotificationsForUsers(
      [selectedCourier.id],
      {
        type: "NEW_DELIVERY_AVAILABLE",
        title: `Nueva entrega disponible #FG-${String(params.orderId).padStart(4, "0")}`,
        message: `Hay un pedido listo para recoger en ${order.business_name}. Revísalo y acéptalo desde tu panel.`,
        relatedId: params.orderId,
      },
      connection,
    );

    await recordAuditLog(
      {
        userId: params.userId,
        action: "REQUEST_DELIVERY_DIRECT_ASSIGNMENT",
        resourceType: "order",
        resourceId: params.orderId,
        oldValue: {
          deliveryStatus: existingDelivery?.delivery_status_name ?? null,
          orderStatus: order.order_status_name,
        },
        newValue: {
          deliveryStatus: "pendiente_aceptacion",
          orderStatus: order.order_status_name,
          driverUserId: selectedCourier.id,
        },
      },
      connection,
    );

    logger.info(
      "delivery.direct_assignment_created",
      "Asignación directa de repartidor creada",
      {
        orderId: params.orderId,
        deliveryStatusId,
        businessId: Number(order.business_id),
        selectedCourierId: selectedCourier.id,
      },
    );
    logger.debug(
      "delivery.direct_assignment_notified",
      "Notificación enviada al repartidor asignado",
      {
        orderId: params.orderId,
        notifiedCourierIds: [selectedCourier.id],
      },
    );

    await connection.commit();

    return {
      courierId: selectedCourier.id,
      courierName: selectedCourier.name,
      courierPhone: selectedCourier.phone,
      courierAvatarUrl: selectedCourier.avatarUrl,
      notifiedCourierIds: [selectedCourier.id],
      deliveryRequested: true,
      noActiveCouriers: false,
      adminNotified: false,
      message: "Repartidor solicitado correctamente",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function respondToCourierAssignment(params: {
  orderId: number;
  userId: number;
  action: "accept" | "reject";
}) {
  const connection = await pool.getConnection();

  try {
    await ensureDeliveryCarouselSchema(connection);
    await ensureDriverStatusColumns(connection);
    await connection.beginTransaction();
    await ensureOrdersDriverColumn(connection);

    const order = await getOrderForAssignment(connection, params.orderId, {
      forUpdate: true,
    });

    if (!order) {
      throw new DeliveryAssignmentError("Pedido no encontrado", 404);
    }

    const delivery = await getDeliveryByOrderId(connection, params.orderId, {
      forUpdate: true,
    });

    if (!delivery) {
      throw new DeliveryAssignmentError(
        "No existe una asignacion para este pedido.",
        404,
      );
    }

    const deliveryAccess = await resolveDeliveryAccess(params.userId);

    if (!deliveryAccess.allowed) {
      throw new DeliveryAssignmentError(
        "No autorizado para responder asignaciones de repartidor.",
        403,
      );
    }

    const currentDeliveryStatus = normalizeStatus(
      delivery.delivery_status_name,
    );
    const isOpenAvailableDelivery =
      (currentDeliveryStatus === "pending_driver" ||
        currentDeliveryStatus === "disponible") &&
      !delivery.driver_user_id;

    if (
      !isOpenAvailableDelivery &&
      Number(delivery.driver_user_id) !== params.userId
    ) {
      throw new DeliveryAssignmentError(
        "No autorizado para responder esta asignacion.",
        403,
      );
    }

    if (delivery.delivery_status_is_final) {
      throw new DeliveryAssignmentError(
        "Esta asignacion ya fue cerrada previamente.",
        409,
      );
    }

    if (params.action === "accept") {
      if (!deliveryAccess.canOperate) {
        throw new DeliveryAssignmentError(
          "Tu estado operativo no permite aceptar entregas.",
          403,
          {
            operationalStatus: deliveryAccess.operationalStatus,
          },
        );
      }

      if (isOpenAvailableDelivery) {
        const activeAssignmentsCount = await getCourierActiveAssignmentsCount(
          connection,
          params.userId,
        );

        if (activeAssignmentsCount >= 5) {
          throw new DeliveryAssignmentError(
            "Ya alcanzaste el máximo de 5 entregas activas.",
            409,
          );
        }
      }

      if (
        currentDeliveryStatus !== "pendiente_aceptacion" &&
        currentDeliveryStatus !== "pending_driver" &&
        currentDeliveryStatus !== "disponible"
      ) {
        throw new DeliveryAssignmentError(
          "Esta asignacion ya no requiere confirmacion.",
          409,
        );
      }

      const deliveryStatusId = await ensureDeliveryStatus(
        "aceptado",
        "Asignacion aceptada por el repartidor",
        3,
        false,
        connection,
      );
      const { currentStatus } = validateOrderStatusTransition({
        currentStatus: order.order_status_name,
        nextStatus: "driver_assigned",
        role: "driver",
        order: {
          id: params.orderId,
          businessId: Number(order.business_id),
          customerUserId: Number(order.customer_user_id),
          driverUserId: params.userId,
          paymentMethod: null,
          currentStatus: String(order.order_status_name ?? ""),
        },
        actorUserId: params.userId,
      });

      const [deliveryUpdateResult] = await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            driver_user_id = ?,
            delivery_status_id = ?,
            assigned_at = COALESCE(assigned_at, NOW()),
            updated_at = NOW()
          WHERE order_id = ?
            AND (
              driver_user_id = ?
              OR (
                driver_user_id IS NULL
                AND ? = 1
              )
            )
        `,
        [
          params.userId,
          deliveryStatusId,
          params.orderId,
          params.userId,
          isOpenAvailableDelivery ? 1 : 0,
        ],
      );

      if (deliveryUpdateResult.affectedRows !== 1) {
        throw new DeliveryAssignmentError(
          "Esta entrega ya fue tomada por otro repartidor.",
          409,
        );
      }

      await connection.query<ResultSetHeader>(
        `
          UPDATE orders
          SET
            driver_id = ?,
            confirmed_at = COALESCE(confirmed_at, NOW()),
            updated_at = NOW()
          WHERE id = ?
        `,
        [params.userId, params.orderId],
      );

      await applyValidatedOrderStatusTransition(connection, {
        orderId: params.orderId,
        nextStatus: "driver_assigned",
        actorUserId: params.userId,
        actorRole: "driver",
        currentStatus,
        metadata: {
          source: "respondToCourierAssignment",
          action: "accept",
        },
      });

      await createNotificationForBusiness(
        Number(order.business_id),
        {
          type: "pedido",
          title: `Repartidor asignado #FG-${String(params.orderId).padStart(4, "0")}`,
          message:
            "Un repartidor aceptó la entrega y ya quedó asignado al pedido.",
          relatedId: params.orderId,
          dataJson: {
            order_id: params.orderId,
            business_id: Number(order.business_id),
            driver_user_id: params.userId,
          },
        },
        connection,
      );

      await createNotification(
        {
          userId: Number(order.customer_user_id),
          type: "pedido",
          title: `Tu pedido ya tiene repartidor #FG-${String(params.orderId).padStart(4, "0")}`,
          message: `Un repartidor aceptó la entrega de tu pedido de ${order.business_name}.`,
          relatedId: params.orderId,
          dataJson: {
            order_id: params.orderId,
            business_id: Number(order.business_id),
            driver_user_id: params.userId,
          },
        },
        connection,
      );

      await recordAuditLog(
        {
          userId: params.userId,
          action: "DRIVER_ACCEPT_DELIVERY",
          resourceType: "order",
          resourceId: params.orderId,
          oldValue: {
            deliveryStatus: delivery.delivery_status_name,
            orderStatus: order.order_status_name,
          },
          newValue: {
            deliveryStatus: "aceptado",
            orderStatus: "driver_assigned",
          },
        },
        connection,
      );

      await markCarouselAttemptStatus({
        connection,
        orderId: params.orderId,
        driverUserId: params.userId,
        status: "ACCEPTED",
      });

      await connection.commit();

      return {
        message: "Entrega aceptada correctamente.",
      };
    }

    if (isOpenAvailableDelivery) {
      throw new DeliveryAssignmentError(
        "Solo puedes rechazar entregas que ya te fueron asignadas.",
        409,
      );
    }

    await markCarouselAttemptStatus({
      connection,
      orderId: params.orderId,
      driverUserId: params.userId,
      status: "REJECTED",
    });

    const courierSearch = await findAvailableCourier(connection);
    const nextCourier = await selectNextCarouselCourier({
      connection,
      orderId: params.orderId,
      availableCouriers: courierSearch.availableCouriers,
    });

    await connection.query<ResultSetHeader>(
      `
        UPDATE orders
        SET
          driver_id = NULL,
          updated_at = NOW()
        WHERE id = ?
      `,
      [params.orderId],
    );

    if (nextCourier) {
      const nextDeliveryStatusId = await ensureDeliveryStatus(
        "pendiente_aceptacion",
        "Asignación pendiente de respuesta del repartidor",
        2,
        false,
        connection,
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            driver_user_id = ?,
            delivery_status_id = ?,
            assigned_at = NOW(),
            failed_at = NULL,
            updated_at = NOW()
          WHERE order_id = ?
        `,
        [nextCourier.id, nextDeliveryStatusId, params.orderId],
      );

      await createNotificationsForUsers(
        [nextCourier.id],
        {
          type: "NEW_DELIVERY_AVAILABLE",
          title: `Nueva entrega disponible #FG-${String(params.orderId).padStart(4, "0")}`,
          message: `Hay un pedido listo para recoger en ${order.business_name}. Revísalo y acéptalo desde tu panel.`,
          relatedId: params.orderId,
        },
        connection,
      );

      await recordAuditLog(
        {
          userId: params.userId,
          action: "DRIVER_REJECT_DELIVERY_REASSIGNED",
          resourceType: "order",
          resourceId: params.orderId,
          oldValue: {
            deliveryStatus: delivery.delivery_status_name,
            orderStatus: order.order_status_name,
            rejectedDriverUserId: params.userId,
          },
          newValue: {
            deliveryStatus: "pendiente_aceptacion",
            orderStatus: order.order_status_name,
            nextDriverUserId: nextCourier.id,
          },
        },
        connection,
      );

      logger.info(
        "delivery.carousel_reassigned_after_reject",
        "Entrega ofrecida al siguiente repartidor del carrusel",
        {
          orderId: params.orderId,
          rejectedDriverUserId: params.userId,
          nextDriverUserId: nextCourier.id,
        },
      );

      await connection.commit();

      return {
        message:
          "Entrega rechazada correctamente. Se ofreció al siguiente repartidor.",
      };
    }

    const supportsUnassignedDriver =
      await deliverySupportsUnassignedDriver(connection);
    const terminalStatusId = await ensureDeliveryStatus(
      supportsUnassignedDriver ? "pending_driver" : "rechazado",
      supportsUnassignedDriver
        ? "Entrega sin repartidor disponible"
        : "Asignacion rechazada por el repartidor",
      supportsUnassignedDriver ? 2 : 99,
      !supportsUnassignedDriver,
      connection,
    );

    await connection.query<ResultSetHeader>(
      `
        UPDATE delivery
        SET
          driver_user_id = NULL,
          delivery_status_id = ?,
          assigned_at = NULL,
          failed_at = NOW(),
          updated_at = NOW()
        WHERE order_id = ?
      `,
      [terminalStatusId, params.orderId],
    );

    const businessUserIds = await getBusinessNotificationUserIds(
      connection,
      Number(order.business_id),
    );

    await createNotificationsForUsers(
      businessUserIds,
      {
        type: "pedido",
        title: `Sin repartidor disponible #FG-${String(params.orderId).padStart(4, "0")}`,
        message:
          "El repartidor rechazó la asignación y el carrusel no encontró otro repartidor disponible.",
        relatedId: params.orderId,
      },
      connection,
    );

    await createNotificationsForAdminGeneral(
      {
        type: "delivery",
        title: `Sin repartidores disponibles #FG-${String(params.orderId).padStart(4, "0")}`,
        message:
          "Todos los repartidores disponibles rechazaron o no hay cupo activo para este pedido.",
        relatedId: params.orderId,
        dataJson: {
          order_id: params.orderId,
          business_id: Number(order.business_id),
          rejected_driver_user_id: params.userId,
          issue: "delivery_carousel_exhausted",
        },
      },
      connection,
    );

    await recordAuditLog(
      {
        userId: params.userId,
        action: "DRIVER_REJECT_DELIVERY_NO_COURIER_AVAILABLE",
        resourceType: "order",
        resourceId: params.orderId,
        oldValue: {
          deliveryStatus: delivery.delivery_status_name,
          orderStatus: order.order_status_name,
          rejectedDriverUserId: params.userId,
        },
        newValue: {
          deliveryStatus: supportsUnassignedDriver
            ? "pending_driver"
            : "rechazado",
          orderStatus: order.order_status_name,
          noActiveCouriers: true,
        },
      },
      connection,
    );

    await connection.commit();

    return {
      message:
        "Entrega rechazada correctamente. No hay otro repartidor disponible.",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
