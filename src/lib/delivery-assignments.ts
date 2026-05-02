import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  ensureDeliveryStatus,
  ensureOrderStatus,
  findAvailableCourier,
  resolveBusinessAccess,
} from "@/lib/business-panel";
import pool from "@/lib/db";
import { createNotificationsForUsers } from "@/lib/notifications";

type OrderRow = RowDataPacket & {
  id: number;
  business_id: number;
  business_name: string;
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
          'repartidor_asignado'
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

async function getOrderForAssignment(
  connection: PoolConnection,
  orderId: number,
) {
  const [rows] = await connection.query<OrderRow[]>(
    `
      SELECT
        o.id,
        o.business_id,
        b.name AS business_name,
        osc.name AS order_status_name
      FROM orders o
      INNER JOIN business b ON b.id = o.business_id
      LEFT JOIN order_status_catalog osc ON osc.id = o.order_status_id
      WHERE o.id = ?
      LIMIT 1
    `,
    [orderId],
  );

  return rows[0] ?? null;
}

async function getDeliveryByOrderId(
  connection: PoolConnection,
  orderId: number,
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
    console.log("[delivery-assignment] order_id recibido:", params.orderId);

    await connection.beginTransaction();

    const order = await getOrderForAssignment(connection, params.orderId);

    if (!order) {
      throw new DeliveryAssignmentError("Pedido no encontrado", 404);
    }

    console.log("[delivery-assignment] pedidos listos:", [
      {
        orderId: Number(order.id),
        businessId: Number(order.business_id),
        status: order.order_status_name ?? "sin_status",
      },
    ]);

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
    );
    const existingDeliveryIsActive =
      existingDelivery && !existingDelivery.delivery_status_is_final;

    if (existingDeliveryIsActive) {
      throw new DeliveryAssignmentError(
        "Este pedido ya tiene un repartidor asignado o pendiente de respuesta.",
        409,
      );
    }

    const courierSearch = await findAvailableCourier(connection);
    const availableCouriers = courierSearch.availableCouriers;
    const hasCourierUsers =
      Array.isArray(courierSearch.debug.usuariosRepartidores) &&
      courierSearch.debug.usuariosRepartidores.length > 0;

    if (!hasCourierUsers) {
      throw new DeliveryAssignmentError(
        "No hay repartidores disponibles",
        409,
        courierSearch.debug,
      );
    }

    const selectedCourier = courierSearch.courier;
    const supportsUnassignedDriver =
      await deliverySupportsUnassignedDriver(connection);

    console.log("[delivery-assignment] repartidores disponibles:", {
      orderId: params.orderId,
      couriers: availableCouriers,
      supportsUnassignedDriver,
    });

    if (supportsUnassignedDriver) {
      const deliveryStatusId = await ensureDeliveryStatus(
        "pending_driver",
        "Entrega disponible para repartidores",
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

      await createNotificationsForUsers(
        availableCouriers.map((courier) => courier.id),
        {
          type: "NEW_DELIVERY_AVAILABLE",
          title: `Nueva entrega disponible #FG-${String(params.orderId).padStart(4, "0")}`,
          message: `Hay un pedido listo para recoger en ${order.business_name}. Revísalo y acéptalo desde tu panel.`,
          relatedId: params.orderId,
        },
        connection,
      );

      console.log("[delivery-assignment] Entrega creada para repartidor:", {
        orderId: params.orderId,
        deliveryStatusId,
        businessId: Number(order.business_id),
        availableCourierIds: availableCouriers.map((courier) => courier.id),
      });
      console.log("[delivery-assignment] Notificación creada:", {
        orderId: params.orderId,
        notifiedCourierIds: availableCouriers.map((courier) => courier.id),
      });

      await connection.commit();

      return {
        courierId: null,
        courierName: null,
        courierPhone: null,
        courierAvatarUrl: null,
        notifiedCourierIds: availableCouriers.map((courier) => courier.id),
        message: "Entrega disponible para repartidores creada correctamente",
      };
    }

    if (!selectedCourier) {
      throw new DeliveryAssignmentError(
        "Todos los repartidores están ocupados",
        409,
        courierSearch.debug,
      );
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

    console.log("[delivery-assignment] Entrega creada para repartidor:", {
      orderId: params.orderId,
      deliveryStatusId,
      businessId: Number(order.business_id),
      selectedCourierId: selectedCourier.id,
    });
    console.log("[delivery-assignment] Notificación creada:", {
      orderId: params.orderId,
      notifiedCourierIds: [selectedCourier.id],
    });

    await connection.commit();

    return {
      courierId: selectedCourier.id,
      courierName: selectedCourier.name,
      courierPhone: selectedCourier.phone,
      courierAvatarUrl: selectedCourier.avatarUrl,
      notifiedCourierIds: [selectedCourier.id],
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
    await connection.beginTransaction();

    const order = await getOrderForAssignment(connection, params.orderId);

    if (!order) {
      throw new DeliveryAssignmentError("Pedido no encontrado", 404);
    }

    const delivery = await getDeliveryByOrderId(connection, params.orderId);

    if (!delivery) {
      throw new DeliveryAssignmentError(
        "No existe una asignacion para este pedido.",
        404,
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
      const orderStatusId = await ensureOrderStatus(
        "repartidor_asignado",
        "Repartidor asignado y confirmado",
        6,
        false,
        connection,
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE delivery
          SET
            driver_user_id = ?,
            delivery_status_id = ?,
            assigned_at = COALESCE(assigned_at, NOW()),
            updated_at = NOW()
          WHERE order_id = ?
        `,
        [params.userId, deliveryStatusId, params.orderId],
      );

      await connection.query<ResultSetHeader>(
        `
          UPDATE orders
          SET
            order_status_id = ?,
            confirmed_at = COALESCE(confirmed_at, NOW()),
            updated_at = NOW()
          WHERE id = ?
        `,
        [orderStatusId, params.orderId],
      );

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

    const deliveryStatusId = await ensureDeliveryStatus(
      "rechazado",
      "Asignacion rechazada por el repartidor",
      99,
      true,
      connection,
    );
    const orderStatusId = await ensureOrderStatus(
      "repartidor_rechazado",
      "La asignacion fue rechazada por el repartidor",
      7,
      false,
      connection,
    );

    await connection.query<ResultSetHeader>(
      `
        UPDATE delivery
        SET
          delivery_status_id = ?,
          failed_at = NOW(),
          updated_at = NOW()
        WHERE order_id = ?
      `,
      [deliveryStatusId, params.orderId],
    );

    await connection.query<ResultSetHeader>(
      `
        UPDATE orders
        SET
          order_status_id = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [orderStatusId, params.orderId],
    );

    const businessUserIds = await getBusinessNotificationUserIds(
      connection,
      Number(order.business_id),
    );

    await createNotificationsForUsers(
      businessUserIds,
      {
        type: "pedido",
        title: `Asignacion rechazada #FG-${String(params.orderId).padStart(4, "0")}`,
        message:
          "El repartidor rechazo esta asignacion. Puedes solicitar otro repartidor desde el panel del negocio.",
        relatedId: params.orderId,
      },
      connection,
    );

    await connection.commit();

    return {
      message: "Entrega rechazada correctamente.",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
