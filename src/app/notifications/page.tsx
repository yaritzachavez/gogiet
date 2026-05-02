"use client";

import {
  AlertTriangle,
  Bell,
  CreditCard,
  Headset,
  Package,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  message: string;
  related_id: number | null;
  is_read: boolean;
  created_at: string;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadNotifications() {
      try {
        const token =
          localStorage.getItem("token") ||
          localStorage.getItem("authToken") ||
          localStorage.getItem("accessToken");

        if (!token) {
          setError("Debes iniciar sesión nuevamente");
          setNotifications([]);
          return;
        }

        const response = await fetch("/api/notifications", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(
            data?.error || "No se pudieron cargar las notificaciones",
          );
        }

        setNotifications(
          Array.isArray(data.notifications) ? data.notifications : [],
        );
        setError("");
      } catch (loadError) {
        console.error("Error cargando notificaciones:", loadError);
        setNotifications([]);
        setError("No se pudieron cargar las notificaciones");
      } finally {
        setLoading(false);
      }
    }

    loadNotifications();
  }, []);

  async function handleMarkAsRead(notificationId: number) {
    try {
      const token =
        localStorage.getItem("token") ||
        localStorage.getItem("authToken") ||
        localStorage.getItem("accessToken");

      if (!token) {
        return;
      }

      const response = await fetch(
        `/api/notifications/${notificationId}/read`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data?.error || "No se pudo marcar la notificación como leída",
        );
      }

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: true }
            : notification,
        ),
      );
    } catch (markError) {
      console.error("Error marcando notificación como leída:", markError);
    }
  }

  function handleViewDetail(notification: NotificationItem) {
    if (notification.type === "pedido" && notification.related_id) {
      router.push(`/orders/${notification.related_id}`);
      return;
    }

    if (notification.type === "pago") {
      router.push("/admin/orders");
      return;
    }

    if (notification.type === "soporte") {
      router.push("/admin/support");
      return;
    }

    if (notification.type === "stock") {
      router.push("/business");
      return;
    }

    router.push("/notifications");
  }

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  function getNotificationIcon(type: string) {
    if (type === "pedido") return <Package className="h-5 w-5" />;
    if (type === "pago") return <CreditCard className="h-5 w-5" />;
    if (type === "stock") return <AlertTriangle className="h-5 w-5" />;
    if (type === "soporte") return <Headset className="h-5 w-5" />;
    return <Bell className="h-5 w-5" />;
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-600">
                Centro
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">
                Notificaciones
              </h1>
              <p className="mt-2 font-semibold text-slate-500">
                {unreadCount} notificaciones sin leer
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="font-semibold text-slate-500">
              Cargando notificaciones...
            </p>
          ) : error ? (
            <p className="font-semibold text-slate-500">{error}</p>
          ) : notifications.length === 0 ? (
            <p className="font-semibold text-slate-500">
              Aún no tienes notificaciones
            </p>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`rounded-2xl border px-5 py-4 ${
                    notification.is_read
                      ? "border-slate-200 bg-slate-50"
                      : "border-orange-200 bg-orange-50"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex size-10 items-center justify-center rounded-full bg-white text-orange-600 shadow-sm">
                        {getNotificationIcon(notification.type)}
                      </span>
                      <div>
                        <h2 className="font-black text-slate-950">
                          {notification.title}
                        </h2>
                        <p className="mt-1 font-semibold text-slate-600">
                          {notification.message}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-500">
                          {formatDate(notification.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {!notification.is_read ? (
                        <button
                          type="button"
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                        >
                          Marcar como leída
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleViewDetail(notification)}
                        className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white transition hover:bg-orange-700"
                      >
                        Ver detalle
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
