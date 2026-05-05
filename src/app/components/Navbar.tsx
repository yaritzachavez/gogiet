"use client";

import { Bell, Menu, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { CART_UPDATED_EVENT, getStoredCartCount } from "@/lib/cart-storage";

const NOTIFICATIONS_POLL_INTERVAL_MS = 15_000;

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

function hasPanelAccess(roles: string[] | undefined) {
  const normalizedRoles = Array.isArray(roles)
    ? roles.map((role) => String(role))
    : [];

  return normalizedRoles.some((role) =>
    [
      "ADMIN_GENERAL",
      "REPARTIDOR",
      "ADMIN_NEGOCIO",
      "VENDEDOR",
      "ADMIN",
      "DELIVERY",
      "MANAGER",
      "OWNER",
      "admin_general",
      "repartidor",
      "business_admin",
      "business_staff",
    ].includes(role),
  );
}

function formatNotificationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function NotificationList({
  notifications,
  loading,
  error,
  onMarkOneAsRead,
  onMarkAllAsRead,
  markingAll,
}: {
  notifications: NotificationItem[];
  loading: boolean;
  error: string | null;
  onMarkOneAsRead: (notificationId: number) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  markingAll: boolean;
}) {
  return (
    <div className="w-full rounded-2xl border border-orange-200/70 bg-white text-slate-900 shadow-xl">
      <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Notificaciones</p>
          <p className="text-xs text-slate-500">
            Manteniéndose al día cada 15 segundos
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-auto px-2 py-1 text-xs text-orange-700 hover:bg-orange-50 hover:text-orange-800"
          disabled={markingAll || notifications.length === 0}
          onClick={() => {
            void onMarkAllAsRead();
          }}
        >
          {markingAll ? "Marcando..." : "Marcar todas como leídas"}
        </Button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            Cargando notificaciones...
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-sm text-red-600">{error}</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            Sin notificaciones
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              className={`flex w-full flex-col gap-1 border-b border-orange-50 px-4 py-3 text-left transition hover:bg-orange-50 ${
                notification.is_read ? "bg-white" : "bg-orange-50/70"
              }`}
              onClick={() => {
                void onMarkOneAsRead(notification.id);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">
                  {notification.title}
                </p>
                {!notification.is_read ? (
                  <span className="mt-1 inline-block size-2 rounded-full bg-red-500" />
                ) : null}
              </div>
              <p className="text-sm text-slate-600">{notification.message}</p>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {formatNotificationTime(notification.created_at)}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null,
  );
  const [markingAllNotifications, setMarkingAllNotifications] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncCartCount = () => {
      setCartCount(getStoredCartCount());
    };

    syncCartCount();
    window.addEventListener("storage", syncCartCount);
    window.addEventListener(CART_UPDATED_EVENT, syncCartCount);

    return () => {
      window.removeEventListener("storage", syncCartCount);
      window.removeEventListener(CART_UPDATED_EVENT, syncCartCount);
    };
  }, []);

  useEffect(() => {
    if (!mounted || !user || typeof window === "undefined") {
      if (!user) {
        setNotifications([]);
        setNotificationsError(null);
        setNotificationsOpen(false);
      }
      return;
    }

    let isActive = true;

    const loadNotifications = async (showLoading = false) => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        if (isActive) {
          setNotifications([]);
          setNotificationsError(
            "No se encontró tu sesión para notificaciones.",
          );
        }
        return;
      }

      if (showLoading && isActive) {
        setNotificationsLoading(true);
      }

      try {
        const res = await fetch("/api/notifications", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          notifications?: NotificationItem[];
        } | null;

        if (!res.ok || !data?.success) {
          throw new Error(
            data?.error || "No se pudieron cargar las notificaciones.",
          );
        }

        if (!isActive) {
          return;
        }

        setNotifications(
          Array.isArray(data.notifications) ? data.notifications : [],
        );
        setNotificationsError(null);
      } catch (error) {
        console.error("Error cargando notificaciones:", error);

        if (!isActive) {
          return;
        }

        setNotificationsError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las notificaciones.",
        );
      } finally {
        if (showLoading && isActive) {
          setNotificationsLoading(false);
        }
      }
    };

    void loadNotifications(true);
    const intervalId = window.setInterval(() => {
      void loadNotifications(false);
    }, NOTIFICATIONS_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [mounted, user]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleMarkNotificationAsRead = async (notificationId: number) => {
    const token =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem("token");

    if (!token) {
      setNotificationsError("No se encontró tu sesión para notificaciones.");
      return;
    }

    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "No se pudo marcar la notificación.");
      }

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: true }
            : notification,
        ),
      );
      setNotificationsError(null);
    } catch (error) {
      console.error("Error marcando notificación como leída:", error);
      setNotificationsError(
        error instanceof Error
          ? error.message
          : "No se pudo marcar la notificación.",
      );
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    const token =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem("token");

    if (!token) {
      setNotificationsError("No se encontró tu sesión para notificaciones.");
      return;
    }

    try {
      setMarkingAllNotifications(true);

      const res = await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error || "No se pudieron marcar las notificaciones.",
        );
      }

      setNotifications((current) =>
        current.map((notification) => ({ ...notification, is_read: true })),
      );
      setNotificationsError(null);
    } catch (error) {
      console.error("Error marcando todas las notificaciones:", error);
      setNotificationsError(
        error instanceof Error
          ? error.message
          : "No se pudieron marcar las notificaciones.",
      );
    } finally {
      setMarkingAllNotifications(false);
    }
  };

  if (!mounted) {
    return (
      <nav className="border-b border-orange-200/60 bg-orange-600 text-white shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between sm:h-20">
            <Link href="/" className="flex items-center gap-2">
              <span className="size-7 rounded-full border border-white/80 bg-white shadow-md sm:size-8" />
              <span className="hidden text-base font-extrabold tracking-wide text-white sm:inline">
                Gogi Eats
              </span>
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b border-orange-200/60 bg-orange-600 text-white shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between sm:h-20">
          <div className="flex flex-shrink-0 items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="relative h-7 w-7 overflow-hidden rounded-full border border-white/80 bg-white shadow-md sm:h-8 sm:w-8">
                <Image
                  src="/LOGO-NEW2.jpg"
                  alt="Gogi Eats"
                  fill
                  className="scale-[1.65] object-contain"
                  priority
                />
              </div>
              <span className="hidden text-base font-extrabold tracking-wide text-white sm:inline">
                Gogi Eats
              </span>
            </Link>
          </div>

          <div className="hidden items-center space-x-8 md:flex">
            <Link
              href="/"
              className="text-white/80 transition-colors hover:text-white"
            >
              Inicio
            </Link>
            {user && (
              <Link
                href="/pedidos"
                className="text-white/80 transition-colors hover:text-white"
              >
                Mis pedidos
              </Link>
            )}
            {user && hasPanelAccess(user.roles) && (
              <Link
                href="/pickdash"
                className="text-white/80 transition-colors hover:text-white"
              >
                Paneles
              </Link>
            )}
          </div>

          <div className="hidden items-center space-x-4 md:flex">
            {user ? (
              <>
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full border border-white/30 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => {
                      setNotificationsOpen((current) => !current);
                    }}
                    aria-label="Abrir notificaciones"
                    aria-expanded={notificationsOpen}
                  >
                    <Bell className="h-5 w-5" />
                    {unreadNotificationsCount > 0 ? (
                      <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unreadNotificationsCount > 99
                          ? "99+"
                          : unreadNotificationsCount}
                      </span>
                    ) : null}
                  </Button>

                  {notificationsOpen ? (
                    <div className="absolute right-0 top-14 z-50 w-[22rem] max-w-[90vw]">
                      <NotificationList
                        notifications={notifications}
                        loading={notificationsLoading}
                        error={notificationsError}
                        onMarkOneAsRead={handleMarkNotificationAsRead}
                        onMarkAllAsRead={handleMarkAllNotificationsAsRead}
                        markingAll={markingAllNotifications}
                      />
                    </div>
                  ) : null}
                </div>

                <Button
                  asChild
                  variant="ghost"
                  className="rounded-full border border-white/30 bg-white/10 text-white hover:bg-white/20"
                >
                  <Link href="/carrito" className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    <span>Carrito</span>
                    {cartCount > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
                        {cartCount}
                      </span>
                    ) : null}
                  </Link>
                </Button>
                <span className="text-sm text-white/70">Hola, {user.name}</span>
                <Button
                  variant="ghost"
                  onClick={logout}
                  className="text-white hover:bg-white/10"
                >
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  asChild
                  className="text-white hover:bg-white/10"
                >
                  <Link href="/auth?mode=login">Iniciar Sesión</Link>
                </Button>
                <Button
                  asChild
                  className="bg-white text-orange-700 hover:bg-orange-50"
                >
                  <Link href="/auth?mode=register">Registrarse</Link>
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 md:hidden">
            {user ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative text-white hover:bg-white/10"
                  onClick={() => {
                    setNotificationsOpen((current) => !current);
                  }}
                  aria-label="Abrir notificaciones"
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="h-5 w-5" />
                  {unreadNotificationsCount > 0 ? (
                    <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unreadNotificationsCount > 99
                        ? "99+"
                        : unreadNotificationsCount}
                    </span>
                  ) : null}
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                >
                  <Link href="/carrito" aria-label="Carrito de compras">
                    <span className="relative block">
                      <ShoppingCart className="h-5 w-5" />
                      {cartCount > 0 ? (
                        <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {cartCount}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </Button>
              </>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMobileMenu}
              className="text-white hover:bg-white/10"
              aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        {notificationsOpen && user ? (
          <div className="pb-4 md:hidden">
            <NotificationList
              notifications={notifications}
              loading={notificationsLoading}
              error={notificationsError}
              onMarkOneAsRead={handleMarkNotificationAsRead}
              onMarkAllAsRead={handleMarkAllNotificationsAsRead}
              markingAll={markingAllNotifications}
            />
          </div>
        ) : null}

        {mobileMenuOpen && (
          <div className="border-t border-white/10 pb-4 pt-4 md:hidden">
            <div className="mb-4 flex flex-col space-y-3">
              <Link
                href="/"
                className="px-2 py-2 text-white/80 transition-colors hover:text-white"
                onClick={closeMobileMenu}
              >
                Inicio
              </Link>
              {user && (
                <Link
                  href="/pedidos"
                  className="px-2 py-2 text-white/80 transition-colors hover:text-white"
                  onClick={closeMobileMenu}
                >
                  Mis pedidos
                </Link>
              )}
              {user && hasPanelAccess(user.roles) && (
                <Link
                  href="/pickdash"
                  className="px-2 py-2 text-white/80 transition-colors hover:text-white"
                  onClick={closeMobileMenu}
                >
                  Paneles
                </Link>
              )}
            </div>

            <div className="border-t border-white/10 pt-4">
              {user ? (
                <div className="flex flex-col space-y-2">
                  <div className="px-2 py-2 text-sm text-white/70">
                    Hola, {user.name}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      logout();
                      closeMobileMenu();
                    }}
                    className="w-full justify-start text-white hover:bg-white/10"
                  >
                    Cerrar sesión
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col space-y-2">
                  <Button
                    variant="ghost"
                    asChild
                    className="w-full justify-start text-white hover:bg-white/10"
                  >
                    <Link href="/auth?mode=login" onClick={closeMobileMenu}>
                      Iniciar Sesión
                    </Link>
                  </Button>
                  <Button
                    asChild
                    className="w-full bg-white text-orange-700 hover:bg-orange-50"
                  >
                    <Link href="/auth?mode=register" onClick={closeMobileMenu}>
                      Registrarse
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
