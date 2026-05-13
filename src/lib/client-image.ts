export type CompressImageOptions = {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  outputType?: "image/jpeg" | "image/png" | "image/webp";
};

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo procesar la imagen seleccionada."));
    };

    image.src = objectUrl;
  });
}

function getTargetDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function compressImageFile(
  file: File,
  options: CompressImageOptions,
) {
  if (typeof window === "undefined") {
    return file;
  }

  const image = await loadImageFromFile(file);
  const { maxWidth, maxHeight, quality = 0.82 } = options;
  const outputType =
    options.outputType ??
    (file.type === "image/png" ? "image/png" : "image/jpeg");
  const dimensions = getTargetDimensions(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    maxWidth,
    maxHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext("2d");

  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, quality);
  });

  if (!blob) {
    return file;
  }

  const candidate = new File([blob], file.name, {
    type: blob.type,
    lastModified: Date.now(),
  });

  return candidate.size <= file.size ? candidate : file;
}
