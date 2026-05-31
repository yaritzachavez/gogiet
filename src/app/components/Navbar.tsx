"use client";

import { Bell, Menu, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  isDeliveryRoute = false,
}: {
  notifications: NotificationItem[];
  loading: boolean;
  error: string | null;
  onMarkOneAsRead: (notificationId: number) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  markingAll: boolean;
  isDeliveryRoute?: boolean;
}) {
  const surfaceClassName = isDeliveryRoute
    ? "w-full rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] text-[#222222] shadow-[0_8px_30px_rgba(180,140,90,0.08)]"
    : "w-full rounded-[24px] border border-white/10 bg-[#121212]/96 text-[#f5f5f5] shadow-[0_24px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl";
  const headerClassName = isDeliveryRoute
    ? "flex items-center justify-between border-b border-[#E7D8C7] px-4 py-3"
    : "flex items-center justify-between border-b border-white/8 px-4 py-3";
  const titleClassName = isDeliveryRoute
    ? "text-sm font-semibold text-[#222222]"
    : "text-sm font-semibold text-[#f5f5f5]";
  const mutedClassName = isDeliveryRoute
    ? "text-xs text-[#6F5D4C]"
    : "text-xs text-[#8f8f8f]";
  const actionClassName = isDeliveryRoute
    ? "h-auto px-2 py-1 text-xs text-[#e98a4a] hover:bg-[#fff5ec] hover:text-[#d97836]"
    : "h-auto px-2 py-1 text-xs text-orange-300 hover:bg-orange-500/10 hover:text-orange-200";
  const itemClassName = (isRead: boolean) =>
    isDeliveryRoute
      ? `flex w-full flex-col gap-1 border-b border-[#E7D8C7] px-4 py-3 text-left transition hover:bg-[#fff5ec] ${
          isRead ? "bg-transparent" : "bg-[#f6ebdd]"
        }`
      : `flex w-full flex-col gap-1 border-b border-white/6 px-4 py-3 text-left transition hover:bg-white/5 ${
          isRead ? "bg-transparent" : "bg-orange-500/8"
        }`;
  const itemTitleClassName = isDeliveryRoute
    ? "text-sm font-semibold text-[#222222]"
    : "text-sm font-semibold text-[#f5f5f5]";
  const itemMessageClassName = isDeliveryRoute
    ? "text-sm text-[#6F5D4C]"
    : "text-sm text-[#b3b3b3]";
  const itemTimeClassName = isDeliveryRoute
    ? "text-xs uppercase tracking-wide text-[#8d755b]"
    : "text-xs uppercase tracking-wide text-[#7f7f7f]";

  return (
    <div className={surfaceClassName}>
      <div className={headerClassName}>
        <div>
          <p className={titleClassName}>Notificaciones</p>
          <p className={mutedClassName}>
            Manteniéndose al día cada 15 segundos
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className={actionClassName}
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
          <div className="px-4 py-6 text-sm text-[#6F5D4C]">
            Cargando notificaciones...
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-sm text-red-600">{error}</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[#6F5D4C]">
            Sin notificaciones
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              className={itemClassName(notification.is_read)}
              onClick={() => {
                void onMarkOneAsRead(notification.id);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className={itemTitleClassName}>{notification.title}</p>
                {!notification.is_read ? (
                  <span className="mt-1 inline-block size-2 rounded-full bg-red-500" />
                ) : null}
              </div>
              <p className={itemMessageClassName}>{notification.message}</p>
              <p className={itemTimeClassName}>
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
  const pathname = usePathname();
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
  const isDeliveryRoute = pathname?.startsWith("/delivery");
  const navClassName = isDeliveryRoute
    ? "sticky top-0 z-40 border-b border-[#E7D8C7] bg-[#FFF9F2]/95 text-[#222222] shadow-[0_8px_30px_rgba(180,140,90,0.08)] backdrop-blur-xl"
    : "sticky top-0 z-40 border-b border-white/8 bg-[#0b0b0b]/84 text-white shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl";
  const logoTextClassName = isDeliveryRoute
    ? "hidden truncate text-base font-extrabold tracking-[0.12em] text-[#222222] sm:inline"
    : "hidden truncate text-base font-extrabold tracking-[0.12em] text-white sm:inline";
  const navLinkClassName = isDeliveryRoute
    ? "text-sm font-semibold text-[#6F5D4C] transition-colors hover:text-[#222222]"
    : "text-sm font-semibold text-[#b3b3b3] transition-colors hover:text-white";
  const navIconButtonClassName = isDeliveryRoute
    ? "relative rounded-full border border-[#E7D8C7] bg-[#F6EBDD] text-[#222222] hover:bg-[#fff5ec]"
    : "relative rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10";
  const navCartButtonClassName = isDeliveryRoute
    ? "rounded-full border border-[#E7D8C7] bg-[#F6EBDD] text-[#222222] hover:bg-[#fff5ec]"
    : "rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10";
  const navMutedTextClassName = isDeliveryRoute
    ? "max-w-[10rem] truncate text-sm text-[#6F5D4C]"
    : "max-w-[10rem] truncate text-sm text-[#b3b3b3]";
  const navGhostTextClassName = isDeliveryRoute
    ? "text-[#6F5D4C] hover:bg-[#fff5ec] hover:text-[#222222]"
    : "text-[#b3b3b3] hover:bg-white/6 hover:text-white";
  const mobileMenuLinkClassName = isDeliveryRoute
    ? "rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[#222222] transition hover:border-[#E7D8C7] hover:bg-[#fff5ec] hover:text-[#222222]"
    : "rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[#e4e4e4] transition hover:border-white/10 hover:bg-white/6 hover:text-white";
  const mobileMenuFooterClassName = isDeliveryRoute
    ? "mt-auto border-t border-[#E7D8C7] pt-4"
    : "mt-auto border-t border-white/10 pt-4";
  const mobileUserBoxClassName = isDeliveryRoute
    ? "rounded-2xl border border-[#E7D8C7] bg-[#F6F0E7] px-4 py-3 text-sm text-[#6F5D4C]"
    : "rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white/70";
  const mobileActionButtonClassName = isDeliveryRoute
    ? "w-full justify-start rounded-2xl border border-[#E7D8C7] bg-[#F6F0E7] text-[#222222] hover:bg-[#fff5ec]"
    : "w-full justify-start rounded-2xl border border-white/10 bg-white/4 text-white hover:bg-white/10";
  const mobileAuthButtonClassName = isDeliveryRoute
    ? "w-full justify-center rounded-2xl border border-[#E7D8C7] bg-[#F6F0E7] text-[#222222] hover:bg-[#fff5ec]"
    : "w-full justify-center rounded-2xl border border-white/10 bg-white/4 text-white hover:bg-white/10";

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
      <nav className={navClassName}>
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
              <span className={logoTextClassName}>Gogi Eats</span>
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className={navClassName}>
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
              <span className={logoTextClassName}>Gogi Eats</span>
            </Link>
          </div>

          <div className="hidden min-w-0 items-center space-x-5 xl:flex">
            <Link href="/" className={navLinkClassName}>
              Inicio
            </Link>
            {user && (
              <Link href="/pedidos" className={navLinkClassName}>
                Mis pedidos
              </Link>
            )}
            {user && hasPanelAccess(user.roles) && (
              <Link href="/pickdash" className={navLinkClassName}>
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
                    className={navIconButtonClassName}
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
                        isDeliveryRoute={isDeliveryRoute}
                      />
                    </div>
                  ) : null}
                </div>

                <Button
                  asChild
                  variant="ghost"
                  className={navCartButtonClassName}
                >
                  <Link href="/carrito" className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    <span>Carrito</span>
                    {cartCount > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[#e98a4a] px-2 py-0.5 text-xs font-bold text-white shadow-[0_0_18px_rgba(233,138,74,0.35)]">
                        {cartCount}
                      </span>
                    ) : null}
                  </Link>
                </Button>
                <span className={navMutedTextClassName}>Hola, {user.name}</span>
                <Button
                  variant="ghost"
                  onClick={logout}
                  className={navGhostTextClassName}
                >
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  asChild
                  className={navGhostTextClassName}
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
                  className={navIconButtonClassName}
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
                  className={navCartButtonClassName}
                >
                  <Link href="/carrito" aria-label="Carrito de compras">
                    <span className="relative block">
                      <ShoppingCart className="h-5 w-5" />
                      {cartCount > 0 ? (
                        <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[#e98a4a] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-[0_0_18px_rgba(233,138,74,0.35)]">
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
              className={navCartButtonClassName}
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
              isDeliveryRoute={isDeliveryRoute}
            />
          </div>
        ) : null}

        {mobileMenuOpen && (
          <div className="safe-bottom fixed inset-0 top-16 z-[90] h-[calc(100dvh-4rem)] xl:hidden sm:top-[4.75rem] sm:h-[calc(100dvh-4.75rem)]">
            <button
              type="button"
              className={
                isDeliveryRoute
                  ? "absolute inset-0 bg-[#F6F0E7]/80"
                  : "absolute inset-0 bg-black/55 backdrop-blur-sm"
              }
              aria-label="Cerrar menú móvil"
              onClick={closeMobileMenu}
            />
            <div
              className={
                isDeliveryRoute
                  ? "relative ml-auto flex h-full w-full max-w-[min(24rem,100vw)] flex-col overflow-y-auto border-l border-[#E7D8C7] bg-[#FFF9F2] px-4 py-5 shadow-[0_8px_30px_rgba(180,140,90,0.08)] touch-scroll sm:px-5"
                  : "relative ml-auto flex h-full w-full max-w-[min(24rem,100vw)] flex-col overflow-y-auto border-l border-white/10 bg-[#121212]/96 px-4 py-5 shadow-2xl shadow-black/50 touch-scroll sm:px-5"
              }
            >
              <div
                className={
                  isDeliveryRoute
                    ? "mb-5 rounded-[24px] border border-[#E7D8C7] bg-[#F6F0E7] p-4"
                    : "mb-5 rounded-[24px] border border-white/10 bg-white/4 p-4"
                }
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#e98a4a]">
                  Navegación
                </p>
                <p
                  className={
                    isDeliveryRoute
                      ? "mt-2 text-sm text-[#6F5D4C]"
                      : "mt-2 text-sm text-white/65"
                  }
                >
                  Accesos rápidos y paneles listos para móvil.
                </p>
              </div>

              <div className="grid gap-2">
                <Link
                  href="/"
                  className={mobileMenuLinkClassName}
                  onClick={closeMobileMenu}
                >
                  Inicio
                </Link>
                {user ? (
                  <Link
                    href="/pedidos"
                    className={mobileMenuLinkClassName}
                    onClick={closeMobileMenu}
                  >
                    Mis pedidos
                  </Link>
                ) : null}
                {user && hasPanelAccess(user.roles) ? (
                  <Link
                    href="/pickdash"
                    className={mobileMenuLinkClassName}
                    onClick={closeMobileMenu}
                  >
                    Paneles
                  </Link>
                ) : null}
                <Link
                  href="/shop"
                  className={mobileMenuLinkClassName}
                  onClick={closeMobileMenu}
                >
                  Explorar tiendas
                </Link>
                <Link
                  href="/profile"
                  className={mobileMenuLinkClassName}
                  onClick={closeMobileMenu}
                >
                  Mi perfil
                </Link>
              </div>

              <div className={mobileMenuFooterClassName}>
                {user ? (
                  <div className="space-y-3">
                    <div className={mobileUserBoxClassName}>
                      Hola, {user.name}
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        logout();
                        closeMobileMenu();
                      }}
                      className={mobileActionButtonClassName}
                    >
                      Cerrar sesión
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button
                      variant="ghost"
                      asChild
                      className={mobileAuthButtonClassName}
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
