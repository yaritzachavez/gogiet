import { type NextRequest, NextResponse } from "next/server";

import { getCloudinaryConfigStatus } from "@/lib/cloudinary";
import { getRequestLoggerContext, logger } from "@/lib/logger";
import {
  requireAuthenticatedUser,
  requireBusinessAccess,
} from "@/lib/permissions";
import {
  type UploadImageKind,
  uploadImageToCloudinary,
  validateImageFile,
} from "@/lib/server-image-upload";

export const runtime = "nodejs";

function resolveKind(value: FormDataEntryValue | null): UploadImageKind {
  const candidate = String(value ?? "").trim();

  if (candidate === "business" || candidate === "product") {
    return candidate;
  }

  return "generic";
}

export async function POST(req: NextRequest) {
  const requestContext = getRequestLoggerContext(req);
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.ok) {
      return auth.response;
    }

    const cloudinaryStatus = getCloudinaryConfigStatus();

    if (!cloudinaryStatus.isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: "Faltan variables de Cloudinary",
        },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No llegó archivo" },
        { status: 400 },
      );
    }

    const fileError = validateImageFile(file);

    if (fileError) {
      return NextResponse.json(
        { success: false, error: fileError },
        { status: 400 },
      );
    }

    const kind = resolveKind(formData.get("kind"));
    const requestedBusinessId = Number(formData.get("businessId"));
    const businessId = Number.isFinite(requestedBusinessId)
      ? requestedBusinessId
      : null;

    if (businessId || kind === "business" || kind === "product") {
      if (!businessId) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Se requiere businessId para subir imágenes de negocio o producto.",
          },
          { status: 400 },
        );
      }

      const businessAccess = await requireBusinessAccess(
        req,
        businessId,
        "MANAGE_OWN_BUSINESS_PRODUCTS",
        "No puedes subir imágenes a un negocio que no te pertenece.",
      );

      if (!businessAccess.ok) {
        return businessAccess.response;
      }
    }

    const result = await uploadImageToCloudinary(file, {
      businessId,
      kind,
    });

    if (!result.secure_url) {
      return NextResponse.json(
        { success: false, error: "Cloudinary no devolvió URL segura" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      url: result.secure_url,
    });
  } catch (error) {
    logger.error("upload.image_error", "Error subiendo imagen", {
      ...requestContext,
      error,
    });

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo subir la imagen",
      },
      { status: 500 },
    );
  }
}
