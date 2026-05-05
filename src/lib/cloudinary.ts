import { v2 as cloudinary } from "cloudinary";

export function getCloudinaryConfigStatus() {
  const missing = [
    !process.env.CLOUDINARY_CLOUD_NAME ? "CLOUDINARY_CLOUD_NAME" : null,
    !process.env.CLOUDINARY_API_KEY ? "CLOUDINARY_API_KEY" : null,
    !process.env.CLOUDINARY_API_SECRET ? "CLOUDINARY_API_SECRET" : null,
  ].filter(Boolean) as string[];

  return {
    isConfigured: missing.length === 0,
    missing,
  };
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };
