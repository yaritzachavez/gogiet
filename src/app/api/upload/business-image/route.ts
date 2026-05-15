import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { getCloudinaryConfigStatus } from "@/lib/cloudinary";
import {
  uploadImageToCloudinary,
  validateImageFile,
} from "@/lib/server-image-upload";

export const runtime = "nodejs";

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
          error: `Falta configuración de Cloudinary: ${cloudinaryStatus.missing.join(", ")}`,
        },
        { status: 500 },
      );
    }

    const formData = await req.formData();
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
        error: error instanceof Error ? error.message : "Error subiendo imagen",
      },
      { status: 500 },
    );
  }
}
