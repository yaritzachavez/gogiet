import { type NextRequest, NextResponse } from "next/server";

import { getAuthUser } from "@/lib/admin-security";
import { cloudinary, getCloudinaryConfigStatus } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildImageErrorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

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
          error: "Faltan variables de Cloudinary",
          details: cloudinaryConfig.missing.join(", "),
        },
        { status: 500 },
      );
    }

    step = "read-form-data";
    const formData = await req.formData();
    const requestedBusinessIdRaw =
      formData.get("businessId") ?? formData.get("business_id");
    const requestedBusinessId = Number(requestedBusinessIdRaw);
    const remove = String(formData.get("remove") ?? "0") === "1";
    const userId = authUser.user.id;
    const body: {
      businessId: number | null;
      remove: boolean;
      hasFile: boolean;
      imageUrl: string | null;
    } = {
      businessId: Number.isFinite(requestedBusinessId)
        ? requestedBusinessId
        : null,
      remove,
      hasFile: formData.get("file") instanceof File,
      imageUrl: null,
    };

    console.log("save-db-url userId:", userId);
    console.log("BODY save-db-url:", body);
    console.log("businessId recibido:", body.businessId);
    console.log(
      "business_id recibido:",
      Number.isFinite(requestedBusinessId) ? requestedBusinessId : null,
    );

    if (!body.businessId) {
      return buildImageErrorResponse("businessId inválido", 400);
    }

    step = "find-business-before-update";
    const business = await prisma.business.findUnique({
      where: { id: body.businessId },
      select: { id: true, name: true, logo_url: true },
    });

    console.info("[business-photo] business lookup", {
      businessId: body.businessId,
      exists: Boolean(business),
      businessName: business?.name ?? null,
      userId,
    });

    if (!business) {
      return buildImageErrorResponse("Negocio no encontrado", 404);
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

    step = "extract-file";
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return buildImageErrorResponse("No llegó archivo", 400);
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
    const uploadResult = await uploadToCloudinary(buffer, business.id);
    body.imageUrl = uploadResult.secure_url ?? null;

    console.log("BODY recibido imagen negocio:", body);
    console.log("businessId:", business.id);
    console.log("imageUrl:", body.imageUrl);
    console.log("Respuesta Cloudinary:", uploadResult);

    if (!uploadResult.secure_url) {
      return buildImageErrorResponse("Cloudinary no devolvió URL segura", 500);
    }

    if (uploadResult.secure_url.startsWith("blob:")) {
      return buildImageErrorResponse(
        "La imagen debe subirse primero a Cloudinary",
        400,
      );
    }

    if (!isHttpUrl(uploadResult.secure_url)) {
      return buildImageErrorResponse("URL de imagen inválida", 400);
    }

    step = "save-db-url";
    console.info("[business-photo] saving business logo", {
      businessId: business.id,
      businessName: business.name,
    });
    const updateResult = await prisma.business.updateMany({
      where: { id: business.id },
      data: { logo_url: uploadResult.secure_url },
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
      url: uploadResult.secure_url,
      imageUrl: updatedBusiness.logo_url,
      publicId: uploadResult.public_id,
      logo_url: updatedBusiness.logo_url,
      avatar_url: updatedBusiness.logo_url,
      updatedBusiness,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("ERROR business/photo:", {
      step,
      error,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
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
          details: errorMessage,
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
          details: errorMessage,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo guardar la imagen del negocio",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
