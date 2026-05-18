"use client";

import { Bell, Menu, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { CART_UPDATED_EVENT, getStoredCartCount } from "@/lib/cart-storage";
import { fetchWithSession } from "@/lib/client-auth";

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
    <div className="w-full rounded-[24px] border border-white/10 bg-[#121212]/96 text-[#f5f5f5] shadow-[0_24px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[#f5f5f5]">Notificaciones</p>
          <p className="text-xs text-[#8f8f8f]">
            Manteniéndose al día cada 15 segundos
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-auto px-2 py-1 text-xs text-orange-300 hover:bg-orange-500/10 hover:text-orange-200"
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
          <div className="px-4 py-6 text-sm text-[#8f8f8f]">
            Cargando notificaciones...
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-sm text-red-600">{error}</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[#8f8f8f]">
            Sin notificaciones
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              className={`flex w-full flex-col gap-1 border-b border-white/6 px-4 py-3 text-left transition hover:bg-white/5 ${
                notification.is_read ? "bg-transparent" : "bg-orange-500/8"
              }`}
              onClick={() => {
                void onMarkOneAsRead(notification.id);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-[#f5f5f5]">
                  {notification.title}
                </p>
                {!notification.is_read ? (
                  <span className="mt-1 inline-block size-2 rounded-full bg-red-500" />
                ) : null}
              </div>
              <p className="text-sm text-[#b3b3b3]">{notification.message}</p>
              <p className="text-xs uppercase tracking-wide text-[#7f7f7f]">
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
  const [unreadCount, setUnreadCount] = useState(0);
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
    if (typeof document === "undefined") return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousTouchAction = body.style.touchAction;

    if (mobileMenuOpen) {
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.touchAction = previousTouchAction;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mounted || !user || typeof window === "undefined") {
      if (!user) {
        setNotifications([]);
        setUnreadCount(0);
        setNotificationsError(null);
        setNotificationsOpen(false);
      }
      return;
    }

    let isActive = true;

    const loadNotifications = async (showLoading = false) => {
      if (showLoading && isActive) {
        setNotificationsLoading(true);
      }

      try {
        const res = await fetchWithSession("/api/notifications");

        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          notifications?: NotificationItem[];
        } | null;

        if (!res.ok || !data?.success) {
          console.warn(
            "No se pudieron cargar las notificaciones",
            data?.error ?? {
              status: res.status,
              statusText: res.statusText,
            },
          );

          if (!isActive) {
            return;
          }

          setNotifications([]);
          setUnreadCount(0);
          setNotificationsError(null);
          return;
        }

        if (!isActive) {
          return;
        }

        const safeNotifications = Array.isArray(data.notifications)
          ? data.notifications
          : [];

        setNotifications(safeNotifications);
        setUnreadCount(
          safeNotifications.filter((notification) => !notification.is_read)
            .length,
        );
        setNotificationsError(null);
      } catch (error) {
        console.warn("No se pudieron cargar las notificaciones", error);

        if (!isActive) {
          return;
        }

        setNotifications([]);
        setUnreadCount(0);
        setNotificationsError(null);
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

  const unreadNotificationsCount = useMemo(() => unreadCount, [unreadCount]);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleMarkNotificationAsRead = async (notificationId: number) => {
    try {
      const res = await fetchWithSession(
        `/api/notifications/${notificationId}/read`,
        {
          method: "PATCH",
        },
      );

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
      setUnreadCount((current) => Math.max(0, current - 1));
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
    try {
      setMarkingAllNotifications(true);

      const res = await fetchWithSession("/api/notifications/read-all", {
        method: "PATCH",
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
      setUnreadCount(0);
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
      <nav className="sticky top-0 z-40 border-b border-white/8 bg-[#0b0b0b]/84 text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="app-shell">
          <div className="flex h-14 items-center justify-between gap-3 sm:h-[4.75rem]">
            <Link
              href="/"
              className="group flex min-w-0 items-center gap-2 rounded-2xl transition-all duration-300 sm:gap-3"
            >
              <div className="relative h-9 w-9 overflow-hidden rounded-full bg-white shadow-[0_10px_24px_rgba(255,107,0,0.10)] ring-1 ring-white/12 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_30px_rgba(255,107,0,0.16)] sm:h-12 sm:w-12">
                <Image
                  src="/LOGO-NEW2.jpg"
                  alt="Gogi Eats"
                  fill
                  sizes="(max-width: 768px) 120px, 160px"
                  className="scale-[1.6] object-contain"
                  priority
                />
              </div>
              <span className="hidden truncate text-base font-extrabold tracking-[0.12em] text-white sm:inline">
                Gogi Eats
              </span>
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-white/8 bg-[#0b0b0b]/84 text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl">
      <div className="app-shell">
        <div className="flex h-14 items-center justify-between gap-2 sm:h-[4.75rem] sm:gap-3">
          <div className="flex min-w-0 flex-shrink-0 items-center">
            <Link
              href="/"
              className="group flex min-w-0 items-center gap-2 rounded-2xl transition-all duration-300 sm:gap-3"
            >
              <div className="relative h-9 w-9 overflow-hidden rounded-full bg-white shadow-[0_10px_24px_rgba(255,107,0,0.10)] ring-1 ring-white/12 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_34px_rgba(255,107,0,0.16)] sm:h-12 sm:w-12">
                <Image
                  src="/LOGO-NEW2.jpg"
                  alt="Gogi Eats"
                  fill
                  sizes="(max-width: 768px) 120px, 160px"
                  className="scale-[1.6] object-contain"
                  priority
                />
              </div>
              <span className="hidden truncate text-base font-extrabold tracking-[0.12em] text-white sm:inline">
                Gogi Eats
              </span>
            </Link>
          </div>

          <div className="hidden min-w-0 items-center space-x-5 xl:flex">
            <Link
              href="/"
              className="text-sm font-semibold text-[#b3b3b3] transition-colors hover:text-white"
            >
              Inicio
            </Link>
            {user && (
              <Link
                href="/pedidos"
                className="text-sm font-semibold text-[#b3b3b3] transition-colors hover:text-white"
              >
                Mis pedidos
              </Link>
            )}
            {user && hasPanelAccess(user.roles) && (
              <Link
                href="/pickdash"
                className="text-sm font-semibold text-[#b3b3b3] transition-colors hover:text-white"
              >
                Paneles
              </Link>
            )}
          </div>

          <div className="hidden min-w-0 items-center space-x-3 xl:flex">
            {user ? (
              <>
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
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
                    <div className="absolute right-0 top-14 z-50 w-[min(24rem,calc(100vw-1.5rem))]">
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
                  className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
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
                <span className="max-w-[10rem] truncate text-sm text-[#b3b3b3]">
                  Hola, {user.name}
                </span>
                <Button
                  variant="ghost"
                  onClick={logout}
                  className="text-[#b3b3b3] hover:bg-white/6 hover:text-white"
                >
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  asChild
                  className="text-[#b3b3b3] hover:bg-white/6 hover:text-white"
                >
                  <Link href="/auth?mode=login">Iniciar Sesión</Link>
                </Button>
                <Button asChild className="rounded-full px-5">
                  <Link href="/auth?mode=register">Registrarse</Link>
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 xl:hidden">
            {user ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
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
                  className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
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
              className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
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
          <div className="pb-4 xl:hidden">
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
          <div className="safe-bottom fixed inset-0 top-16 z-[90] h-[calc(100dvh-4rem)] xl:hidden sm:top-[4.75rem] sm:h-[calc(100dvh-4.75rem)]">
            <button
              type="button"
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              aria-label="Cerrar menú móvil"
              onClick={closeMobileMenu}
            />
            <div className="relative ml-auto flex h-full w-full max-w-[min(24rem,100vw)] flex-col overflow-y-auto border-l border-white/10 bg-[#121212]/96 px-4 py-5 shadow-2xl shadow-black/50 touch-scroll sm:px-5">
              <div className="mb-5 rounded-[24px] border border-white/10 bg-white/4 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                  Navegación
                </p>
                <p className="mt-2 text-sm text-white/65">
                  Accesos rápidos y paneles listos para móvil.
                </p>
              </div>

              <div className="grid gap-2">
                <Link
                  href="/"
                  className="rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[#e4e4e4] transition hover:border-white/10 hover:bg-white/6 hover:text-white"
                  onClick={closeMobileMenu}
                >
                  Inicio
                </Link>
                {user ? (
                  <Link
                    href="/pedidos"
                    className="rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[#e4e4e4] transition hover:border-white/10 hover:bg-white/6 hover:text-white"
                    onClick={closeMobileMenu}
                  >
                    Mis pedidos
                  </Link>
                ) : null}
                {user && hasPanelAccess(user.roles) ? (
                  <Link
                    href="/pickdash"
                    className="rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[#e4e4e4] transition hover:border-white/10 hover:bg-white/6 hover:text-white"
                    onClick={closeMobileMenu}
                  >
                    Paneles
                  </Link>
                ) : null}
                <Link
                  href="/shop"
                  className="rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[#e4e4e4] transition hover:border-white/10 hover:bg-white/6 hover:text-white"
                  onClick={closeMobileMenu}
                >
                  Explorar tiendas
                </Link>
                <Link
                  href="/profile"
                  className="rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[#e4e4e4] transition hover:border-white/10 hover:bg-white/6 hover:text-white"
                  onClick={closeMobileMenu}
                >
                  Mi perfil
                </Link>
              </div>

              <div className="mt-auto border-t border-white/10 pt-4">
                {user ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white/70">
                      Hola, {user.name}
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        logout();
                        closeMobileMenu();
                      }}
                      className="w-full justify-start rounded-2xl border border-white/10 bg-white/4 text-white hover:bg-white/10"
                    >
                      Cerrar sesión
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button
                      variant="ghost"
                      asChild
                      className="w-full justify-center rounded-2xl border border-white/10 bg-white/4 text-white hover:bg-white/10"
                    >
                      <Link href="/auth?mode=login" onClick={closeMobileMenu}>
                        Iniciar Sesión
                      </Link>
                    </Button>
                    <Button asChild className="w-full rounded-2xl">
                      <Link
                        href="/auth?mode=register"
                        onClick={closeMobileMenu}
                      >
                        Registrarse
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
