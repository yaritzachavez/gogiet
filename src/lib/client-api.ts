"use client";

import { Capacitor } from "@capacitor/core";

const REMOTE_APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.gogieats.shop";

function normalizePath(path: string) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getClientApiUrl(path: string) {
  const normalizedPath = normalizePath(path);

  if (typeof window === "undefined") {
    return normalizedPath;
  }

  if (Capacitor.isNativePlatform()) {
    return new URL(normalizedPath, REMOTE_APP_ORIGIN).toString();
  }

  return normalizedPath;
}
