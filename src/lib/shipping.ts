export type DeliveryZoneOption = {
  id: number;
  nombre: string;
  tipo: string;
  distanciaKm: number;
  activo: boolean;
};

export type ShippingByAddressResult = {
  zoneName: string | null;
  shippingCost: number | null;
  requiresConfirmation: boolean;
  message: string;
  distanceKm: number | null;
};

export function calculateShippingCost(distanceKm: number) {
  return 25 + distanceKm * 8;
}
