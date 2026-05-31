import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import {
  getPersistedImageUrlError,
  normalizePersistedImageUrl,
} from "@/lib/image-url";
import { getRequestLoggerContext, logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function buildImageErrorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

export async function POST(req: NextRequest) {
  let step = "init";
  const requestContext = getRequestLoggerContext(req);

  try {
    step = "auth";
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    step = "read-form-data";
    const contentType = req.headers.get("content-type") ?? "";
    const isFormData = contentType.includes("multipart/form-data");
    const bodySource = isFormData ? await req.formData() : await req.json();
    const requestedBusinessIdRaw =
      bodySource.get?.("businessId") ??
      bodySource.get?.("business_id") ??
      (typeof bodySource === "object" && bodySource !== null
        ? ((bodySource as Record<string, unknown>).businessId ??
          (bodySource as Record<string, unknown>).business_id)
        : null);
    const requestedImageUrlRaw =
      bodySource.get?.("imageUrl") ??
      bodySource.get?.("url") ??
      (typeof bodySource === "object" && bodySource !== null
        ? ((bodySource as Record<string, unknown>).imageUrl ??
          (bodySource as Record<string, unknown>).url)
        : null);
    const requestedRemoveRaw =
      bodySource.get?.("remove") ??
      (typeof bodySource === "object" && bodySource !== null
        ? (bodySource as Record<string, unknown>).remove
        : null);
    const requestedBusinessId = Number(requestedBusinessIdRaw);
    const remove = String(requestedRemoveRaw ?? "0") === "1";
    const userId = authUser.user.id;
    const body: {
      businessId: number | null;
      imageUrl: string | null;
      remove: boolean;
    } = {
      businessId: Number.isFinite(requestedBusinessId)
        ? requestedBusinessId
        : null,
      imageUrl: normalizePersistedImageUrl(requestedImageUrlRaw),
      remove,
    };

    if (!body.businessId) {
      return buildImageErrorResponse("businessId inválido", 400);
    }

    step = "find-business-before-update";
    const business = await prisma.business.findUnique({
      where: { id: body.businessId },
      select: { id: true, name: true, logo_url: true },
    });

    logger.info(
      "business.photo_lookup",
      "Negocio consultado antes de guardar foto",
      {
        ...requestContext,
        businessId: body.businessId,
        exists: Boolean(business),
        userId,
      },
    );

    if (!business) {
      return buildImageErrorResponse("Negocio no encontrado", 404);
    }

    if (isFormData && bodySource.get("file") instanceof File) {
      return buildImageErrorResponse(
        "Sube la imagen primero en /api/upload/image y después guarda imageUrl.",
        400,
      );
    }

    if (remove) {
      step = "remove-photo-db-update";
      const updateResult = await prisma.business.updateMany({
        where: { id: business.id },
        data: { logo_url: null },
      });

      if (updateResult.count === 0) {
        return buildImageErrorResponse(
          `No se encontró el negocio con id ${business.id}`,
          404,
        );
      }

      const updatedBusiness = await prisma.business.findUnique({
        where: { id: business.id },
        select: { logo_url: true },
      });

      return NextResponse.json({
        success: true,
        url: null,
        imageUrl: null,
        logo_url: null,
        avatar_url: null,
        updatedBusiness,
      });
    }

    if (!body.imageUrl) {
      return buildImageErrorResponse("URL de imagen inválida", 400);
    }

    const imageUrlError = getPersistedImageUrlError(body.imageUrl);

    if (imageUrlError) {
      return buildImageErrorResponse(imageUrlError, 400);
    }

    step = "save-db-url";
    logger.info("business.photo_save", "Guardando logo del negocio", {
      ...requestContext,
      businessId: business.id,
      userId,
    });
    const updateResult = await prisma.business.updateMany({
      where: { id: business.id },
      data: { logo_url: body.imageUrl },
    });

    if (updateResult.count === 0) {
      return buildImageErrorResponse(
        `No se encontró el negocio con id ${business.id}`,
        404,
      );
    }

    const updatedBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      select: { logo_url: true },
    });

    if (!updatedBusiness) {
      return buildImageErrorResponse(
        "Campo de imagen no existe en Business",
        500,
      );
    }

    return NextResponse.json({
      success: true,
      url: updatedBusiness.logo_url,
      imageUrl: updatedBusiness.logo_url,
      logo_url: updatedBusiness.logo_url,
      avatar_url: updatedBusiness.logo_url,
      updatedBusiness,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error("business.photo_error", "Error guardando foto del negocio", {
      ...requestContext,
      step,
      error,
    });

    if (
      errorMessage.includes("logo_url") &&
      (errorMessage.includes("does not exist") ||
        errorMessage.includes("Unknown column"))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "La columna logo_url no existe en la base activa",
        },
        { status: 500 },
      );
    }

    if (
      errorMessage.includes("Table") &&
      errorMessage.includes("businesses") &&
      errorMessage.includes("doesn't exist")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "La tabla businesses no existe en la base activa",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo guardar la imagen del negocio",
        debug: process.env.NODE_ENV === "production" ? undefined : (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    );
  }
}
