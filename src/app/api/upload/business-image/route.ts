import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { cloudinary, getCloudinaryConfigStatus } from "@/lib/cloudinary";

export const runtime = "nodejs";

function fileToDataUri(file: File, buffer: Buffer) {
  const mimeType = file.type || "application/octet-stream";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function uploadBusinessImage(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const dataUri = fileToDataUri(file, buffer);

  return cloudinary.uploader.upload(dataUri, {
    folder: "gogi-eats/business",
    resource_type: "image",
    transformation: [
      {
        width: 800,
        height: 800,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
      },
    ],
  });
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

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "El archivo debe ser una imagen válida" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "La imagen no debe superar 5 MB" },
        { status: 400 },
      );
    }

    const result = await uploadBusinessImage(file);

    return NextResponse.json({
      success: true,
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
