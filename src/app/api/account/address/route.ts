import { type NextRequest, NextResponse } from "next/server";

import { ensureAddressesTable } from "@/lib/addresses-table";
import { getAuthUser } from "@/lib/admin-security";
import { getFirstExistingTable } from "@/lib/db-schema";
import {
  buildAddressMeta,
  resolveAuthoritativeShippingQuote,
  validateCoordinate,
} from "@/lib/order-quote";
import { prisma } from "@/lib/prisma";
import { handleCorsPreflight, withCors } from "@/lib/server/cors";
import {
  getActiveShippingZones,
  normalizeShippingZoneName,
} from "@/lib/shipping-zones";

type StoredAddressMeta = {
  references?: string;
  deliveryInstructions?: string;
  deliveryNotes?: string;
  zone?: string;
};

type AddressRow = {
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

const DELIVERY_LOCATION_STORAGE_KEY = "gogi:selected-delivery-location";

export function OPTIONS(req: Request) {
  return handleCorsPreflight(req);
}

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
    estimatedDistanceKm: null,
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

  const normalizedZoneName = normalizeShippingZoneName(zoneName);
  const { zones } = await getActiveShippingZones();

  return (
    zones.find(
      (zone) => normalizeShippingZoneName(zone.nombre) === normalizedZoneName,
    ) ?? null
  );
}

async function findUserAddress(userId: number) {
  const existingTable = await getFirstExistingTable([
    "addresses",
    "account_address",
    "account_addresses",
  ]);

  if (!existingTable) {
    await ensureAddressesTable();
  }

  if (!existingTable || existingTable === "addresses") {
    return prisma.addresses.findFirst({
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
  }

  try {
    const rows = await prisma.$queryRawUnsafe<AddressRow[]>(
      `
        SELECT
          id,
          label,
          recipient_name,
          phone,
          street,
          external_number,
          internal_number,
          neighborhood,
          city,
          state,
          reference_notes
        FROM \`${existingTable}\`
        WHERE user_id = ?
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 1
      `,
      userId,
    );

    return rows[0] ?? null;
  } catch (error) {
    console.warn(
      `[account/address] No se pudo leer la tabla alternativa ${existingTable}`,
      error,
    );
    return null;
  }
}

export async function GET(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withCors(req, NextResponse.json(body, init));

  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return json(
        {
          success: false,
          error: "Inicia sesión para consultar tu dirección.",
          address: null,
        },
        { status: 401 },
      );
    }

    const address = await findUserAddress(userId);

    return json({
      success: true,
      address: address ? normalizeAddressResponse(address) : null,
    });
  } catch (error) {
    console.error("SAVE ADDRESS ERROR:", error);
    return json(
      {
        success: false,
        error: "No pudimos cargar la dirección",
        address: null,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAddressesTable();

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

    const latitude = validateCoordinate(body?.latitude, -90, 90);
    const longitude = validateCoordinate(body?.longitude, -180, 180);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return NextResponse.json(
        {
          success: false,
          error: "Las coordenadas de la dirección no son válidas.",
        },
        { status: 400 },
      );
    }

    const quote = resolveAuthoritativeShippingQuote({
      address: {
        neighborhood: selectedZone.nombre,
        latitude,
        longitude,
      },
      zones: [
        {
          id: Number(selectedZone.id),
          nombre: selectedZone.nombre,
          distanciaKm: Number(selectedZone.distanciaKm ?? 0),
          activo: Boolean(selectedZone.activo),
        },
      ],
    });

    if (!quote.ok) {
      return NextResponse.json(
        {
          success: false,
          error: quote.message,
        },
        { status: 400 },
      );
    }

    const serializedMeta = buildAddressMeta({
      references,
      deliveryInstructions,
      zone: selectedZone.nombre,
    });

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
          latitude: latitude == null ? null : latitude,
          longitude: longitude == null ? null : longitude,
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
          latitude: latitude == null ? null : latitude,
          longitude: longitude == null ? null : longitude,
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
        error: "No pudimos guardar la dirección",
      },
      { status: 500 },
    );
  }
}
