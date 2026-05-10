const CLOUDINARY_HOST = "res.cloudinary.com";

type OptimizeCloudinaryImageOptions = {
  width?: number;
  height?: number;
  crop?: "fill" | "fit" | "scale" | "thumb";
};

function isCloudinaryUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.hostname === CLOUDINARY_HOST;
  } catch {
    return false;
  }
}

export function optimizeCloudinaryImage(
  value: string | null | undefined,
  options: OptimizeCloudinaryImageOptions = {},
) {
  const source = String(value ?? "").trim();

  if (!source || !isCloudinaryUrl(source)) {
    return source || null;
  }

  const { width, height, crop = "fill" } = options;
  const transformations = ["f_auto", "q_auto"];

  if (width) {
    transformations.push(`w_${Math.max(1, Math.round(width))}`);
  }

  if (height) {
    transformations.push(`h_${Math.max(1, Math.round(height))}`);
  }

  if (width || height) {
    transformations.push(`c_${crop}`);
  }

  if (source.includes("/upload/")) {
    return source.replace("/upload/", `/upload/${transformations.join(",")}/`);
  }

  return source;
}
