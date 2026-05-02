"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface User {
  id: number;
  name: string;
  roles: string[];
  address?: {
    id: number;
    fullAddress: string;
    neighborhood: string;
    phone: string;
  } | null;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USER_UPDATED_EVENT = "gogi-user-updated";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  const syncUserFromStorage = useCallback(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    try {
      setUser(JSON.parse(storedUser) as User);
    } catch (error) {
      console.error("Error sincronizando usuario:", error);
    }
  }, []);

  const loadUserAddress = useCallback(async (token: string) => {
    try {
      const addressRes = await fetch("/api/account/address", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!addressRes.ok) {
        return null;
      }

      const addressData = await addressRes.json();
      return addressData.address ?? null;
    } catch (error) {
      console.error("Error cargando dirección:", error);
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("roles");
    if ("cookieStore" in window) {
      void window.cookieStore.delete("authToken");
    }
    setUser(null);
    router.push("/login");
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser) return;

    (async () => {
      try {
        const verifyRes = await fetch("/api/auth/verify", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!verifyRes.ok) {
          logout();
          return;
        }

        const rolesRes = await fetch("/api/auth/role", {
          headers: { Authorization: `Bearer ${token}` },
        });

        let roles: string[] = [];
        if (rolesRes.ok) {
          const data = (await rolesRes.json()) as {
            roles?: Array<{ name?: string }>;
          };
          roles = Array.isArray(data.roles)
            ? data.roles
                .map((role) => role?.name)
                .filter((role): role is string => Boolean(role))
            : [];
        }

        const parsedUser = JSON.parse(storedUser);
        const address = await loadUserAddress(token);
        const updatedUser = { ...parsedUser, roles, address };

        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
        localStorage.setItem("roles", JSON.stringify(roles));
      } catch (error) {
        console.error("Error verificando sesión:", error);
        logout();
      }
    })();
  }, [loadUserAddress, logout]);

  useEffect(() => {
    window.addEventListener(USER_UPDATED_EVENT, syncUserFromStorage);

    return () => {
      window.removeEventListener(USER_UPDATED_EVENT, syncUserFromStorage);
    };
  }, [syncUserFromStorage]);

  const login = useCallback(
    async (userData: User, token: string) => {
      localStorage.setItem("token", token);

      const address = await loadUserAddress(token);
      const userWithAddress = { ...userData, address };

      localStorage.setItem("user", JSON.stringify(userWithAddress));
      setUser(userWithAddress);

      // Obtener roles desde el backend
      try {
        const rolesRes = await fetch("/api/auth/role", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (rolesRes.ok) {
          const { roles } = await rolesRes.json();

          const userRoles = Array.isArray(roles)
            ? (roles as Array<{ name?: string }>)
                .map((role) => role?.name)
                .filter((role): role is string => Boolean(role))
            : ["user"];

          setUser((prev) => (prev ? { ...prev, roles: userRoles } : null));

          const storedUser = localStorage.getItem("user");
          if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            parsedUser.roles = userRoles;
            parsedUser.address = address;
            localStorage.setItem("user", JSON.stringify(parsedUser));
            setUser(parsedUser);
          }

          localStorage.setItem("roles", JSON.stringify(userRoles));
        }
      } catch (err) {
        console.error("Error al cargar roles:", err);
      }
    },
    [loadUserAddress],
  );

  const value = useMemo(() => ({ user, login, logout }), [login, logout, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
