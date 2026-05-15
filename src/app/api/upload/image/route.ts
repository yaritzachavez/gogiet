import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { getCloudinaryConfigStatus } from "@/lib/cloudinary";
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
  try {
    const authUser = getAuthUser(req);

    if (!authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Token inválido o faltante" },
        { status: 401 },
      );
    }

    const cloudinaryStatus = getCloudinaryConfigStatus();

    if (!cloudinaryStatus.isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: "Faltan variables de Cloudinary",
          details: cloudinaryStatus.missing.join(", "),
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
    console.error("ERROR /api/upload/image:", error);

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo subir la imagen",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
