import { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { resolveBusinessAccess } from "@/lib/business-panel";
import { cloudinary, getCloudinaryConfigStatus } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function uploadToCloudinary(buffer: Buffer, businessId: number) {
  return new Promise<{
    secure_url: string;
    public_id: string;
  }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `gogi-eats/business/${businessId}`,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("No se pudo subir la imagen."));
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    stream.end(buffer);
  });
}

export async function POST(req: NextRequest) {
  let step = "init";

  try {
    step = "auth";
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    step = "cloudinary-config";
    const cloudinaryConfig = getCloudinaryConfigStatus();

    if (!cloudinaryConfig.isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: `Falta configuración de Cloudinary: ${cloudinaryConfig.missing.join(", ")}`,
        },
        { status: 500 },
      );
    }

    step = "read-form-data";
    const formData = await req.formData();
    const requestedBusinessIdRaw = formData.get("business_id");
    const requestedBusinessId = Number(requestedBusinessIdRaw);
    const remove = String(formData.get("remove") ?? "0") === "1";

    step = "resolve-business-access";
    const access = await resolveBusinessAccess(
      authUser.user.id,
      Number.isFinite(requestedBusinessId) ? requestedBusinessId : null,
    );

    console.info("[business-photo] request context", {
      userId: authUser.user.id,
      requestedBusinessIdRaw:
        typeof requestedBusinessIdRaw === "string"
          ? requestedBusinessIdRaw
          : null,
      requestedBusinessId: Number.isFinite(requestedBusinessId)
        ? requestedBusinessId
        : null,
      resolvedBusinessId: access.businessId,
      availableBusinessIds: access.businessIds,
      remove,
    });

    if (!access.businessId) {
      return NextResponse.json(
        { success: false, error: "No tienes un negocio asignado" },
        { status: 403 },
      );
    }

    if (
      Number.isFinite(requestedBusinessId) &&
      requestedBusinessId > 0 &&
      !access.businessIds.includes(requestedBusinessId)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Negocio no encontrado",
        },
        { status: 404 },
      );
    }

    step = "find-business-before-update";
    const business = await prisma.business.findUnique({
      where: { id: access.businessId },
      select: { id: true, name: true, logo_url: true },
    });

    console.info("[business-photo] business lookup", {
      businessId: access.businessId,
      exists: Boolean(business),
      businessName: business?.name ?? null,
    });

    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error: "Negocio no encontrado",
        },
        { status: 404 },
      );
    }

    if (remove) {
      step = "remove-photo-db-update";
      await prisma.business.update({
        where: { id: access.businessId },
        data: { logo_url: null },
      });

      return NextResponse.json({
        success: true,
        url: null,
        imageUrl: null,
        logo_url: null,
        avatar_url: null,
      });
    }

    step = "extract-file";
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No se recibió imagen en el campo 'file'" },
        { status: 400 },
      );
    }

    const allowedTypes = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Solo se permiten JPG, PNG o WEBP" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "La imagen no debe superar 5 MB" },
        { status: 400 },
      );
    }

    step = "read-file-buffer";
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    step = "cloudinary-upload";
    const result = await uploadToCloudinary(buffer, access.businessId);

    step = "save-db-url";
    console.info("[business-photo] saving business logo", {
      businessId: access.businessId,
      businessName: business.name,
    });
    await prisma.business.update({
      where: { id: access.businessId },
      data: { logo_url: result.secure_url },
    });

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      logo_url: result.secure_url,
      avatar_url: result.secure_url,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      console.error("[business-photo] Business update target not found", {
        step,
        message: error.message,
        code: error.code,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Negocio no encontrado",
        },
        { status: 404 },
      );
    }

    console.error("[business-photo] Error subiendo foto del negocio", {
      step,
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const detailedMessage =
      error instanceof Error
        ? error.message
        : "Error subiendo foto del negocio";

    return NextResponse.json(
      {
        success: false,
        error: `Error en ${step}: ${detailedMessage}`,
      },
      { status: 500 },
    );
  }
}
