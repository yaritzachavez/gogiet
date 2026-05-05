export const ORDER_STATUS_DEFINITIONS = [
  {
    code: "pending",
    label: "Pendiente",
    aliases: ["pending", "pendiente", "pedido_recibido"],
  },
  {
    code: "payment_review",
    label: "Pago pendiente de validación",
    aliases: ["payment_review", "por_validar_pago"],
  },
  {
    code: "accepted",
    label: "Aceptado",
    aliases: ["accepted", "aceptado", "pago_validado"],
  },
  {
    code: "preparing",
    label: "Preparando",
    aliases: ["preparing", "preparando", "en_preparacion", "preparacion"],
  },
  {
    code: "ready_for_pickup",
    label: "Listo para recoger",
    aliases: ["ready_for_pickup", "listo_para_recoger"],
  },
  {
    code: "delivery_requested",
    label: "Repartidor solicitado",
    aliases: [
      "delivery_requested",
      "repartidor_solicitado",
      "pendiente_aceptacion",
      "pending_driver",
      "disponible",
      "repartidor_rechazado",
    ],
  },
  {
    code: "driver_assigned",
    label: "Repartidor asignado",
    aliases: [
      "driver_assigned",
      "repartidor_asignado",
      "aceptado_repartidor",
      "recogido",
    ],
  },
  {
    code: "on_the_way",
    label: "En camino",
    aliases: ["on_the_way", "en_camino", "en_ruta", "saliendo"],
  },
  {
    code: "delivered",
    label: "Entregado",
    aliases: ["delivered", "entregado", "pedido_entregado"],
  },
  {
    code: "cancelled",
    label: "Cancelado",
    aliases: ["cancelled", "cancelado"],
  },
] as const;

export type CanonicalOrderStatus =
  (typeof ORDER_STATUS_DEFINITIONS)[number]["code"];

function normalizeStatusValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

export function resolveCanonicalOrderStatus(
  value: unknown,
): CanonicalOrderStatus {
  const normalized = normalizeStatusValue(value);

  for (const definition of ORDER_STATUS_DEFINITIONS) {
    if (
      definition.aliases.some(
        (alias) => normalizeStatusValue(alias) === normalized,
      )
    ) {
      return definition.code;
    }
  }

  return "pending";
}

export function getOrderStatusLabel(value: unknown) {
  const code = resolveCanonicalOrderStatus(value);

  return (
    ORDER_STATUS_DEFINITIONS.find((definition) => definition.code === code)
      ?.label ?? "Pendiente"
  );
}
