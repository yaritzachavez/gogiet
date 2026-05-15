function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getPersistedImageUrlError(value: unknown) {
  const candidate = String(value ?? "").trim();

  if (!candidate) {
    return null;
  }

  if (candidate.startsWith("blob:")) {
    return "La imagen debe subirse primero a Cloudinary.";
  }

  if (candidate.startsWith("data:")) {
    return "La imagen es demasiado grande o no es una URL válida.";
  }

  if (!isHttpUrl(candidate)) {
    return "URL de imagen inválida.";
  }

  return null;
}

export function normalizePersistedImageUrl(value: unknown) {
  const candidate = String(value ?? "").trim();

  if (!candidate) {
    return null;
  }

  return candidate;
}

export function isPersistedImageUrl(value: unknown) {
  return (
    normalizePersistedImageUrl(value) !== null &&
    getPersistedImageUrlError(value) === null
  );
}
