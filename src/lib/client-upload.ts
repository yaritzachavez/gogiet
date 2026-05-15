export type UploadImageKind = "business" | "generic" | "product";

type UploadImageAssetOptions = {
  businessId?: number | null;
  file: File;
  kind: UploadImageKind;
  token: string;
};

type UploadImageApiPayload = {
  details?: string;
  error?: string;
  imageUrl?: string;
  publicId?: string;
  success?: boolean;
  url?: string;
};

export async function uploadImageAsset({
  businessId,
  file,
  kind,
  token,
}: UploadImageAssetOptions) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);

  if (businessId && Number.isFinite(businessId)) {
    formData.append("businessId", String(businessId));
  }

  const response = await fetch("/api/upload/image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const payload = (await response
    .json()
    .catch(() => null)) as UploadImageApiPayload | null;

  if (!response.ok || payload?.success === false) {
    throw new Error(
      (typeof payload?.details === "string" && payload.details) ||
        (typeof payload?.error === "string" && payload.error) ||
        "No se pudo subir la imagen.",
    );
  }

  const imageUrl =
    typeof payload?.imageUrl === "string"
      ? payload.imageUrl
      : typeof payload?.url === "string"
        ? payload.url
        : null;

  if (!imageUrl) {
    throw new Error("Cloudinary no devolvió una URL válida.");
  }

  if (imageUrl.startsWith("blob:")) {
    throw new Error("La imagen debe subirse primero a Cloudinary.");
  }

  return {
    imageUrl,
    publicId: typeof payload?.publicId === "string" ? payload.publicId : null,
  };
}
