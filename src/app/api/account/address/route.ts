import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { prisma } from "@/lib/prisma";
import { getDefaultShippingZoneByName } from "@/lib/shipping-zones";

type StoredAddressMeta = {
  references?: string;
  deliveryInstructions?: string;
  deliveryNotes?: string;
  estimatedDistanceKm?: number | null;
  zone?: string;
};

type ShippingZoneRow = {
  id?: number;
  nombre: string;
  tipo?: string;
  distancia_km?: number | string | null;
};

const DELIVERY_LOCATION_STORAGE_KEY = "gogi:selected-delivery-location";

function getUserIdFromRequest(req: NextRequest) {
  const authUser = getAuthUser(req);
  const userId = Number(authUser?.user?.id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function parseAddressMeta(referenceNotes?: string | null): StoredAddressMeta {
  if (!referenceNotes) return {};

  try {
    return JSON.parse(referenceNotes) as StoredAddressMeta;
  } catch {
    return {
      references: referenceNotes,
    };
  }
}

function formatAddress(address: {
  street: string;
  external_number?: string | null;
  internal_number?: string | null;
  neighborhood: string;
  city: string;
  state: string;
}) {
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

function normalizeAddressResponse(address: {
  id: number;
  label: string | null;
  recipient_name: string | null;
  phone: string | null;
  street: string;
  external_number: string | null;
  internal_number: string | null;
  neighborhood: string;
  city: string;
  state: string;
  reference_notes: string | null;
}) {
  const meta = parseAddressMeta(address.reference_notes);

  return {
    id: address.id,
    placeType: address.label ?? "",
    placeName: address.recipient_name,
    street: address.street,
    externalNumber: address.external_number,
    internalNumber: address.internal_number,
    neighborhood: address.neighborhood,
    zone: meta.zone ?? address.neighborhood,
    city: address.city,
    state: address.state,
    phone: address.phone ?? "",
    references: meta.references ?? "",
    deliveryInstructions: meta.deliveryInstructions ?? meta.deliveryNotes ?? "",
    deliveryNotes: meta.deliveryNotes ?? meta.deliveryInstructions ?? "",
    estimatedDistanceKm:
      typeof meta.estimatedDistanceKm === "number"
        ? meta.estimatedDistanceKm
        : null,
    fullAddress: formatAddress(address),
    storageKey: DELIVERY_LOCATION_STORAGE_KEY,
  };
}

function normalizeOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRequiredString(value: unknown) {
  return String(value ?? "").trim();
}

async function resolveShippingZone(zoneName: string) {
  if (!zoneName) {
    return null;
  }

  try {
    const rows = await prisma.$queryRaw<ShippingZoneRow[]>`
      SELECT id, nombre, tipo, distancia_km
      FROM zonas_envio
      WHERE activo = TRUE
        AND nombre = ${zoneName}
      LIMIT 1
    `;

    if (rows.length > 0) {
      return rows[0];
    }
  } catch (error) {
    console.error("SAVE ADDRESS ERROR:", error);
  }

  const fallbackZone = getDefaultShippingZoneByName(zoneName);

  if (!fallbackZone) {
    return null;
  }

  return {
    id: fallbackZone.id,
    nombre: fallbackZone.nombre,
    tipo: fallbackZone.tipo,
    distancia_km: fallbackZone.distanciaKm,
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Inicia sesión para guardar tu dirección" },
        { status: 401 },
      );
    }

    const address = await prisma.addresses.findFirst({
      where: {
        user_id: userId,
      },
      orderBy: [{ is_default: "desc" }, { updated_at: "desc" }],
      select: {
        id: true,
        label: true,
        recipient_name: true,
        phone: true,
        street: true,
        external_number: true,
        internal_number: true,
        neighborhood: true,
        city: true,
        state: true,
        reference_notes: true,
      },
    });

    return NextResponse.json({
      success: true,
      address: address ? normalizeAddressResponse(address) : null,
    });
  } catch (error) {
    console.error("SAVE ADDRESS ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No pudimos cargar la dirección",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Inicia sesión para guardar tu dirección" },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const placeType = normalizeRequiredString(
      body?.placeType ?? body?.label ?? body?.place_type,
    );
    const placeName = normalizeOptionalString(
      body?.placeName ?? body?.recipient_name ?? body?.place_name,
    );
    const street = normalizeRequiredString(body?.street);
    const externalNumber = normalizeRequiredString(
      body?.externalNumber ?? body?.exterior_number,
    );
    const internalNumber = normalizeOptionalString(
      body?.internalNumber ?? body?.interior_number,
    );
    const neighborhood = normalizeRequiredString(
      body?.neighborhood ?? body?.zone,
    );
    const references = normalizeRequiredString(body?.references);
    const phone = normalizeRequiredString(body?.phone);
    const deliveryInstructions = normalizeRequiredString(
      body?.deliveryInstructions ?? body?.delivery_notes,
    );
    const withoutExternalNumber = Boolean(body?.withoutExternalNumber);

    if (!street || !neighborhood || !phone) {
      return NextResponse.json(
        {
          success: false,
          error: "street, zone y phone son obligatorios",
        },
        { status: 400 },
      );
    }

    if (!placeType) {
      return NextResponse.json(
        {
          success: false,
          error: "Selecciona el tipo de lugar antes de guardar la dirección",
        },
        { status: 400 },
      );
    }

    if (!withoutExternalNumber && !externalNumber) {
      return NextResponse.json(
        {
          success: false,
          error: "El número exterior es obligatorio para esta dirección",
        },
        { status: 400 },
      );
    }

    const needsReferences =
      ["cabaña", "hotel"].includes(placeType.toLowerCase()) ||
      /rancher|comunidad|zona rural|cabaña/i.test(neighborhood);

    if (needsReferences && !references) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Las referencias son obligatorias para cabañas, hoteles o zonas rurales",
        },
        { status: 400 },
      );
    }

    const selectedZone = await resolveShippingZone(neighborhood);

    if (!selectedZone) {
      return NextResponse.json(
        {
          success: false,
          error: "Selecciona una zona de envío válida",
        },
        { status: 400 },
      );
    }

    const estimatedDistanceKm =
      body?.estimated_distance_km !== undefined &&
      body?.estimated_distance_km !== null &&
      String(body.estimated_distance_km).trim() !== ""
        ? Number(body.estimated_distance_km)
        : Number(selectedZone.distancia_km ?? 0);

    const serializedMeta = JSON.stringify({
      references,
      deliveryInstructions,
      deliveryNotes: deliveryInstructions,
      estimatedDistanceKm: Number.isFinite(estimatedDistanceKm)
        ? estimatedDistanceKm
        : null,
      zone: selectedZone.nombre,
    }).slice(0, 255);

    const existingDefaultAddress = await prisma.addresses.findFirst({
      where: {
        user_id: userId,
        is_default: true,
      },
      orderBy: {
        updated_at: "desc",
      },
      select: {
        id: true,
        status_id: true,
      },
    });

    let savedAddress: {
      id: number;
      label: string | null;
      recipient_name: string | null;
      phone: string | null;
      street: string;
      external_number: string | null;
      internal_number: string | null;
      neighborhood: string;
      city: string;
      state: string;
      reference_notes: string | null;
    };

    if (existingDefaultAddress?.id) {
      savedAddress = await prisma.addresses.update({
        where: {
          id: existingDefaultAddress.id,
        },
        data: {
          label: placeType,
          recipient_name: placeName,
          phone,
          street,
          external_number: withoutExternalNumber ? null : externalNumber,
          internal_number: internalNumber,
          neighborhood: selectedZone.nombre,
          city: "Mazamitla",
          state: "Jalisco",
          postal_code: "49500",
          reference_notes: serializedMeta || null,
          is_default: true,
          status_id: Number(existingDefaultAddress.status_id ?? 1) || 1,
          updated_at: new Date(),
        },
        select: {
          id: true,
          label: true,
          recipient_name: true,
          phone: true,
          street: true,
          external_number: true,
          internal_number: true,
          neighborhood: true,
          city: true,
          state: true,
          reference_notes: true,
        },
      });
    } else {
      await prisma.addresses.updateMany({
        where: {
          user_id: userId,
          is_default: true,
        },
        data: {
          is_default: false,
        },
      });

      savedAddress = await prisma.addresses.create({
        data: {
          user_id: userId,
          label: placeType,
          recipient_name: placeName,
          phone,
          street,
          external_number: withoutExternalNumber ? null : externalNumber,
          internal_number: internalNumber,
          neighborhood: selectedZone.nombre,
          city: "Mazamitla",
          state: "Jalisco",
          postal_code: "49500",
          reference_notes: serializedMeta || null,
          is_default: true,
          status_id:
            Number(body?.status_id ?? body?.address_status_id ?? 1) || 1,
        },
        select: {
          id: true,
          label: true,
          recipient_name: true,
          phone: true,
          street: true,
          external_number: true,
          internal_number: true,
          neighborhood: true,
          city: true,
          state: true,
          reference_notes: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      address: normalizeAddressResponse(savedAddress),
      delivery_location_key: DELIVERY_LOCATION_STORAGE_KEY,
    });
  } catch (error) {
    console.error("SAVE ADDRESS ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No pudimos guardar la dirección",
      },
      { status: 500 },
    );
  }
}
