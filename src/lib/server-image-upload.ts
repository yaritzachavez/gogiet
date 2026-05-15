import { cloudinary } from "@/lib/cloudinary";

export type UploadImageKind = "business" | "generic" | "product";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function fileToDataUri(file: File, buffer: Buffer) {
  const mimeType = file.type || "application/octet-stream";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function getImageTransformation(kind: UploadImageKind) {
  if (kind === "business") {
    return {
      width: 800,
      height: 800,
      crop: "limit",
      quality: "auto:good",
      fetch_format: "auto",
    };
  }

  return {
    width: 1200,
    height: 1200,
    crop: "limit",
    quality: "auto:good",
    fetch_format: "auto",
  };
}

function buildFolder(kind: UploadImageKind, businessId?: number | null) {
  if (kind === "business" && businessId) {
    return `gogi-eats/business/${businessId}`;
  }

  if (kind === "business") {
    return "gogi-eats/business";
  }

  if (kind === "product") {
    return "gogi-eats/products";
  }

  return "gogi-eats/uploads";
}

export function validateImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Solo se permiten imágenes JPG, JPEG, PNG o WEBP.";
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "La imagen no debe superar 5 MB.";
  }

  return null;
}

export async function uploadImageToCloudinary(
  file: File,
  options: {
    businessId?: number | null;
    kind?: UploadImageKind;
  } = {},
) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const dataUri = fileToDataUri(file, buffer);
  const kind = options.kind ?? "generic";

  return cloudinary.uploader.upload(dataUri, {
    folder: buildFolder(kind, options.businessId),
    resource_type: "image",
    transformation: [getImageTransformation(kind)],
  });
}
