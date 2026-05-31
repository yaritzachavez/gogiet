"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CurrentDeliveriesCard } from "@/components/delivery/current-deliveries-card";
import { EarningsCard } from "@/components/delivery/earnings-card";
import { DeliveryHeader } from "@/components/delivery/header";
import { LocationCard } from "@/components/delivery/location-card";
import { NotificationsCard } from "@/components/delivery/notifications-card";
import type {
  DeliveryEarnings,
  DeliveryHistoryEntry,
  DeliveryNotification,
  DeliveryOrder,
  DeliveryStatus,
} from "@/components/delivery/types";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import { useAuth } from "@/context/AuthContext";
import { fetchWithSession, getClientAuthToken } from "@/lib/client-auth";

const EMPTY_EARNINGS: DeliveryEarnings = {
  currency: "MXN",
  today: 0,
  weekToDate: 0,
  tips: 0,
  goal: 0,
  percentageToGoal: 0,
  comparisonToYesterday: 0,
};

const EMPTY_DASHBOARD_STATS = {
  activeDeliveries: 0,
  completedDeliveries: 0,
  availableDeliveries: 0,
  earnings: 0,
};

type DeliveryProfile = {
  name: string;
  phone: string;
  profile_image_url: string | null;
  delivery_zone: string;
  vehicle_type: string;
  vehicle_plate: string;
  delivery_notes: string;
  is_available: boolean;
};

type DeliveryEvidenceDraft = {
  orderId: string;
  note: string;
  photo: File | null;
  error: string;
};

const EMPTY_PROFILE: DeliveryProfile = {
  name: "",
  phone: "",
  profile_image_url: null,
  delivery_zone: "",
  vehicle_type: "",
  vehicle_plate: "",
  delivery_notes: "",
  is_available: true,
};

function getProfileImageUrl(profilePayload: Record<string, unknown> | null) {
  const candidates = [
    profilePayload?.profile_image_url,
    profilePayload?.profileImageUrl,
    profilePayload?.profile_photo_url,
    profilePayload?.profilePhotoUrl,
    profilePayload?.photo_url,
    profilePayload?.photoUrl,
    profilePayload?.avatar_url,
    profilePayload?.image_url,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function formatCurrency(amount: number, currency = "MXN") {
  if (!currencyFormatterCache.has(currency)) {
    currencyFormatterCache.set(
      currency,
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    );
  }

  return (
    currencyFormatterCache.get(currency) ??
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    })
  ).format(amount);
}

function formatDeliveredAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStoredToken() {
  return getClientAuthToken();
}

function buildAuthHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

function isAuthErrorStatus(status: number) {
  return status === 401 || status === 403;
}

function toDeliveryStatus(value: unknown): DeliveryStatus {
  if (value === "En camino") return value;
  if (value === "En entrega") return value;
  if (value === "Listo para recoger") return value;
  if (value === "Recogido") return value;
  if (value === "Completado") return value;

  return "Pendiente";
}

function parseDeliveryOrders(
  payload: Record<string, unknown>,
  options?: {
    isAvailableDelivery?: boolean;
    canReject?: boolean;
  },
): DeliveryOrder[] {
  const rawOrders = Array.isArray(payload.orders)
    ? payload.orders
    : Array.isArray(payload.assignments)
      ? payload.assignments
      : Array.isArray(payload.deliveries)
        ? payload.deliveries
        : [];

  return rawOrders.map((order) => {
    const safeOrder = order as Record<string, unknown>;

    return {
      id: String(safeOrder.id ?? ""),
      folio: String(safeOrder.folio ?? safeOrder.id ?? ""),
      status: toDeliveryStatus(safeOrder.status),
      eta: String(safeOrder.eta ?? "Por confirmar"),
      paymentMethod: String(safeOrder.paymentMethod ?? "Sin método"),
      amount: Number(safeOrder.total ?? 0),
      businessName: String(safeOrder.businessName ?? ""),
      businessAddress: String(safeOrder.businessAddress ?? ""),
      fullAddress: String(safeOrder.address ?? ""),
      address: {
        street: String(
          (safeOrder.addressDetail as Record<string, unknown> | undefined)
            ?.street ??
            safeOrder.address ??
            "",
        ),
        neighborhood: String(
          (safeOrder.addressDetail as Record<string, unknown> | undefined)
            ?.neighborhood ??
            safeOrder.zoneName ??
            "",
        ),
        city: String(
          (safeOrder.addressDetail as Record<string, unknown> | undefined)
            ?.city ?? "",
        ),
        references: String(
          (safeOrder.addressDetail as Record<string, unknown> | undefined)
            ?.references ?? "",
        ),
        latitude:
          typeof (
            safeOrder.addressDetail as Record<string, unknown> | undefined
          )?.latitude === "number"
            ? Number(
                (safeOrder.addressDetail as Record<string, unknown> | undefined)
                  ?.latitude,
              )
            : null,
        longitude:
          typeof (
            safeOrder.addressDetail as Record<string, unknown> | undefined
          )?.longitude === "number"
            ? Number(
                (safeOrder.addressDetail as Record<string, unknown> | undefined)
                  ?.longitude,
              )
            : null,
        fullAddress: String(safeOrder.address ?? ""),
      },
      contact: {
        name: String(safeOrder.customerName ?? "Cliente"),
        phone: String(safeOrder.customerPhone ?? ""),
      },
      notes: String(safeOrder.deliveryNotes ?? ""),
      shippingFee: Number(safeOrder.shippingFee ?? 0),
      customerReference: String(safeOrder.customerReference ?? ""),
      zoneName: String(safeOrder.zoneName ?? ""),
      assignmentStatus: String(safeOrder.assignmentStatus ?? ""),
      canRespond: Boolean(safeOrder.canRespond),
      canReject:
        typeof safeOrder.canReject === "boolean"
          ? Boolean(safeOrder.canReject)
          : options?.canReject,
      isAvailableDelivery:
        typeof safeOrder.isAvailableDelivery === "boolean"
          ? Boolean(safeOrder.isAvailableDelivery)
          : options?.isAvailableDelivery,
      items: Array.isArray(safeOrder.items)
        ? safeOrder.items.map((item) => ({
            id: Number((item as Record<string, unknown>).id ?? 0),
            name: String((item as Record<string, unknown>).name ?? "Producto"),
            quantity: Number((item as Record<string, unknown>).quantity ?? 0),
            unitPrice: Number((item as Record<string, unknown>).unitPrice ?? 0),
            totalPrice: Number(
              (item as Record<string, unknown>).totalPrice ?? 0,
            ),
            notes: String((item as Record<string, unknown>).notes ?? ""),
          }))
        : [],
    };
  });
}

export default function DeliveryDashboardPage() {
  const { user, logout } = useAuth();
  const [currentOrders, setCurrentOrders] = useState<DeliveryOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | null>(null);
  const [deliveryNotifications, setDeliveryNotifications] = useState<
    DeliveryNotification[]
  >([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [activeOrderLoading, setActiveOrderLoading] = useState(true);
  const [activeOrderError, setActiveOrderError] = useState("");
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState("");
  const [assignmentActionOrderId, setAssignmentActionOrderId] = useState<
    string | null
  >(null);
  const [earnings, setEarnings] = useState<DeliveryEarnings>(EMPTY_EARNINGS);
  const [activeDeliveriesCount, setActiveDeliveriesCount] = useState(0);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [deliveryHistory, setDeliveryHistory] = useState<
    DeliveryHistoryEntry[]
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<DeliveryProfile>(EMPTY_PROFILE);
  const [profileForm, setProfileForm] =
    useState<DeliveryProfile>(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [deliveryEvidenceOpen, setDeliveryEvidenceOpen] = useState(false);
  const [deliveryEvidence, setDeliveryEvidence] =
    useState<DeliveryEvidenceDraft>({
      orderId: "",
      note: "",
      photo: null,
      error: "",
    });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const driverName = profile.name || user?.name || "Repartidor Gogi";
  const normalizedRoles = Array.isArray(user?.roles)
    ? user.roles.map((role) => String(role).toLowerCase())
    : [];
  const canAccessDelivery =
    normalizedRoles.length === 0 ||
    normalizedRoles.includes("repartidor") ||
    normalizedRoles.includes("admin_general");

  const fetchDriverProfile = useCallback(async () => {
    const token = getStoredToken();

    if (!token) {
      setProfile(EMPTY_PROFILE);
      setProfileForm(EMPTY_PROFILE);
      return;
    }

    try {
      setProfileLoading(true);
      const response = await fetchWithSession("/api/delivery/profile", {
        headers: buildAuthHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!response.ok || payload?.success === false) {
        setProfile(EMPTY_PROFILE);
        setProfileForm(EMPTY_PROFILE);
        return;
      }

      const profilePayload =
        payload?.profile && typeof payload.profile === "object"
          ? (payload.profile as Record<string, unknown>)
          : null;

      const nextProfile: DeliveryProfile = {
        name: String(profilePayload?.name ?? user?.name ?? ""),
        phone: String(profilePayload?.phone ?? ""),
        profile_image_url: getProfileImageUrl(profilePayload),
        delivery_zone: String(profilePayload?.delivery_zone ?? ""),
        vehicle_type: String(profilePayload?.vehicle_type ?? ""),
        vehicle_plate: String(profilePayload?.vehicle_plate ?? ""),
        delivery_notes: String(profilePayload?.delivery_notes ?? ""),
        is_available: Boolean(profilePayload?.is_available ?? true),
      };

      setProfile(nextProfile);
      setProfileForm(nextProfile);
    } catch (error) {
      console.error("Error cargando perfil del repartidor:", error);
      setProfile(EMPTY_PROFILE);
      setProfileForm(EMPTY_PROFILE);
    } finally {
      setProfileLoading(false);
    }
  }, [user?.name]);

  const fetchEarnings = useCallback(async () => {
    if (typeof window === "undefined") return;

    const token = getStoredToken();

    if (!token) {
      setEarnings(EMPTY_EARNINGS);
      return;
    }

    try {
      const response = await fetchWithSession("/api/delivery/earnings", {
        headers: buildAuthHeaders(),
      });
      const responseText = await response.text();
      let payload: Record<string, unknown> = {};

      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { raw: responseText };
      }

      if (isAuthErrorStatus(response.status)) {
        setEarnings(EMPTY_EARNINGS);
        return;
      }

      if (!response.ok || payload.success === false) {
        console.error("Error cargando ganancias del repartidor:", {
          status: response.status,
          statusText: response.statusText,
          responseText,
          payload,
        });
        setEarnings(EMPTY_EARNINGS);
        return;
      }

      const rawEarnings =
        payload.earnings && typeof payload.earnings === "object"
          ? (payload.earnings as Record<string, unknown>)
          : null;

      if (!rawEarnings) {
        setEarnings(EMPTY_EARNINGS);
        return;
      }

      setEarnings({
        currency: String(rawEarnings.currency ?? "MXN"),
        today: Number(rawEarnings.today ?? 0),
        weekToDate: Number(rawEarnings.weekToDate ?? 0),
        tips: Number(rawEarnings.tips ?? 0),
        goal: Number(rawEarnings.goal ?? 0),
        percentageToGoal: Number(rawEarnings.percentageToGoal ?? 0),
        comparisonToYesterday: Number(rawEarnings.comparisonToYesterday ?? 0),
      });
    } catch (error) {
      console.error("Error cargando ganancias del repartidor:", error);
      setEarnings(EMPTY_EARNINGS);
    }
  }, []);

  const fetchDeliveryData = useCallback(async () => {
    if (typeof window === "undefined") return;

    const token = getStoredToken();

    if (!token) {
      setCurrentOrders([]);
      setActiveOrder(null);
      setDeliveryNotifications([]);
      setActiveDeliveriesCount(EMPTY_DASHBOARD_STATS.activeDeliveries);
      setCompletedTodayCount(EMPTY_DASHBOARD_STATS.completedDeliveries);
      setOrdersLoading(false);
      setActiveOrderLoading(false);
      setNotificationsLoading(false);
      setOrdersError("Debes iniciar sesión para ver tus entregas.");
      setActiveOrderError("Debes iniciar sesión para ver tu entrega activa.");
      setNotificationsError(
        "Debes iniciar sesión para ver tus notificaciones.",
      );
      return;
    }

    try {
      setOrdersLoading(true);
      setActiveOrderLoading(true);
      setNotificationsLoading(true);
      setOrdersError("");
      setActiveOrderError("");
      setNotificationsError("");

      const [
        dashboardResponse,
        ordersResponse,
        availableResponse,
        activeOrderResponse,
        notificationsResponse,
      ] = await Promise.all([
        fetchWithSession("/api/delivery/dashboard", {
          headers: buildAuthHeaders(),
        }),
        fetchWithSession("/api/delivery/orders", {
          headers: buildAuthHeaders(),
        }),
        fetchWithSession("/api/delivery/available", {
          headers: buildAuthHeaders(),
        }),
        fetchWithSession("/api/delivery/active-order", {
          headers: buildAuthHeaders(),
        }),
        fetchWithSession("/api/delivery/notifications", {
          headers: buildAuthHeaders(),
        }),
      ]);
      const dashboardResponseText = await dashboardResponse.text();
      let dashboardPayload: Record<string, unknown> = {};

      try {
        dashboardPayload = dashboardResponseText
          ? JSON.parse(dashboardResponseText)
          : {};
      } catch {
        dashboardPayload = { raw: dashboardResponseText };
      }

      if (
        isAuthErrorStatus(dashboardResponse.status) ||
        isAuthErrorStatus(ordersResponse.status) ||
        isAuthErrorStatus(availableResponse.status) ||
        isAuthErrorStatus(activeOrderResponse.status) ||
        isAuthErrorStatus(notificationsResponse.status)
      ) {
        setCurrentOrders([]);
        setActiveOrder(null);
        setDeliveryNotifications([]);
        setActiveDeliveriesCount(EMPTY_DASHBOARD_STATS.activeDeliveries);
        setCompletedTodayCount(EMPTY_DASHBOARD_STATS.completedDeliveries);
        setOrdersError("Tu sesión expiró o no tienes permisos de repartidor.");
        setActiveOrderError("");
        setNotificationsError("");
        return;
      }

      if (!dashboardResponse.ok || dashboardPayload.success === false) {
        console.error("Error cargando dashboard del repartidor:", {
          status: dashboardResponse.status,
          statusText: dashboardResponse.statusText,
          responseText: dashboardResponseText,
          payload: dashboardPayload,
        });
        setActiveDeliveriesCount(EMPTY_DASHBOARD_STATS.activeDeliveries);
        setCompletedTodayCount(EMPTY_DASHBOARD_STATS.completedDeliveries);
      } else {
        const dashboardData =
          dashboardPayload.dashboard &&
          typeof dashboardPayload.dashboard === "object"
            ? (dashboardPayload.dashboard as Record<string, unknown>)
            : null;
        const statsData =
          dashboardPayload.stats && typeof dashboardPayload.stats === "object"
            ? (dashboardPayload.stats as Record<string, unknown>)
            : null;

        setActiveDeliveriesCount(
          Number(
            dashboardData?.activeDeliveriesCount ??
              statsData?.activeDeliveries ??
              0,
          ),
        );
        setCompletedTodayCount(
          Number(
            dashboardData?.completedTodayCount ??
              statsData?.completedDeliveries ??
              0,
          ),
        );
      }

      const ordersResponseText = await ordersResponse.text();
      let ordersPayload: Record<string, unknown> = {};

      try {
        ordersPayload = ordersResponseText
          ? JSON.parse(ordersResponseText)
          : {};
      } catch {
        ordersPayload = { raw: ordersResponseText };
      }

      const parsedOrders = parseDeliveryOrders(ordersPayload, {
        isAvailableDelivery: false,
        canReject: true,
      });
      const availableResponseText = await availableResponse.text();
      let availablePayload: Record<string, unknown> = {};

      try {
        availablePayload = availableResponseText
          ? JSON.parse(availableResponseText)
          : {};
      } catch {
        availablePayload = { raw: availableResponseText };
      }

      const parsedAvailableOrders =
        availableResponse.ok && availablePayload.success !== false
          ? parseDeliveryOrders(availablePayload, {
              isAvailableDelivery: true,
              canReject: false,
            })
          : [];
      let visibleOrders: DeliveryOrder[] = parsedAvailableOrders;

      if (!ordersResponse.ok || ordersPayload.success === false) {
        console.error("Error real cargando entregas del repartidor:", {
          status: ordersResponse.status,
          statusText: ordersResponse.statusText,
          responseText: ordersResponseText,
          payload: ordersPayload,
        });
        setOrdersError(
          parsedAvailableOrders.length > 0
            ? ""
            : (typeof ordersPayload.error === "string" &&
                ordersPayload.error) ||
                "No se pudieron cargar tus entregas. Intenta de nuevo.",
        );
        visibleOrders = parsedAvailableOrders;
      }

      if (!availableResponse.ok || availablePayload.success === false) {
        console.error("Error cargando entregas disponibles:", {
          status: availableResponse.status,
          statusText: availableResponse.statusText,
          responseText: availableResponseText,
          payload: availablePayload,
        });
      }

      if (ordersResponse.ok && ordersPayload.success !== false) {
        visibleOrders = Array.from(
          new Map(
            [...parsedAvailableOrders, ...parsedOrders].map((order) => [
              order.id,
              order,
            ]),
          ).values(),
        );
      }

      if (ordersResponse.ok && ordersPayload.success !== false) {
        setOrdersError("");
      }

      setCurrentOrders(visibleOrders);

      const activeOrderResponseText = await activeOrderResponse.text();
      let activeOrderPayload: Record<string, unknown> = {};

      try {
        activeOrderPayload = activeOrderResponseText
          ? JSON.parse(activeOrderResponseText)
          : {};
      } catch {
        activeOrderPayload = { raw: activeOrderResponseText };
      }

      if (!activeOrderResponse.ok || activeOrderPayload.success === false) {
        console.error("Error real cargando orden activa del repartidor:", {
          status: activeOrderResponse.status,
          statusText: activeOrderResponse.statusText,
          responseText: activeOrderResponseText,
          payload: activeOrderPayload,
        });
        setActiveOrder(null);
        setActiveOrderError(
          (typeof activeOrderPayload.error === "string" &&
            activeOrderPayload.error) ||
            "No se pudo cargar tu entrega activa.",
        );
      }

      const activeOrderData =
        activeOrderPayload.activeOrder &&
        typeof activeOrderPayload.activeOrder === "object"
          ? (activeOrderPayload.activeOrder as Record<string, unknown>)
          : activeOrderPayload.order &&
              typeof activeOrderPayload.order === "object"
            ? (activeOrderPayload.order as Record<string, unknown>)
            : null;

      if (!activeOrderData) {
        setActiveOrder(null);
        setActiveOrderError("");
      } else {
        setActiveOrder({
          id: String(activeOrderData.id ?? ""),
          folio: String(activeOrderData.folio ?? activeOrderData.id ?? ""),
          status: toDeliveryStatus(activeOrderData.status),
          eta: "Por confirmar",
          paymentMethod: String(activeOrderData.paymentMethod ?? "Sin método"),
          amount: Number(activeOrderData.amount ?? 0),
          shippingFee: Number(activeOrderData.shippingFee ?? 0),
          businessName: String(activeOrderData.businessName ?? ""),
          businessAddress: String(activeOrderData.businessAddress ?? ""),
          fullAddress: String(activeOrderData.fullAddress ?? ""),
          address: {
            street: String(activeOrderData.fullAddress ?? ""),
            neighborhood: String(activeOrderData.zoneName ?? ""),
            city: String(activeOrderData.city ?? ""),
            references: String(activeOrderData.references ?? ""),
            latitude:
              typeof activeOrderData.latitude === "number"
                ? Number(activeOrderData.latitude)
                : null,
            longitude:
              typeof activeOrderData.longitude === "number"
                ? Number(activeOrderData.longitude)
                : null,
            fullAddress: String(activeOrderData.fullAddress ?? ""),
          },
          contact: {
            name: String(activeOrderData.customerName ?? "Cliente"),
            phone: String(activeOrderData.customerPhone ?? ""),
          },
          zoneName: String(activeOrderData.zoneName ?? ""),
          notes: String(activeOrderData.references ?? ""),
          customerReference: String(activeOrderData.references ?? ""),
        });

        setActiveOrderError("");
      }

      const notificationsResponseText = await notificationsResponse.text();
      let notificationsPayload: Record<string, unknown> = {};

      try {
        notificationsPayload = notificationsResponseText
          ? JSON.parse(notificationsResponseText)
          : {};
      } catch {
        notificationsPayload = { raw: notificationsResponseText };
      }

      if (!notificationsResponse.ok || notificationsPayload.success === false) {
        console.warn("Error real cargando notificaciones del repartidor:", {
          status: notificationsResponse.status,
          statusText: notificationsResponse.statusText,
          responseText: notificationsResponseText,
          payload: notificationsPayload,
        });
        setDeliveryNotifications([]);
        setNotificationsError("Tu sesión expiró o no tienes permisos.");
      } else {
        const parsedNotifications = Array.isArray(
          notificationsPayload.notifications,
        )
          ? (
              notificationsPayload.notifications as Array<
                Record<string, unknown>
              >
            ).map((notification) => ({
              id: String(notification.id ?? ""),
              type: String(notification.type ?? "pedido"),
              title: String(notification.title ?? "Notificación"),
              message: String(notification.message ?? ""),
              timestamp: String(notification.createdAt ?? ""),
              createdAt: String(notification.createdAt ?? ""),
              status:
                notification.status === null ||
                notification.status === undefined
                  ? undefined
                  : String(notification.status),
              orderId:
                notification.orderId === null ||
                notification.orderId === undefined
                  ? null
                  : Number(notification.orderId),
              folio:
                notification.folio === null || notification.folio === undefined
                  ? null
                  : String(notification.folio),
              unread: !notification.isRead,
            }))
          : [];

        console.log("[delivery-panel] respuesta panel repartidor:", {
          orders: visibleOrders.map((order) => ({
            id: order.id,
            folio: order.folio,
            businessName: order.businessName,
            canRespond: order.canRespond,
            isAvailableDelivery: order.isAvailableDelivery,
          })),
        });

        setDeliveryNotifications(parsedNotifications);
        setNotificationsError("");
      }
    } catch (error) {
      console.error("Error cargando entregas del repartidor:", error);
      setCurrentOrders([]);
      setActiveOrder(null);
      setDeliveryNotifications([]);
      setActiveDeliveriesCount(EMPTY_DASHBOARD_STATS.activeDeliveries);
      setCompletedTodayCount(EMPTY_DASHBOARD_STATS.completedDeliveries);
      setOrdersError("No se pudieron cargar tus entregas. Intenta de nuevo.");
      setActiveOrderError("No se pudo cargar tu entrega activa.");
      setNotificationsError(
        "No se pudieron cargar tus notificaciones. Intenta de nuevo.",
      );
    } finally {
      setOrdersLoading(false);
      setActiveOrderLoading(false);
      setNotificationsLoading(false);
    }
  }, []);

  const fetchDeliveryHistory = useCallback(async () => {
    if (typeof window === "undefined") return;

    const token = getStoredToken();

    if (!token) {
      setDeliveryHistory([]);
      setHistoryError("Debes iniciar sesión para ver tu historial.");
      return;
    }

    try {
      setHistoryLoading(true);
      setHistoryError("");

      const response = await fetchWithSession("/api/delivery/history", {
        headers: buildAuthHeaders(),
      });
      const responseText = await response.text();
      let payload: Record<string, unknown> = {};

      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { raw: responseText };
      }

      if (isAuthErrorStatus(response.status)) {
        setDeliveryHistory([]);
        setHistoryError("Tu sesión expiró o no tienes permisos de repartidor.");
        return;
      }

      if (!response.ok || payload.success === false) {
        console.error("Error cargando historial del repartidor:", {
          status: response.status,
          statusText: response.statusText,
          responseText,
          payload,
        });
        setDeliveryHistory([]);
        setHistoryError(
          (typeof payload.error === "string" && payload.error) ||
            "No se pudo cargar tu historial de entregas.",
        );
        return;
      }

      const parsedHistory = Array.isArray(payload.history)
        ? (payload.history as Array<Record<string, unknown>>).map((entry) => ({
            id: String(entry.id ?? ""),
            folio: String(entry.folio ?? ""),
            businessName: String(entry.businessName ?? ""),
            customerName: String(entry.customerName ?? "Cliente"),
            customerPhone: String(entry.customerPhone ?? ""),
            fullAddress: String(entry.fullAddress ?? ""),
            paymentMethod: String(entry.paymentMethod ?? "Sin método"),
            total: Number(entry.total ?? 0),
            deliveryFee: Number(entry.deliveryFee ?? 0),
            driverEarning: Number(entry.driverEarning ?? 0),
            tip: Number(entry.tip ?? 0),
            deliveredAt: String(entry.deliveredAt ?? ""),
            status: String(entry.status ?? "Pedido entregado"),
            businessAddress: String(entry.businessAddress ?? ""),
            earningStatus: String(entry.earningStatus ?? "pending"),
          }))
        : [];

      setDeliveryHistory(parsedHistory);
    } catch (error) {
      console.error("Error cargando historial del repartidor:", error);
      setDeliveryHistory([]);
      setHistoryError("No se pudo cargar tu historial de entregas.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refreshDeliveryPanel = useCallback(async () => {
    const tasks: Array<Promise<void>> = [fetchDeliveryData(), fetchEarnings()];

    if (historyOpen) {
      tasks.push(fetchDeliveryHistory());
    }

    await Promise.all(tasks);
  }, [fetchDeliveryData, fetchDeliveryHistory, fetchEarnings, historyOpen]);

  const handleOpenHistory = useCallback(async () => {
    setHistoryOpen(true);
    await fetchDeliveryHistory();
  }, [fetchDeliveryHistory]);

  useEffect(() => {
    fetchDeliveryData();

    const intervalId = window.setInterval(() => {
      fetchDeliveryData();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchDeliveryData]);

  useEffect(() => {
    fetchDriverProfile();
  }, [fetchDriverProfile]);

  useEffect(() => {
    fetchEarnings();

    const intervalId = window.setInterval(() => {
      fetchEarnings();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchEarnings]);

  const handleAssignmentResponse = useCallback(
    async (orderId: string, action: "accept" | "reject") => {
      if (typeof window === "undefined") return;

      const token = getStoredToken();

      if (!token) {
        setOrdersError("Debes iniciar sesión para responder la asignación.");
        return;
      }

      try {
        setAssignmentActionOrderId(orderId);

        const response = await fetchWithSession(
          `/api/delivery/assignments/${orderId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
          },
        );
        const responseText = await response.text();
        let payload: Record<string, unknown> = {};

        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch {
          payload = { raw: responseText };
        }

        if (isAuthErrorStatus(response.status)) {
          setOrdersError(
            "Tu sesión expiró o no tienes permisos de repartidor.",
          );
          return;
        }

        if (!response.ok || payload.success === false) {
          setOrdersError(
            (typeof payload.error === "string" && payload.error) ||
              "No se pudo responder la asignación.",
          );
          return;
        }

        setOrdersError("");
        await refreshDeliveryPanel();
      } catch (error) {
        console.error("Error respondiendo asignación del repartidor:", error);
        setOrdersError("No se pudo responder la asignación.");
      } finally {
        setAssignmentActionOrderId(null);
      }
    },
    [refreshDeliveryPanel],
  );

  const handleMarkDelivered = useCallback((orderId: string) => {
    setDeliveryEvidence({
      orderId,
      note: "",
      photo: null,
      error: "",
    });
    setDeliveryEvidenceOpen(true);
  }, []);

  const handleConfirmDelivered = useCallback(async () => {
    if (typeof window === "undefined") return;

    const token = getStoredToken();

    if (!token) {
      setDeliveryEvidence((current) => ({
        ...current,
        error: "Debes iniciar sesión para completar la entrega.",
      }));
      return;
    }

    if (!deliveryEvidence.photo) {
      setDeliveryEvidence((current) => ({
        ...current,
        error: "Agrega una foto de evidencia antes de confirmar.",
      }));
      return;
    }

    try {
      setAssignmentActionOrderId(deliveryEvidence.orderId);
      const formData = new FormData();
      formData.append("order_id", deliveryEvidence.orderId);
      formData.append("note", deliveryEvidence.note.trim());
      formData.append("photo", deliveryEvidence.photo);

      const response = await fetchWithSession("/api/delivery/complete", {
        method: "POST",
        body: formData,
      });
      const responseText = await response.text();
      let payload: Record<string, unknown> = {};

      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { raw: responseText };
      }

      if (isAuthErrorStatus(response.status)) {
        setDeliveryEvidence((current) => ({
          ...current,
          error: "Tu sesión expiró o no tienes permisos de repartidor.",
        }));
        return;
      }

      if (!response.ok || payload.success === false) {
        const message =
          (typeof payload.error === "string" && payload.error) ||
          (typeof payload.message === "string" && payload.message) ||
          "No se pudo marcar el pedido como entregado.";
        setDeliveryEvidence((current) => ({
          ...current,
          error: message,
        }));
        return;
      }

      const successMessage =
        (typeof payload.message === "string" && payload.message) ||
        "Pedido marcado como entregado";

      setOrdersError("");
      console.log("[delivery-panel] pedido entregado, refrescando panel:", {
        orderId: deliveryEvidence.orderId,
      });
      setDeliveryEvidenceOpen(false);
      setDeliveryEvidence({
        orderId: "",
        note: "",
        photo: null,
        error: "",
      });
      await refreshDeliveryPanel();
      setOrdersError(successMessage);
    } catch (error) {
      console.error("Error completando entrega:", error);
      setDeliveryEvidence((current) => ({
        ...current,
        error: "No se pudo marcar el pedido como entregado.",
      }));
    } finally {
      setAssignmentActionOrderId(null);
    }
  }, [deliveryEvidence, refreshDeliveryPanel]);

  const handleDeliveryStatusUpdate = useCallback(
    async (orderId: string, status: "recogido" | "on_the_way") => {
      if (typeof window === "undefined") return;

      const token = getStoredToken();

      if (!token) {
        setOrdersError("Debes iniciar sesión para actualizar la entrega.");
        return;
      }

      try {
        setAssignmentActionOrderId(orderId);

        const response = await fetchWithSession(
          `/api/delivery/orders/${orderId}/status`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status }),
          },
        );
        const responseText = await response.text();
        let payload: Record<string, unknown> = {};

        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch {
          payload = { raw: responseText };
        }

        if (isAuthErrorStatus(response.status)) {
          setOrdersError(
            "Tu sesión expiró o no tienes permisos de repartidor.",
          );
          return;
        }

        if (!response.ok || payload.success === false) {
          setOrdersError(
            (typeof payload.error === "string" && payload.error) ||
              "No se pudo actualizar la entrega.",
          );
          return;
        }

        setOrdersError("");
        await refreshDeliveryPanel();
      } catch (error) {
        console.error("Error actualizando estado de entrega:", error);
        setOrdersError("No se pudo actualizar la entrega.");
      } finally {
        setAssignmentActionOrderId(null);
      }
    },
    [refreshDeliveryPanel],
  );

  const handleAvatarChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;

      if (!file) {
        return;
      }

      const allowedTypes = new Set([
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ]);

      if (!allowedTypes.has(file.type)) {
        setProfileError("Solo se permiten imágenes JPG, PNG o WEBP.");
        event.target.value = "";
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setProfileError("La imagen no debe superar 5 MB.");
        event.target.value = "";
        return;
      }

      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }

      setProfileError("");
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      event.target.value = "";
    },
    [avatarPreview],
  );

  const handleSaveProfile = useCallback(async () => {
    const token = getStoredToken();

    if (!token) {
      setProfileError("Debes iniciar sesión para actualizar tu perfil.");
      return;
    }

    if (!profileForm.phone.trim()) {
      setProfileError("El teléfono es obligatorio.");
      return;
    }

    if (!profileForm.vehicle_type.trim()) {
      setProfileError("El vehículo es obligatorio.");
      return;
    }

    if (
      (profileForm.vehicle_type === "moto" ||
        profileForm.vehicle_type === "auto") &&
      !profileForm.vehicle_plate.trim()
    ) {
      setProfileError("Las placas son obligatorias para moto o auto.");
      return;
    }

    try {
      setProfileSaving(true);
      setProfileError("");
      setProfileSuccess("");

      const formData = new FormData();
      formData.append("name", profileForm.name || driverName);
      formData.append("phone", profileForm.phone);
      formData.append("delivery_zone", profileForm.delivery_zone);
      formData.append("vehicle_type", profileForm.vehicle_type);
      formData.append("vehicle_plate", profileForm.vehicle_plate);
      formData.append("delivery_notes", profileForm.delivery_notes);
      formData.append("is_available", profileForm.is_available ? "1" : "0");

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      const response = await fetchWithSession("/api/delivery/profile", {
        method: "PATCH",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!response.ok || payload?.success === false) {
        setProfileError(
          (typeof payload?.error === "string" && payload.error) ||
            "No se pudo actualizar el perfil.",
        );
        return;
      }

      const savedProfile =
        payload?.profile && typeof payload.profile === "object"
          ? (payload.profile as Record<string, unknown>)
          : null;

      const nextProfile: DeliveryProfile = {
        name: String(savedProfile?.name ?? profileForm.name ?? driverName),
        phone: String(savedProfile?.phone ?? profileForm.phone),
        profile_image_url: getProfileImageUrl(savedProfile),
        delivery_zone: String(
          savedProfile?.delivery_zone ?? profileForm.delivery_zone,
        ),
        vehicle_type: String(
          savedProfile?.vehicle_type ?? profileForm.vehicle_type,
        ),
        vehicle_plate: String(
          savedProfile?.vehicle_plate ?? profileForm.vehicle_plate,
        ),
        delivery_notes: String(
          savedProfile?.delivery_notes ?? profileForm.delivery_notes,
        ),
        is_available: Boolean(
          savedProfile?.is_available ?? profileForm.is_available,
        ),
      };

      setProfile(nextProfile);
      setProfileForm(nextProfile);
      setAvatarFile(null);
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
      setAvatarPreview(null);
      setProfileSuccess("Perfil actualizado correctamente");
    } catch (error) {
      console.error("Error actualizando perfil del repartidor:", error);
      setProfileError("No se pudo actualizar el perfil.");
    } finally {
      setProfileSaving(false);
    }
  }, [avatarFile, avatarPreview, driverName, profileForm]);

  if (user && !canAccessDelivery) {
    return (
      <main className="min-h-screen bg-[#f3ede3] px-4 py-12 text-[#2b221a]">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-[#e4d5c5] bg-[#fffaf3] p-8 shadow-xl shadow-[#c9ab88]/20">
          <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-[#b36a2b]">
            Acceso restringido
          </p>
          <h1 className="mt-3 text-3xl font-black text-[#2f2419]">
            Este panel es solo para repartidores
          </h1>
          <p className="mt-3 text-base leading-7 text-[#6e5d4b]">
            Tu cuenta no tiene el rol de repartidor activo. Solicita la
            asignación correcta desde administración antes de operar entregas.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F1E8] text-[#3B2D25]">
      <div className="min-h-screen bg-[#F7F1E8]">
        <div className="section-shell responsive-stack py-5 sm:py-7 lg:py-8">
          <DeliveryHeader
            driverName={driverName}
            serviceArea={profile.delivery_zone || "Sin zona configurada"}
            isAvailable={profile.is_available}
            pendingOrders={activeDeliveriesCount}
            completedToday={completedTodayCount}
            lastSync="Actualizado ahora"
            onLogout={logout}
            onOpenSettings={() => {
              setProfileForm(profile);
              setProfileError("");
              setProfileSuccess("");
              setProfileOpen(true);
            }}
          />

          <div className="responsive-dashboard-grid">
            <CurrentDeliveriesCard
              orders={currentOrders}
              activeDeliveriesCount={activeDeliveriesCount}
              isLoading={ordersLoading}
              error={ordersError}
              actionLoadingOrderId={assignmentActionOrderId}
              onAcceptOrder={(orderId) =>
                handleAssignmentResponse(orderId, "accept")
              }
              onRejectOrder={(orderId) =>
                handleAssignmentResponse(orderId, "reject")
              }
              onMarkPickedUp={(orderId) =>
                handleDeliveryStatusUpdate(orderId, "recogido")
              }
              onMarkOnTheWay={(orderId) =>
                handleDeliveryStatusUpdate(orderId, "on_the_way")
              }
              onMarkDelivered={handleMarkDelivered}
            />

            <div className="space-y-6">
              {activeOrder ? (
                <LocationCard order={activeOrder} />
              ) : activeOrderLoading ? (
                <div className="rounded-[26px] border border-dashed border-[#E8DCCB] bg-[#FCF6EE] p-6 text-sm text-[#6c5a49] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  Cargando entrega activa...
                </div>
              ) : activeOrderError ? (
                <div className="rounded-[26px] border border-dashed border-[#EDCDB4] bg-[#FFF3E9] p-6 text-sm text-[#975731] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  {activeOrderError}
                </div>
              ) : (
                <div className="rounded-[26px] border border-dashed border-[#E8DCCB] bg-[#FCF6EE] p-6 text-sm text-[#6c5a49] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  No tienes entregas asignadas por ahora.
                </div>
              )}
              <div className="rounded-[26px] border border-[#E8DCCB] bg-[#FFF9F2] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                <p className="text-xs font-extrabold uppercase tracking-[0.26em] text-[#b36a2b]">
                  Perfil operativo
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#E8DCCB] bg-[#F8F1E7] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                      Zona activa
                    </p>
                    <p className="mt-2 font-semibold text-[#2f2419]">
                      {profile.delivery_zone || "Sin zona configurada"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#E8DCCB] bg-[#F8F1E7] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                      Vehículo
                    </p>
                    <p className="mt-2 font-semibold text-[#2f2419]">
                      {profile.vehicle_type || "Sin vehículo configurado"}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-[#6c5a49]">
                  Máximo permitido:{" "}
                  <span className="font-semibold">5 entregas activas</span>.
                  {activeDeliveriesCount >= 5
                    ? " Ya tienes el máximo de entregas activas permitidas."
                    : " Puedes aceptar más entregas si están disponibles."}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
            <EarningsCard
              earnings={earnings}
              isHistoryLoading={historyLoading}
              onViewHistory={handleOpenHistory}
            />
            <NotificationsCard
              notifications={deliveryNotifications}
              isLoading={notificationsLoading}
              error={notificationsError}
              supportOrderId={activeOrder?.id ?? currentOrders[0]?.id ?? null}
            />
          </div>
        </div>
      </div>

      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(247,241,232,0.82)] px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
          <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-[#E8DCCB] bg-[#FFF9F2] shadow-[0_18px_42px_rgba(0,0,0,0.08)] sm:rounded-[30px]">
            <div className="flex items-start justify-between gap-4 border-b border-[#E8DCCB] bg-[#F8F1E7] px-6 py-5">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-orange-700/70">
                  Historial real
                </p>
                <h2 className="mt-2 text-2xl font-black text-[#3B2D25]">
                  Pedidos entregados
                </h2>
                <p className="mt-1 text-sm text-[#6F5D4C]">
                  Aqui ves todas tus entregas completadas con sus ganancias y
                  propinas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-2 text-sm font-bold text-orange-700 transition hover:bg-white"
              >
                Cerrar
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              {historyLoading ? (
                <div className="rounded-3xl border border-dashed border-[#E8DCCB] bg-[#FCF6EE] px-6 py-10 text-center text-sm font-medium text-[#6F5D4C]">
                  Cargando historial de entregas...
                </div>
              ) : historyError ? (
                <div className="rounded-3xl border border-[#EDCDB4] bg-[#FFF3E9] px-6 py-10 text-center text-sm font-semibold text-[#9a5b36]">
                  {historyError}
                </div>
              ) : deliveryHistory.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#E8DCCB] bg-[#FCF6EE] px-6 py-10 text-center text-sm font-medium text-[#6F5D4C]">
                  No tienes entregas completadas por ahora.
                </div>
              ) : (
                <div className="grid gap-4">
                  {deliveryHistory.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-[26px] border border-[#E8DCCB] bg-[#FFFDF9] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.035)]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-orange-700/70">
                            {entry.folio}
                          </p>
                          <h3 className="mt-2 text-xl font-black text-[#3B2D25]">
                            {entry.businessName}
                          </h3>
                          {entry.businessAddress ? (
                            <p className="mt-1 text-sm text-[#8d755b]">
                              Recogida: {entry.businessAddress}
                            </p>
                          ) : null}
                          <p className="mt-1 text-sm text-[#6F5D4C]">
                            Cliente: {entry.customerName}
                            {entry.customerPhone
                              ? ` · ${entry.customerPhone}`
                              : ""}
                          </p>
                        </div>
                        <div className="rounded-full border border-[#E8DCCB] bg-[#F8F1E7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#b36a2b]">
                          {entry.status}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-[#6F5D4C] sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                            Direccion
                          </p>
                          <p className="mt-2 leading-relaxed">
                            {entry.fullAddress || "Sin direccion"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                            Pago y entrega
                          </p>
                          <p className="mt-2">{entry.paymentMethod}</p>
                          <p className="mt-1 text-[#8d755b]">
                            {formatDeliveredAt(entry.deliveredAt)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#E8DCCB] bg-[#F8F1E7] p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b36a2b]/80">
                            Ganancia
                          </p>
                          <p className="mt-2 text-lg font-black text-[#3B2D25]">
                            {formatCurrency(
                              entry.driverEarning,
                              earnings.currency,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-[#8d755b]">
                            Envio:{" "}
                            {formatCurrency(
                              entry.deliveryFee,
                              earnings.currency,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-[#8d755b]">
                            Estado:{" "}
                            {entry.earningStatus === "paid"
                              ? "Pagado"
                              : entry.earningStatus === "settled"
                                ? "Liquidado"
                                : "Pendiente"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-4 text-sm text-[#6F5D4C] sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                            Total pedido
                          </p>
                          <p className="mt-2 font-semibold text-[#3B2D25]">
                            {formatCurrency(entry.total, earnings.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                            Costo de envio
                          </p>
                          <p className="mt-2 font-semibold text-[#3B2D25]">
                            {formatCurrency(
                              entry.deliveryFee,
                              earnings.currency,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                            Propina
                          </p>
                          <p className="mt-2 font-semibold text-[#3B2D25]">
                            {formatCurrency(entry.tip, earnings.currency)}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {deliveryEvidenceOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(247,241,232,0.82)] px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
          <div className="w-full max-w-xl rounded-[24px] border border-[#E8DCCB] bg-[#FFF9F2] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.08)] sm:rounded-[28px] sm:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-[#b36a2b]">
              Confirmar entrega
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#2f2419]">
              Sube evidencia antes de marcar entregado
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6e5d4b]">
              Agrega una foto de evidencia y una nota opcional para dejar la
              entrega validada y trazable para soporte.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="delivery-evidence-photo"
                  className="text-sm font-semibold text-[#3d3025]"
                >
                  Foto de evidencia
                </label>
                <input
                  id="delivery-evidence-photo"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="mt-2 block w-full rounded-2xl border border-[#dcc7b0] bg-[#fdf7ef] px-4 py-3 text-sm text-[#3d3025]"
                  onChange={(event) =>
                    setDeliveryEvidence((current) => ({
                      ...current,
                      photo: event.target.files?.[0] ?? null,
                      error: "",
                    }))
                  }
                />
              </div>

              <div>
                <label
                  htmlFor="delivery-evidence-note"
                  className="text-sm font-semibold text-[#3d3025]"
                >
                  Nota opcional
                </label>
                <textarea
                  id="delivery-evidence-note"
                  rows={4}
                  value={deliveryEvidence.note}
                  onChange={(event) =>
                    setDeliveryEvidence((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="Ej. Se entregó en mano al cliente o se dejó en recepción."
                  className="mt-2 w-full rounded-2xl border border-[#dcc7b0] bg-[#fdf7ef] px-4 py-3 text-sm text-[#3d3025] outline-none focus:border-[#d97a37]"
                />
              </div>

              {deliveryEvidence.error ? (
                <div className="rounded-2xl border border-[#efc8b0] bg-[#fff1e8] px-4 py-3 text-sm font-medium text-[#9a5b36]">
                  {deliveryEvidence.error}
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setDeliveryEvidenceOpen(false);
                  setDeliveryEvidence({
                    orderId: "",
                    note: "",
                    photo: null,
                    error: "",
                  });
                }}
                className="rounded-full border border-[#dcc7b0] bg-white px-5 py-2.5 text-sm font-bold text-[#6e5d4b] transition hover:bg-[#faf2e8]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelivered}
                disabled={assignmentActionOrderId === deliveryEvidence.orderId}
                className="rounded-full bg-[linear-gradient(135deg,#d36a1f_0%,#f08d3c_100%)] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#d97a37]/25 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assignmentActionOrderId === deliveryEvidence.orderId
                  ? "Guardando evidencia..."
                  : "Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(247,241,232,0.82)] px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
          <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[#E8DCCB] bg-[#FFF9F2] shadow-[0_18px_42px_rgba(0,0,0,0.08)] sm:rounded-[30px]">
            <div className="flex items-start justify-between gap-4 border-b border-[#E8DCCB] bg-[#F8F1E7] px-6 py-5">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-[#b36a2b]/80">
                  Configuración
                </p>
                <h2 className="mt-2 text-2xl font-black text-[#3B2D25]">
                  Configuración del repartidor
                </h2>
                <p className="mt-1 text-sm text-[#6F5D4C]">
                  Actualiza tu foto, vehículo, zona y estado sin afectar tus
                  entregas activas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="rounded-full border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-2 text-sm font-bold text-[#b36a2b] transition hover:bg-white"
              >
                Cerrar
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-6">
              <div className="grid gap-6 lg:grid-cols-[0.8fr,1.2fr]">
                <section className="rounded-3xl border border-[#E8DCCB] bg-[#FFFDF9] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.03)]">
                  <p className="text-sm font-bold text-[#3B2D25]">
                    Foto de perfil
                  </p>
                  <p className="mt-1 text-xs text-[#8d755b]">
                    Visible para negocio y cliente.
                  </p>
                  <div className="mt-5 flex flex-col items-center gap-4">
                    <UserAvatar
                      name={profileForm.name || driverName}
                      src={avatarPreview || profile.profile_image_url}
                      size={112}
                    />
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-extrabold text-white"
                    >
                      {avatarPreview ? "Cambiar foto" : "Subir foto"}
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-[#E8DCCB] bg-[#FFFDF9] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.03)]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 md:col-span-2">
                      <span className="text-sm font-bold text-[#3B2D25]">
                        Nombre
                      </span>
                      <input
                        value={profileForm.name}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                        className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-3 text-sm outline-none focus:border-orange-300"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#3B2D25]">
                        Teléfono
                      </span>
                      <input
                        value={profileForm.phone}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            phone: event.target.value,
                          }))
                        }
                        className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-3 text-sm outline-none focus:border-orange-300"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#3B2D25]">
                        Zona de trabajo
                      </span>
                      <input
                        value={profileForm.delivery_zone}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            delivery_zone: event.target.value,
                          }))
                        }
                        className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-3 text-sm outline-none focus:border-orange-300"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#3B2D25]">
                        Estado
                      </span>
                      <select
                        value={profileForm.is_available ? "activo" : "pausado"}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            is_available: event.target.value === "activo",
                          }))
                        }
                        className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-3 text-sm outline-none focus:border-orange-300"
                      >
                        <option value="activo">Activo</option>
                        <option value="pausado">Pausado</option>
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#3B2D25]">
                        Vehículo
                      </span>
                      <select
                        value={profileForm.vehicle_type}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            vehicle_type: event.target.value,
                          }))
                        }
                        className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-3 text-sm outline-none focus:border-orange-300"
                      >
                        <option value="">Selecciona</option>
                        <option value="moto">Moto</option>
                        <option value="bicicleta">Bicicleta</option>
                        <option value="auto">Auto</option>
                        <option value="a_pie">A pie</option>
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#3B2D25]">
                        Placas
                      </span>
                      <input
                        value={profileForm.vehicle_plate}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            vehicle_plate: event.target.value,
                          }))
                        }
                        className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-3 text-sm outline-none focus:border-orange-300"
                        placeholder="Solo si aplica"
                      />
                    </label>
                    <label className="grid gap-2 md:col-span-2">
                      <span className="text-sm font-bold text-[#3B2D25]">
                        Notas o referencias
                      </span>
                      <textarea
                        value={profileForm.delivery_notes}
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            delivery_notes: event.target.value,
                          }))
                        }
                        rows={4}
                        className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] px-4 py-3 text-sm outline-none focus:border-orange-300"
                      />
                    </label>
                  </div>

                  {profileError ? (
                    <p className="mt-4 rounded-2xl border border-[#EDCDB4] bg-[#FFF3E9] px-4 py-3 text-sm font-semibold text-[#9a5b36]">
                      {profileError}
                    </p>
                  ) : null}
                  {profileSuccess ? (
                    <p className="mt-4 rounded-2xl border border-[#E8DCCB] bg-[#F8F1E7] px-4 py-3 text-sm font-semibold text-[#7c654f]">
                      {profileSuccess}
                    </p>
                  ) : null}

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={profileSaving || profileLoading}
                      className="rounded-2xl bg-[linear-gradient(135deg,#d36a1f_0%,#f08d3c_100%)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(217,122,55,0.18)] disabled:opacity-60"
                    >
                      {profileSaving ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <SupportChatWidget
        requesterRole="repartidor"
        title="Soporte para repartidor"
        description="Tu conversación se sincroniza con la bandeja del Administrador General y muestra nuevas respuestas automáticamente."
        floating
      />
    </main>
  );
}
