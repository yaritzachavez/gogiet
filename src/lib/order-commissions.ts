import { calculateShippingCost } from "@/lib/shipping";

export const SERVICE_FEE_RATE = 0.05;
export const PLATFORM_DELIVERY_FEE_RATE = 0.3;
export const DRIVER_DELIVERY_FEE_RATE = 0.7;

function roundMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

export function calculateServiceFee(subtotal: number) {
  return roundMoney(subtotal * SERVICE_FEE_RATE);
}

export function calculateDeliveryFeeByDistance(distanceKm: number | null) {
  if (!Number.isFinite(Number(distanceKm)) || Number(distanceKm) < 0) {
    return 0;
  }

  return roundMoney(calculateShippingCost(Number(distanceKm)));
}

export function calculateDeliveryCommissionBreakdown(deliveryFee: number) {
  const safeDeliveryFee = roundMoney(deliveryFee);
  const platformFee = roundMoney(safeDeliveryFee * PLATFORM_DELIVERY_FEE_RATE);
  const driverFee = roundMoney(safeDeliveryFee * DRIVER_DELIVERY_FEE_RATE);

  return {
    deliveryFee: safeDeliveryFee,
    platformFee,
    driverFee,
  };
}

export function calculateOrderCommissionBreakdown(params: {
  subtotal: number;
  distanceKm?: number | null;
  deliveryFeeOverride?: number | null;
  terminalFee?: number;
  tipAmount?: number;
  discountAmount?: number;
}) {
  const subtotal = roundMoney(params.subtotal);
  const serviceFee = calculateServiceFee(subtotal);
  const deliveryFee = roundMoney(
    params.deliveryFeeOverride != null
      ? Number(params.deliveryFeeOverride)
      : calculateDeliveryFeeByDistance(params.distanceKm ?? null),
  );
  const { platformFee, driverFee } =
    calculateDeliveryCommissionBreakdown(deliveryFee);
  const terminalFee = roundMoney(params.terminalFee ?? 0);
  const tipAmount = roundMoney(params.tipAmount ?? 0);
  const discountAmount = roundMoney(params.discountAmount ?? 0);
  const total = roundMoney(
    subtotal +
      serviceFee +
      deliveryFee +
      terminalFee +
      tipAmount -
      discountAmount,
  );

  return {
    subtotal,
    serviceFee,
    deliveryFee,
    platformFee,
    driverFee,
    terminalFee,
    tipAmount,
    discountAmount,
    total,
  };
}
