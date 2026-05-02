const TOKEN_STORAGE_KEYS = [
  "token",
  "authToken",
  "access_token",
  "gogi_token",
  "userToken",
  "accessToken",
] as const;

function getCookieValue(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.split("=").slice(1).join("="));
}

export function getClientAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of TOKEN_STORAGE_KEYS) {
    const localStorageValue = window.localStorage.getItem(key);

    if (localStorageValue?.trim()) {
      return localStorageValue.trim();
    }

    const sessionStorageValue = window.sessionStorage.getItem(key);

    if (sessionStorageValue?.trim()) {
      return sessionStorageValue.trim();
    }
  }

  const cookieToken = getCookieValue("authToken");

  return cookieToken?.trim() ? cookieToken.trim() : null;
}
