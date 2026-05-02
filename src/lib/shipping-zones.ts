import type { DeliveryZoneOption } from "@/lib/shipping";

export const DEFAULT_SHIPPING_ZONES: DeliveryZoneOption[] = [
  {
    id: 1,
    nombre: "Mazamitla Cabecera",
    tipo: "zona",
    distanciaKm: 3.5,
    activo: true,
  },
  {
    id: 2,
    nombre: "Mazamitla Centro",
    tipo: "zona",
    distanciaKm: 3.3,
    activo: true,
  },
  {
    id: 3,
    nombre: "Las Colonias",
    tipo: "zona",
    distanciaKm: 3.3,
    activo: true,
  },
  {
    id: 4,
    nombre: "El Huricho",
    tipo: "rancho",
    distanciaKm: 3.6,
    activo: true,
  },
  {
    id: 5,
    nombre: "La Gloria",
    tipo: "rancho",
    distanciaKm: 3.4,
    activo: true,
  },
  {
    id: 6,
    nombre: "Barrio Alto",
    tipo: "barrio",
    distanciaKm: 3.3,
    activo: true,
  },
  { id: 7, nombre: "El Coporo", tipo: "Zona", distanciaKm: 3.3, activo: true },
  {
    id: 8,
    nombre: "La Herradura",
    tipo: "Zona",
    distanciaKm: 3.7,
    activo: true,
  },
  {
    id: 9,
    nombre: "El Chorro",
    tipo: "Zona",
    distanciaKm: 4.0,
    activo: true,
  },
  { id: 10, nombre: "Pinos", tipo: "rancho", distanciaKm: 5.0, activo: true },
  {
    id: 11,
    nombre: "Epenche Chico",
    tipo: "rancho",
    distanciaKm: 0.0,
    activo: true,
  },
  {
    id: 12,
    nombre: "La Estacada",
    tipo: "rancho",
    distanciaKm: 2.0,
    activo: true,
  },
  {
    id: 13,
    nombre: "Llano de los Toros",
    tipo: "rancho",
    distanciaKm: 2.0,
    activo: true,
  },
  {
    id: 14,
    nombre: "Puerta del Zapatero",
    tipo: "rancho",
    distanciaKm: 5.0,
    activo: true,
  },
  {
    id: 15,
    nombre: "Puerto de Cuevas",
    tipo: "rancho",
    distanciaKm: 4.5,
    activo: true,
  },
  {
    id: 16,
    nombre: "El Pandito",
    tipo: "Zona",
    distanciaKm: 4.0,
    activo: true,
  },
  {
    id: 17,
    nombre: "El Charco",
    tipo: "Zona",
    distanciaKm: 3.0,
    activo: true,
  },
  {
    id: 18,
    nombre: "El Tigre",
    tipo: "Zona",
    distanciaKm: 6.0,
    activo: true,
  },
];

export function normalizeShippingZoneName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDefaultShippingZoneByName(name: string) {
  const normalizedName = normalizeShippingZoneName(name);

  return (
    DEFAULT_SHIPPING_ZONES.find(
      (zone) => normalizeShippingZoneName(zone.nombre) === normalizedName,
    ) ?? null
  );
}

export function getDefaultShippingZoneByAddress(address: string) {
  const normalizedAddress = normalizeShippingZoneName(address);

  if (!normalizedAddress) return null;

  return (
    DEFAULT_SHIPPING_ZONES.find((zone) =>
      normalizedAddress.includes(normalizeShippingZoneName(zone.nombre)),
    ) ?? null
  );
}
