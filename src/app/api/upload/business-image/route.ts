import { type NextRequest, NextResponse } from "next/server";

import { getSafeErrorMessage } from "@/lib/api-error";
import { getCloudinaryConfigStatus } from "@/lib/cloudinary";
import { requireSellerAccess } from "@/lib/permissions";
import {
  uploadImageToCloudinary,
  validateImageFile,
} from "@/lib/server-image-upload";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const requestedBusinessId = Number(formData.get("businessId"));
    const businessId = Number.isFinite(requestedBusinessId)
      ? requestedBusinessId
      : null;
    const sellerAccess = await requireSellerAccess(
      req,
      businessId,
      "No puedes subir imágenes para un negocio que no administras.",
    );
    if (!sellerAccess.ok) {
      return sellerAccess.response;
    }

    const cloudinaryStatus = getCloudinaryConfigStatus();

    if (!cloudinaryStatus.isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: `Falta configuración de Cloudinary: ${cloudinaryStatus.missing.join(", ")}`,
        },
        { status: 500 },
      );
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "No se recibió imagen en el campo 'file'",
        },
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

    const result = await uploadImageToCloudinary(file, {
      businessId,
      kind: "business",
    });

    return NextResponse.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      url: result.secure_url,
    });
  } catch (error) {
    console.error("Cloudinary error:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Error subiendo imagen"),
      },
      { status: 500 },
    );
  }
}
