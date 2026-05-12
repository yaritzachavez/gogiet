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
    const userId = authUser.user.id;
    const body = {
      businessId: Number.isFinite(requestedBusinessId)
        ? requestedBusinessId
        : null,
      remove,
      hasFile: formData.get("file") instanceof File,
    };

    console.log("save-db-url userId:", userId);
    console.log("BODY save-db-url:", body);
    console.log("businessId recibido:", body.businessId);
    console.log(
      "business_id recibido:",
      Number.isFinite(requestedBusinessId) ? requestedBusinessId : null,
    );

    step = "find-user-business-owners";
    const ownerRelations = await prisma.business_owners.findMany({
      where: {
        user_id: userId,
      },
      select: {
        business_id: true,
      },
      orderBy: {
        assigned_at: "asc",
      },
    });

    const uniqueBusinessIds = Array.from(
      new Set(
        ownerRelations
          .map((relation) => Number(relation.business_id))
          .filter(
            (businessId) => Number.isFinite(businessId) && businessId > 0,
          ),
      ),
    );

    step = "find-valid-businesses";
    const validBusinesses = uniqueBusinessIds.length
      ? await prisma.business.findMany({
          where: {
            id: {
              in: uniqueBusinessIds,
            },
          },
          select: {
            id: true,
            name: true,
            logo_url: true,
          },
          orderBy: {
            id: "asc",
          },
        })
      : [];

    const validBusinessIds = validBusinesses.map((business) =>
      Number(business.id),
    );
    const validBusinessId =
      Number.isFinite(requestedBusinessId) &&
      requestedBusinessId > 0 &&
      validBusinessIds.includes(requestedBusinessId)
        ? requestedBusinessId
        : (validBusinessIds[0] ?? null);

    console.log("business válido encontrado:", validBusinessId);

    const orphanedBusinessIds = uniqueBusinessIds.filter(
      (businessId) => !validBusinessIds.includes(businessId),
    );

    if (orphanedBusinessIds.length > 0) {
      console.warn(
        "[business-photo] Ignorando relaciones rotas en business_owners",
        {
          userId,
          orphanedBusinessIds,
        },
      );
    }

    if (!validBusinessId) {
      return NextResponse.json(
        {
          success: false,
          error: "No tienes un negocio válido asignado",
        },
        { status: 404 },
      );
    }

    step = "find-business-before-update";
    const business = await prisma.business.findUnique({
      where: { id: validBusinessId },
      select: { id: true, name: true, logo_url: true },
    });

    console.info("[business-photo] business lookup", {
      businessId: validBusinessId,
      exists: Boolean(business),
      businessName: business?.name ?? null,
    });

    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error: "Negocio no encontrado o no asignado correctamente",
        },
        { status: 404 },
      );
    }

    if (remove) {
      step = "remove-photo-db-update";
      const updateResult = await prisma.business.updateMany({
        where: { id: business.id },
        data: { logo_url: null },
      });

      if (updateResult.count === 0) {
        return NextResponse.json(
          {
            success: false,
            error: `No se encontró el negocio con id ${business.id}`,
          },
          { status: 404 },
        );
      }

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
    const uploadResult = await uploadToCloudinary(buffer, business.id);

    if (
      !uploadResult.secure_url ||
      uploadResult.secure_url.startsWith("blob:")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "La imagen debe subirse primero a Cloudinary",
        },
        { status: 400 },
      );
    }

    if (!isHttpUrl(uploadResult.secure_url)) {
      return NextResponse.json(
        {
          success: false,
          error: "No se pudo guardar la imagen del negocio",
        },
        { status: 400 },
      );
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
      return NextResponse.json(
        {
          success: false,
          error: `No se encontró el negocio con id ${business.id}`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      url: uploadResult.secure_url,
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      logo_url: uploadResult.secure_url,
      avatar_url: uploadResult.secure_url,
    });
  } catch (error) {
    console.error("[business-photo] Error subiendo foto del negocio", {
      step,
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: "No se pudo guardar la URL del negocio",
      },
      { status: 500 },
    );
  }
}
