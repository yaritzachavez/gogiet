"use client";

import { getClientApiUrl } from "@/lib/client-api";

export const LEGACY_AUTH_STORAGE_KEYS = [
  "token",
  "authToken",
  "access_token",
  "gogi_token",
  "userToken",
  "accessToken",
  "roles",
  "user_roles",
] as const;
const SESSION_MARKER = "__cookie_session__";

declare global {
  interface Window {
    __gogiAuthSessionActive?: boolean;
    __gogiLegacySessionShimInstalled?: boolean;
  }
}

export function clearLegacyAuthStorage() {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of LEGACY_AUTH_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
}

export function getClientAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__gogiAuthSessionActive ? SESSION_MARKER : null;
}

function isLegacyAuthStorageKey(key: string) {
  return LEGACY_AUTH_STORAGE_KEYS.includes(
    key as (typeof LEGACY_AUTH_STORAGE_KEYS)[number],
  );
}

function normalizeHeaders(headers?: HeadersInit) {
  const normalized = new Headers(headers);
  normalized.delete("Authorization");
  return normalized;
}

function shouldUseSessionCookies(target: string | URL | Request) {
  if (typeof window === "undefined") {
    return false;
  }

  const requestUrl =
    typeof target === "string"
      ? target
      : target instanceof URL
        ? target.toString()
        : target.url;

  if (!requestUrl) {
    return false;
  }

  if (requestUrl.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(requestUrl, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function setClientSessionActive(active: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.__gogiAuthSessionActive = active;
}

export function installLegacySessionCompatibility() {
  if (
    typeof window === "undefined" ||
    window.__gogiLegacySessionShimInstalled
  ) {
    return;
  }

  if (window.__gogiAuthSessionActive === undefined) {
    window.__gogiAuthSessionActive = true;
  }

  window.__gogiLegacySessionShimInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    if (!shouldUseSessionCookies(input)) {
      return originalFetch(input, init);
    }

    return originalFetch(input, {
      ...init,
      credentials: "include",
      headers: normalizeHeaders(init?.headers),
    });
  }) as typeof window.fetch;

  const patchStorage = (storage: Storage) => {
    const originalGetItem = storage.getItem.bind(storage);
    const originalSetItem = storage.setItem.bind(storage);
    const originalRemoveItem = storage.removeItem.bind(storage);

    storage.getItem = ((key: string) => {
      if (!isLegacyAuthStorageKey(key)) {
        return originalGetItem(key);
      }

      const value = originalGetItem(key);
      if (value?.trim()) {
        originalRemoveItem(key);
      }

      return window.__gogiAuthSessionActive ? SESSION_MARKER : null;
    }) as typeof storage.getItem;

    storage.setItem = ((key: string, value: string) => {
      if (!isLegacyAuthStorageKey(key)) {
        originalSetItem(key, value);
        return;
      }

      originalRemoveItem(key);
    }) as typeof storage.setItem;

    storage.removeItem = ((key: string) => {
      originalRemoveItem(key);
    }) as typeof storage.removeItem;
  };

  patchStorage(window.localStorage);
  patchStorage(window.sessionStorage);
}

export async function fetchWithSession(
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) {
  const target = typeof input === "string" ? getClientApiUrl(input) : input;

  return fetch(target, {
    ...init,
    credentials: "include",
    headers: normalizeHeaders(init?.headers),
  });
}

export async function getCurrentUser() {
  const response = await fetchWithSession("/api/auth/me", {
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    user?: {
      id: number;
      name?: string;
      email?: string | null;
      roles?: string[];
      address?: {
        id: number;
        fullAddress: string;
        neighborhood: string;
        phone: string;
      } | null;
    };
  } | null;

  if (!response.ok || !payload?.success || !payload.user) {
    return null;
  }

  return payload.user;
}
