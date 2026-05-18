import { type NextRequest, NextResponse } from "next/server";

import { cloudinary, getCloudinaryConfigStatus } from "@/lib/cloudinary";
import {
  requireAuthenticatedUser,
  requireOrderOwnership,
} from "@/lib/permissions";

export const runtime = "nodejs";

function fileToDataUri(file: File, buffer: Buffer) {
  const mimeType = file.type || "application/octet-stream";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function uploadPaymentProof(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const dataUri = fileToDataUri(file, buffer);

  return cloudinary.uploader.upload(dataUri, {
    folder: "gogi-eats/payment-proofs",
    resource_type: "auto",
  });
}

export async function POST(req: NextRequest) {
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
          error: `Falta configuración de Cloudinary: ${cloudinaryStatus.missing.join(", ")}`,
        },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const orderId = Number(formData.get("orderId"));

    if (Number.isFinite(orderId) && orderId > 0) {
      const orderAccess = await requireOrderOwnership(
        req,
        orderId,
        "No puedes adjuntar comprobantes a pedidos ajenos.",
      );
      if (!orderAccess.ok) {
        return orderAccess.response;
      }
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "No se recibió comprobante en el campo 'file'",
        },
        { status: 400 },
      );
    }

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";

    if (!isImage && !isPdf) {
      return NextResponse.json(
        {
          success: false,
          error: "El comprobante debe ser imagen o PDF válido",
        },
        { status: 400 },
      );
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "El comprobante no debe superar 8 MB" },
        { status: 400 },
      );
    }

    const result = await uploadPaymentProof(file);

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Cloudinary error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Error subiendo comprobante",
      },
      { status: 500 },
    );
  }
}
