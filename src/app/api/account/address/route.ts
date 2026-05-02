import jwt from "jsonwebtoken";
import { type NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getDefaultShippingZoneByName } from "@/lib/shipping-zones";

type JwtPayload = {
  id?: number;
};

type StoredAddressMeta = {
  references?: string;
  deliveryInstructions?: string;
};

type ShippingZoneRow = {
  nombre: string;
};

function getTokenFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  return req.cookies.get("authToken")?.value ?? null;
}

function getUserIdFromRequest(req: NextRequest) {
  const token = getTokenFromRequest(req);
  const secret = process.env.JWT_SECRET || "gogi-dev-secret";

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return typeof decoded.id === "number" ? decoded.id : null;
  } catch (error) {
    console.error("Error validando token de dirección:", error);
    return null;
  }
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
    city: address.city,
    state: address.state,
    phone: address.phone ?? "",
    references: meta.references ?? "",
    deliveryInstructions: meta.deliveryInstructions ?? "",
    fullAddress: formatAddress(address),
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
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
    console.error(error);
    return NextResponse.json(
      { success: false, error: "No pudimos cargar la dirección" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const placeType = String(body?.placeType ?? "").trim();
    const placeName = String(body?.placeName ?? "").trim();
    const street = String(body?.street ?? "").trim();
    const externalNumber = String(body?.externalNumber ?? "").trim();
    const internalNumber = String(body?.internalNumber ?? "").trim();
    const neighborhood = String(body?.neighborhood ?? "").trim();
    const references = String(body?.references ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const deliveryInstructions = String(
      body?.deliveryInstructions ?? "",
    ).trim();
    const withoutExternalNumber = Boolean(body?.withoutExternalNumber);

    if (!placeType || !street || !neighborhood || !phone) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Tipo de lugar, calle, colonia/ranchería/zona y teléfono son obligatorios",
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

    let validZone: ShippingZoneRow[] = [];

    try {
      validZone = await prisma.$queryRaw<ShippingZoneRow[]>`
        SELECT nombre
        FROM zonas_envio
        WHERE activo = TRUE
          AND nombre = ${neighborhood}
        LIMIT 1
      `;
    } catch (error) {
      console.error(error);

      const fallbackZone = getDefaultShippingZoneByName(neighborhood);

      validZone = fallbackZone ? [{ nombre: fallbackZone.nombre }] : [];
    }

    if (validZone.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Selecciona una zona de envío válida",
        },
        { status: 400 },
      );
    }

    const serializedMeta = JSON.stringify({
      references,
      deliveryInstructions,
    }).slice(0, 255);

    await prisma.addresses.updateMany({
      where: {
        user_id: userId,
        is_default: true,
      },
      data: {
        is_default: false,
      },
    });

    const savedAddress = await prisma.addresses.create({
      data: {
        user_id: userId,
        label: placeType,
        recipient_name: placeName || null,
        phone,
        street,
        external_number: withoutExternalNumber ? null : externalNumber,
        internal_number: internalNumber || null,
        neighborhood,
        city: "Mazamitla",
        state: "Jalisco",
        postal_code: "49500",
        reference_notes: serializedMeta || null,
        is_default: true,
        status_id: 1,
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

    return NextResponse.json({
      success: true,
      address: normalizeAddressResponse(savedAddress),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "No pudimos guardar la dirección" },
      { status: 500 },
    );
  }
}
