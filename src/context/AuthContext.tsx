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
import {
  clearLegacyAuthStorage,
  fetchWithSession,
  getCurrentUser,
  installLegacySessionCompatibility,
  setClientSessionActive,
} from "@/lib/client-auth";

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
  loading: boolean;
  login: () => Promise<User | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USER_UPDATED_EVENT = "gogi-user-updated";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const syncUserFromSession = useCallback(async () => {
    setLoading(true);

    try {
      const currentUser = await getCurrentUser();

      if (!currentUser) {
        setClientSessionActive(false);
        localStorage.removeItem("user");
        setUser(null);
        return null;
      }

      const nextUser = {
        id: currentUser.id,
        name: currentUser.name ?? "",
        roles: Array.isArray(currentUser.roles) ? currentUser.roles : [],
        address: currentUser.address ?? null,
      };

      setClientSessionActive(true);
      localStorage.setItem("user", JSON.stringify(nextUser));
      setUser(nextUser);
      return nextUser;
    } catch (error) {
      console.error("Error sincronizando usuario:", error);
      setClientSessionActive(false);
      localStorage.removeItem("user");
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    void fetchWithSession("/api/auth/logout", {
      method: "POST",
    }).catch(() => null);
    clearLegacyAuthStorage();
    localStorage.removeItem("user");
    setClientSessionActive(false);
    setUser(null);
    setLoading(false);
    router.push("/login");
  }, [router]);

  useEffect(() => {
    installLegacySessionCompatibility();
    clearLegacyAuthStorage();
    void syncUserFromSession();
  }, [syncUserFromSession]);

  useEffect(() => {
    const handleUserUpdated = () => {
      void syncUserFromSession();
    };

    window.addEventListener(USER_UPDATED_EVENT, handleUserUpdated);

    return () => {
      window.removeEventListener(USER_UPDATED_EVENT, handleUserUpdated);
    };
  }, [syncUserFromSession]);

  const login = useCallback(async () => {
    clearLegacyAuthStorage();
    return syncUserFromSession();
  }, [syncUserFromSession]);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [loading, login, logout, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
