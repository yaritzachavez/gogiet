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
import { canAccessPanel } from "@/lib/panel-access";

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
  driver_status: "ACTIVE" | "RESTING" | "OFFLINE" | "SUSPENDED" | "DISABLED";
  driver_status_label: string;
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
  driver_status: "ACTIVE",
  driver_status_label: "Activo",
};

const DELIVERY_FIELD_CLASS =
  "rounded-2xl border border-[#E8DCCB] bg-[#FFFDFD] px-4 py-3 text-sm font-semibold text-[#222222] shadow-none outline-none transition placeholder:text-[#8b8b8b] focus:border-[#e98a4a] focus:bg-[#fffffd] focus:ring-2 focus:ring-[#e98a4a]/20 disabled:cursor-not-allowed disabled:border-[#E7D8C7] disabled:bg-[#f6ebdd] disabled:text-[#7A5A45] disabled:opacity-75";

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

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  try {
    return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
  } catch {
    return {
      message: String(error),
    };
  }
}

function parseResponsePayload(responseText: string) {
  try {
    return responseText
      ? (JSON.parse(responseText) as Record<string, unknown>)
      : {};
  } catch {
    return { raw: responseText };
  }
}

function buildFetchDebug(params: {
  url: string;
  response: Response;
  responseText: string;
  payload: Record<string, unknown>;
}) {
  return {
    url: params.url,
    status: params.response.status,
    statusText: params.response.statusText,
    ok: params.response.ok,
    body: params.payload,
    rawBody: params.responseText,
  };
}

function toDeliveryStatus(value: unknown): DeliveryStatus {
  if (value === "En camino") return value;
  if (value === "En entrega") return value;
  if (value === "Listo para recoger") return value;
  if (value === "Recogido") return value;
  if (value === "Completado") return value;

  return "Pendiente";
}

function normalizeDeliveryState(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function isFinalDeliveryOrder(order: DeliveryOrder) {
  const status = normalizeDeliveryState(order.status);
  const assignmentStatus = normalizeDeliveryState(order.assignmentStatus);
  const finalStates = new Set([
    "delivered",
    "entregado",
    "pedido_entregado",
    "completado",
    "completed",
    "cancelado",
    "cancelled",
    "rechazado",
    "rejected",
  ]);

  return finalStates.has(status) || finalStates.has(assignmentStatus);
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
      deliveryId:
        safeOrder.deliveryId === null || safeOrder.deliveryId === undefined
          ? null
          : Number(safeOrder.deliveryId),
      driverId:
        safeOrder.driverId === null || safeOrder.driverId === undefined
          ? null
          : Number(safeOrder.driverId),
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
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [deliveryToast, setDeliveryToast] = useState("");
  const [locationError, setLocationError] = useState("");
  const [deliveryConfirmOrder, setDeliveryConfirmOrder] =
    useState<DeliveryOrder | null>(null);
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
  const currentOrdersRef = useRef<DeliveryOrder[]>([]);
  const activeOrderRef = useRef<DeliveryOrder | null>(null);
  const fetchSequenceRef = useRef(0);
  const emptyAssignedPollsRef = useRef(0);
  const locationDeniedRef = useRef(false);
  const locationInFlightRef = useRef(false);
  const driverName = profile.name || user?.name || "Repartidor Gogi";
  const canAccessDelivery = canAccessPanel(user?.roles, "delivery");

  useEffect(() => {
    currentOrdersRef.current = currentOrders;
  }, [currentOrders]);

  useEffect(() => {
    activeOrderRef.current = activeOrder;
  }, [activeOrder]);

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
        driver_status: String(
          profilePayload?.driver_status ??
            (profilePayload?.is_available === false ? "RESTING" : "ACTIVE"),
        ) as DeliveryProfile["driver_status"],
        driver_status_label: String(
          profilePayload?.driver_status_label ??
            (profilePayload?.is_available === false ? "En descanso" : "Activo"),
        ),
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
        console.warn("Ganancias del repartidor no disponibles:", {
          status: response.status,
          statusText: response.statusText,
          error:
            typeof payload.error === "string"
              ? payload.error
              : "Respuesta inválida del servidor.",
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
      console.warn("Ganancias del repartidor no disponibles:", {
        error: error instanceof Error ? error.message : String(error),
      });
      setEarnings(EMPTY_EARNINGS);
    }
  }, []);

  const fetchDeliveryData = useCallback(
    async (options?: { background?: boolean }) => {
      if (typeof window === "undefined") return;

      const isBackgroundRefresh = Boolean(options?.background);
      const requestId = fetchSequenceRef.current + 1;
      fetchSequenceRef.current = requestId;
      const hadCurrentOrders = currentOrdersRef.current.length > 0;
      const hadActiveOrder = Boolean(activeOrderRef.current);
      const shouldKeepPreviousData =
        isBackgroundRefresh || hadCurrentOrders || hadActiveOrder;
      const token = getStoredToken();

      if (!token) {
        emptyAssignedPollsRef.current = 0;
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
        if (shouldKeepPreviousData) {
          setOrdersRefreshing(true);
        } else {
          setOrdersLoading(true);
          setActiveOrderLoading(true);
          setNotificationsLoading(true);
        }
        if (!shouldKeepPreviousData) {
          setOrdersError("");
          setActiveOrderError("");
          setNotificationsError("");
        }

        console.log("[DELIVERY DASHBOARD] inicio", {
          requestId,
          isBackgroundRefresh,
          hadCurrentOrders,
          hadActiveOrder,
        });

        const [
          dashboardResponse,
          ordersResponse,
          activeOrderResponse,
          notificationsResponse,
        ] = await Promise.all([
          fetchWithSession("/api/delivery/dashboard", {
            headers: buildAuthHeaders(),
          }),
          fetchWithSession("/api/delivery/orders", {
            headers: buildAuthHeaders(),
          }),
          fetchWithSession("/api/delivery/active-order", {
            headers: buildAuthHeaders(),
          }),
          fetchWithSession("/api/delivery/notifications", {
            headers: buildAuthHeaders(),
          }),
        ]);

        if (requestId !== fetchSequenceRef.current) {
          console.log("[delivery-panel] fetch ignored stale response", {
            requestId,
            latestRequestId: fetchSequenceRef.current,
          });
          return;
        }
        const dashboardResponseText = await dashboardResponse.text();
        const dashboardPayload = parseResponsePayload(dashboardResponseText);

        if (
          isAuthErrorStatus(dashboardResponse.status) ||
          isAuthErrorStatus(ordersResponse.status) ||
          isAuthErrorStatus(activeOrderResponse.status) ||
          isAuthErrorStatus(notificationsResponse.status)
        ) {
          emptyAssignedPollsRef.current = 0;
          setCurrentOrders([]);
          setActiveOrder(null);
          setDeliveryNotifications([]);
          if (!shouldKeepPreviousData) {
            setActiveDeliveriesCount(EMPTY_DASHBOARD_STATS.activeDeliveries);
            setCompletedTodayCount(EMPTY_DASHBOARD_STATS.completedDeliveries);
          }
          setOrdersError(
            "Tu sesión expiró o no tienes permisos de repartidor.",
          );
          setActiveOrderError("");
          setNotificationsError("");
          return;
        }

        if (!dashboardResponse.ok || dashboardPayload.success === false) {
          console.warn(
            "[DELIVERY DASHBOARD ERROR]",
            buildFetchDebug({
              url: "/api/delivery/dashboard",
              response: dashboardResponse,
              responseText: dashboardResponseText,
              payload: dashboardPayload,
            }),
          );
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
        const ordersPayload = parseResponsePayload(ordersResponseText);

        const parsedOrders = parseDeliveryOrders(ordersPayload, {
          isAvailableDelivery: false,
          canReject: true,
        }).filter((order) => !isFinalDeliveryOrder(order));
        let visibleOrders: DeliveryOrder[] = [];

        if (!ordersResponse.ok || ordersPayload.success === false) {
          console.warn(
            "[DELIVERY ORDERS ERROR]",
            buildFetchDebug({
              url: "/api/delivery/orders",
              response: ordersResponse,
              responseText: ordersResponseText,
              payload: ordersPayload,
            }),
          );
          if (!shouldKeepPreviousData) {
            setOrdersError(
              (typeof ordersPayload.error === "string" &&
                ordersPayload.error) ||
                "No se pudieron cargar tus entregas. Intenta de nuevo.",
            );
          }
        }

        if (ordersResponse.ok && ordersPayload.success !== false) {
          visibleOrders = Array.from(
            new Map(parsedOrders.map((order) => [order.id, order])).values(),
          );
        }

        if (ordersResponse.ok && ordersPayload.success !== false) {
          setOrdersError("");
        }

        const shouldPreserveOrdersOnEmpty =
          shouldKeepPreviousData &&
          visibleOrders.length === 0 &&
          currentOrdersRef.current.length > 0 &&
          emptyAssignedPollsRef.current < 1;

        if (visibleOrders.length === 0) {
          emptyAssignedPollsRef.current += 1;
        } else {
          emptyAssignedPollsRef.current = 0;
        }

        console.log("[DELIVERY DASHBOARD] activeDeliveries", {
          requestId,
          count: visibleOrders.length,
          orders: visibleOrders.map((order) => ({
            id: order.id,
            deliveryId: order.deliveryId,
            driverId: order.driverId,
            assignmentStatus: order.assignmentStatus,
            status: order.status,
            isAvailableDelivery: order.isAvailableDelivery,
            canRespond: order.canRespond,
          })),
          preservedPrevious: shouldPreserveOrdersOnEmpty,
          emptyAssignedPolls: emptyAssignedPollsRef.current,
        });

        if (!shouldPreserveOrdersOnEmpty) {
          setCurrentOrders(visibleOrders);
        }

        const activeOrderResponseText = await activeOrderResponse.text();
        const activeOrderPayload = parseResponsePayload(
          activeOrderResponseText,
        );

        if (!activeOrderResponse.ok || activeOrderPayload.success === false) {
          console.warn(
            "[DELIVERY ACTIVE ORDER ERROR]",
            buildFetchDebug({
              url: "/api/delivery/active-order",
              response: activeOrderResponse,
              responseText: activeOrderResponseText,
              payload: activeOrderPayload,
            }),
          );
          if (!shouldKeepPreviousData) {
            setActiveOrder(null);
            setActiveOrderError(
              (typeof activeOrderPayload.error === "string" &&
                activeOrderPayload.error) ||
                "No se pudo cargar tu entrega activa.",
            );
          }
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
          const shouldPreserveActiveOrder =
            shouldKeepPreviousData &&
            Boolean(activeOrderRef.current) &&
            emptyAssignedPollsRef.current <= 1;

          console.log("[delivery-panel] active order empty", {
            requestId,
            preservedPrevious: shouldPreserveActiveOrder,
            previousOrderId: activeOrderRef.current?.id ?? null,
          });

          if (!shouldPreserveActiveOrder) {
            setActiveOrder(null);
          }
          setActiveOrderError("");
        } else {
          const nextActiveOrder = {
            id: String(activeOrderData.id ?? ""),
            deliveryId:
              activeOrderData.deliveryId === null ||
              activeOrderData.deliveryId === undefined
                ? null
                : Number(activeOrderData.deliveryId),
            driverId:
              activeOrderData.driverId === null ||
              activeOrderData.driverId === undefined
                ? null
                : Number(activeOrderData.driverId),
            folio: String(activeOrderData.folio ?? activeOrderData.id ?? ""),
            status: toDeliveryStatus(activeOrderData.status),
            eta: "Por confirmar",
            paymentMethod: String(
              activeOrderData.paymentMethod ?? "Sin método",
            ),
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
          };

          console.log("[delivery-panel] active order result", {
            requestId,
            id: nextActiveOrder.id,
            status: nextActiveOrder.status,
            driverId:
              "driverId" in activeOrderData
                ? String(activeOrderData.driverId ?? "")
                : null,
          });

          setActiveOrder(nextActiveOrder);

          setActiveOrderError("");
        }

        const notificationsResponseText = await notificationsResponse.text();
        const notificationsPayload = parseResponsePayload(
          notificationsResponseText,
        );

        if (
          !notificationsResponse.ok ||
          notificationsPayload.success === false
        ) {
          console.warn(
            "[DELIVERY NOTIFICATIONS ERROR]",
            buildFetchDebug({
              url: "/api/delivery/notifications",
              response: notificationsResponse,
              responseText: notificationsResponseText,
              payload: notificationsPayload,
            }),
          );
          if (!shouldKeepPreviousData) {
            setDeliveryNotifications([]);
          }
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
                  notification.folio === null ||
                  notification.folio === undefined
                    ? null
                    : String(notification.folio),
                unread: !notification.isRead,
              }))
            : [];

          console.log("[DELIVERY DASHBOARD] offers", {
            count: 0,
          });
          console.log("[delivery-panel] respuesta panel repartidor:", {
            activeDeliveries: visibleOrders.length,
            notifications: parsedNotifications.length,
          });

          setDeliveryNotifications(parsedNotifications);
          setNotificationsError("");
        }
      } catch (error) {
        console.warn("[DELIVERY DASHBOARD ERROR]", serializeError(error));
        if (!shouldKeepPreviousData) {
          setCurrentOrders([]);
          setActiveOrder(null);
          setDeliveryNotifications([]);
          setActiveDeliveriesCount(EMPTY_DASHBOARD_STATS.activeDeliveries);
          setCompletedTodayCount(EMPTY_DASHBOARD_STATS.completedDeliveries);
        }
        if (!shouldKeepPreviousData) {
          setOrdersError(
            "No se pudieron cargar tus entregas. Intenta de nuevo.",
          );
          setActiveOrderError("No se pudo cargar tu entrega activa.");
          setNotificationsError(
            "No se pudieron cargar tus notificaciones. Intenta de nuevo.",
          );
        }
      } finally {
        setOrdersLoading(false);
        setActiveOrderLoading(false);
        setNotificationsLoading(false);
        setOrdersRefreshing(false);
      }
    },
    [],
  );

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
    if (!user || !canAccessDelivery) return;

    const tasks: Array<Promise<void>> = [fetchDeliveryData(), fetchEarnings()];

    if (historyOpen) {
      tasks.push(fetchDeliveryHistory());
    }

    await Promise.all(tasks);
  }, [
    canAccessDelivery,
    fetchDeliveryData,
    fetchDeliveryHistory,
    fetchEarnings,
    historyOpen,
    user,
  ]);

  const handleOpenHistory = useCallback(async () => {
    if (!user || !canAccessDelivery) return;

    setHistoryOpen(true);
    await fetchDeliveryHistory();
  }, [canAccessDelivery, fetchDeliveryHistory, user]);

  useEffect(() => {
    if (!user || !canAccessDelivery) return;

    fetchDeliveryData();

    const intervalId = window.setInterval(() => {
      fetchDeliveryData({ background: true });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canAccessDelivery, fetchDeliveryData, user]);

  useEffect(() => {
    if (!user || !canAccessDelivery) return;

    fetchDriverProfile();
  }, [canAccessDelivery, fetchDriverProfile, user]);

  useEffect(() => {
    if (!user || !canAccessDelivery) return;

    fetchEarnings();

    const intervalId = window.setInterval(() => {
      fetchEarnings();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canAccessDelivery, fetchEarnings, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user || !canAccessDelivery) return;

    const shouldTrackLocation =
      profile.driver_status_label === "Activo" || Boolean(activeOrder);

    if (!shouldTrackLocation) {
      locationDeniedRef.current = false;
      locationInFlightRef.current = false;
      setLocationError("");
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocationError("GPS no disponible en este dispositivo.");
      return;
    }

    let cancelled = false;

    const setStableLocationError = (message: string) => {
      setLocationError((current) => (current === message ? current : message));
    };

    const sendLocation = () => {
      if (locationDeniedRef.current || locationInFlightRef.current) {
        return;
      }

      locationInFlightRef.current = true;
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled) return;

          try {
            const response = await fetchWithSession("/api/delivery/location", {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }),
            });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as {
                error?: string;
              } | null;
              setStableLocationError(
                payload?.error || "No se pudo actualizar tu ubicación.",
              );
              return;
            }

            locationDeniedRef.current = false;
            setLocationError((current) => (current ? "" : current));
          } catch (error) {
            console.warn("No se pudo enviar ubicación del repartidor:", error);
            setStableLocationError("No se pudo actualizar tu ubicación.");
          } finally {
            locationInFlightRef.current = false;
          }
        },
        (error) => {
          if (cancelled) return;

          if (error.code === error.PERMISSION_DENIED) {
            locationDeniedRef.current = true;
            setStableLocationError(
              "Activa el permiso de ubicación para compartir tu ruta.",
            );
          } else {
            setStableLocationError("No se pudo obtener tu ubicación actual.");
          }
          locationInFlightRef.current = false;
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 12000,
        },
      );
    };

    sendLocation();
    const intervalId = window.setInterval(sendLocation, 45000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeOrder, canAccessDelivery, profile.driver_status_label, user]);

  const showDeliveryToast = useCallback((message: string) => {
    setDeliveryToast(message);
    window.setTimeout(() => {
      setDeliveryToast("");
    }, 3500);
  }, []);

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
        showDeliveryToast("No se pudo responder la asignación.");
      } finally {
        setAssignmentActionOrderId(null);
      }
    },
    [refreshDeliveryPanel, showDeliveryToast],
  );

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
    async (
      orderId: string,
      status:
        | "to_business"
        | "arrived_business"
        | "recogido"
        | "on_the_way"
        | "incident"
        | "delivered",
    ) => {
      if (typeof window === "undefined") return;

      const token = getStoredToken();

      if (!token) {
        setOrdersError("Debes iniciar sesión para actualizar la entrega.");
        return false;
      }

      try {
        setAssignmentActionOrderId(orderId);
        if (status === "delivered") {
          console.log("Marcando entregado", orderId);
        }

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
        if (status === "delivered") {
          console.log("Respuesta API", response.status, payload);
        }

        if (isAuthErrorStatus(response.status)) {
          setOrdersError(
            "Tu sesión expiró o no tienes permisos de repartidor.",
          );
          return false;
        }

        if (!response.ok || payload.success === false) {
          const message =
            (typeof payload.error === "string" && payload.error) ||
            "No se pudo actualizar la entrega.";
          setOrdersError(message);
          showDeliveryToast(message);
          return false;
        }

        if (status === "delivered") {
          currentOrdersRef.current = currentOrdersRef.current.filter(
            (order) => order.id !== orderId,
          );
          if (activeOrderRef.current?.id === orderId) {
            activeOrderRef.current = null;
          }
          setCurrentOrders((current) =>
            current.filter((order) => order.id !== orderId),
          );
          setActiveOrder((current) =>
            current?.id === orderId ? null : current,
          );
          setCompletedTodayCount((current) => current + 1);
          setActiveDeliveriesCount((current) => Math.max(0, current - 1));
          showDeliveryToast("Pedido marcado como entregado");
        }

        setOrdersError("");
        await refreshDeliveryPanel();
        return true;
      } catch (error) {
        console.error("Error actualizando estado de entrega:", error);
        setOrdersError("No se pudo actualizar la entrega.");
        showDeliveryToast("No se pudo actualizar la entrega.");
        return false;
      } finally {
        setAssignmentActionOrderId(null);
      }
    },
    [refreshDeliveryPanel, showDeliveryToast],
  );

  const handleMarkDelivered = useCallback(
    (orderId: string) => {
      const order =
        currentOrdersRef.current.find((current) => current.id === orderId) ??
        activeOrderRef.current;

      if (!order || order.id !== orderId) {
        setOrdersError("No encontramos esta entrega en la lista actual.");
        showDeliveryToast("No encontramos esta entrega en la lista actual.");
        return;
      }

      setDeliveryConfirmOrder(order);
    },
    [showDeliveryToast],
  );

  const handleConfirmDeliveredFromDialog = useCallback(async () => {
    if (!deliveryConfirmOrder) return;

    const success = await handleDeliveryStatusUpdate(
      deliveryConfirmOrder.id,
      "delivered",
    );
    if (success) {
      setDeliveryConfirmOrder(null);
    }
  }, [deliveryConfirmOrder, handleDeliveryStatusUpdate]);

  const handleCancelDeliveredDialog = useCallback(
    () => setDeliveryConfirmOrder(null),
    [],
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
      formData.append("driver_status", profileForm.driver_status);

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
        driver_status: String(
          savedProfile?.driver_status ?? profileForm.driver_status,
        ) as DeliveryProfile["driver_status"],
        driver_status_label: String(
          savedProfile?.driver_status_label ??
            (savedProfile?.is_available === false ? "En descanso" : "Activo"),
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

  const updateOperationalStatus = useCallback(
    async (
      nextIsAvailable: boolean,
      driverStatus: "ACTIVE" | "RESTING" | "OFFLINE",
    ) => {
      const token = getStoredToken();

      if (!token) {
        setProfileError("Debes iniciar sesión para actualizar tu estado.");
        return;
      }

      const previousProfile = profile;
      const nextProfile = {
        ...profile,
        is_available: nextIsAvailable,
        driver_status: driverStatus,
        driver_status_label:
          driverStatus === "OFFLINE"
            ? "Desconectado"
            : nextIsAvailable
              ? "Activo"
              : "En descanso",
      };
      setProfile(nextProfile);
      setProfileForm((current) => ({
        ...current,
        is_available: nextIsAvailable,
        driver_status: driverStatus,
      }));

      try {
        console.log("Estado delivery antes:", previousProfile.driver_status);
        console.log("Cambiando estado a:", driverStatus);
        const formData = new FormData();
        formData.append("name", nextProfile.name || driverName);
        formData.append("phone", nextProfile.phone);
        formData.append("delivery_zone", nextProfile.delivery_zone);
        formData.append("vehicle_type", nextProfile.vehicle_type);
        formData.append("vehicle_plate", nextProfile.vehicle_plate);
        formData.append("delivery_notes", nextProfile.delivery_notes);
        formData.append("is_available", nextIsAvailable ? "1" : "0");
        formData.append("status_only", "1");
        formData.append("driver_status", driverStatus);

        const response = await fetchWithSession("/api/delivery/profile", {
          method: "PATCH",
          body: formData,
        });
        const payload = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        console.log("Respuesta estado:", payload);

        if (!response.ok || payload?.success === false) {
          throw new Error(
            (typeof payload?.error === "string" && payload.error) ||
              "No se pudo actualizar el estado operativo.",
          );
        }

        const savedProfile =
          payload?.profile && typeof payload.profile === "object"
            ? (payload.profile as Record<string, unknown>)
            : null;
        const syncedProfile: DeliveryProfile = {
          name: String(savedProfile?.name ?? nextProfile.name ?? driverName),
          phone: String(savedProfile?.phone ?? nextProfile.phone),
          profile_image_url:
            getProfileImageUrl(savedProfile) ?? nextProfile.profile_image_url,
          delivery_zone: String(
            savedProfile?.delivery_zone ?? nextProfile.delivery_zone,
          ),
          vehicle_type: String(
            savedProfile?.vehicle_type ?? nextProfile.vehicle_type,
          ),
          vehicle_plate: String(
            savedProfile?.vehicle_plate ?? nextProfile.vehicle_plate,
          ),
          delivery_notes: String(
            savedProfile?.delivery_notes ?? nextProfile.delivery_notes,
          ),
          is_available: Boolean(
            savedProfile?.is_available ?? nextProfile.is_available,
          ),
          driver_status: String(
            savedProfile?.driver_status ?? nextProfile.driver_status,
          ) as DeliveryProfile["driver_status"],
          driver_status_label: String(
            savedProfile?.driver_status_label ??
              (savedProfile?.is_available === false ? "En descanso" : "Activo"),
          ),
        };

        setProfile(syncedProfile);
        setProfileForm((current) => ({
          ...current,
          is_available: syncedProfile.is_available,
          driver_status: syncedProfile.driver_status,
        }));
        showDeliveryToast(
          syncedProfile.driver_status === "ACTIVE"
            ? "Ya estás activo para recibir pedidos"
            : syncedProfile.driver_status === "OFFLINE"
              ? "Te desconectaste del reparto"
              : "Pausaste las entregas",
        );
      } catch (error) {
        console.error("Error sincronizando estado operativo:", error);
        setProfile(previousProfile);
        setProfileForm((current) => ({
          ...current,
          is_available: previousProfile.is_available,
          driver_status: previousProfile.driver_status,
        }));
        setProfileError(
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el estado operativo.",
        );
        throw error;
      }
    },
    [driverName, profile, showDeliveryToast],
  );

  const handleAvailabilityChange = useCallback(
    async (nextIsAvailable: boolean) => {
      await updateOperationalStatus(
        nextIsAvailable,
        nextIsAvailable ? "ACTIVE" : "RESTING",
      );
    },
    [updateOperationalStatus],
  );

  const handleGoOffline = useCallback(async () => {
    await updateOperationalStatus(false, "OFFLINE");
  }, [updateOperationalStatus]);

  if (user && !canAccessDelivery) {
    return (
      <main className="min-h-screen bg-[#F6F0E7] px-4 py-12 text-[#4B3425]">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] p-8 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
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
    <main className="min-h-screen bg-[#F6F0E7] text-[#4B3425]">
      {deliveryToast ? (
        <div className="fixed right-4 top-24 z-[60] rounded-2xl border border-[#86efac] bg-[#dcfce7] px-5 py-3 text-sm font-extrabold text-[#166534] shadow-[0_12px_30px_rgba(34,197,94,0.22)]">
          {deliveryToast}
        </div>
      ) : null}
      {locationError ? (
        <div className="fixed left-4 top-24 z-[60] max-w-sm rounded-2xl border border-[#fed7aa] bg-[#fff7ed] px-5 py-3 text-sm font-bold text-[#9a3412] shadow-[0_12px_30px_rgba(180,140,90,0.14)]">
          {locationError}
        </div>
      ) : null}
      <div className="min-h-screen bg-[#F6F0E7]">
        <div className="section-shell responsive-stack py-5 sm:py-7 lg:py-8">
          <DeliveryHeader
            driverName={driverName}
            profileImageUrl={profile.profile_image_url}
            serviceArea={profile.delivery_zone || "Sin zona configurada"}
            isAvailable={profile.is_available}
            operationalStatus={profile.driver_status}
            operationalStatusLabel={profile.driver_status_label}
            pendingOrders={activeDeliveriesCount}
            completedToday={completedTodayCount}
            lastSync="Actualizado ahora"
            onLogout={logout}
            onAvailabilityChange={handleAvailabilityChange}
            onGoOffline={handleGoOffline}
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
              isRefreshing={ordersRefreshing}
              error={ordersError}
              actionLoadingOrderId={assignmentActionOrderId}
              onAcceptOrder={(orderId) =>
                handleAssignmentResponse(orderId, "accept")
              }
              onRejectOrder={(orderId) =>
                handleAssignmentResponse(orderId, "reject")
              }
              onGoToBusiness={(orderId) =>
                handleDeliveryStatusUpdate(orderId, "to_business")
              }
              onArrivedBusiness={(orderId) =>
                handleDeliveryStatusUpdate(orderId, "arrived_business")
              }
              onMarkPickedUp={(orderId) =>
                handleDeliveryStatusUpdate(orderId, "recogido")
              }
              onMarkOnTheWay={(orderId) =>
                handleDeliveryStatusUpdate(orderId, "on_the_way")
              }
              onReportIncident={(orderId) =>
                handleDeliveryStatusUpdate(orderId, "incident")
              }
              onMarkDelivered={handleMarkDelivered}
              onViewSummary={(order) => setActiveOrder(order)}
            />

            <div className="space-y-6">
              {activeOrder ? (
                <LocationCard order={activeOrder} />
              ) : activeOrderLoading ? (
                <div className="rounded-[24px] border border-dashed border-[#E7D8C7] bg-[#FFF9F2] p-6 text-sm text-[#6c5a49] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  Cargando entrega activa...
                </div>
              ) : activeOrderError ? (
                <div className="rounded-[24px] border border-dashed border-[#EDCDB4] bg-[#FFF3E9] p-6 text-sm text-[#975731] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  {activeOrderError}
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-[#E7D8C7] bg-[#FFF9F2] p-6 text-sm text-[#6c5a49] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  No tienes entregas asignadas por ahora.
                </div>
              )}
              <div className="rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] p-5 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
                <p className="text-xs font-extrabold uppercase tracking-[0.26em] text-[#b36a2b]">
                  Perfil operativo
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#E7D8C7] bg-[#F6F0E7] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                      Zona activa
                    </p>
                    <p className="mt-2 font-semibold text-[#2f2419]">
                      {profile.delivery_zone || "Sin zona configurada"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#E7D8C7] bg-[#F6F0E7] p-4">
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
          <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#D8C2AA]/70 bg-[#FFF9F2] px-6 py-5">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-orange-700/70">
                  Historial real
                </p>
                <h2 className="mt-2 text-2xl font-black text-[#2B1A12]">
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

            <div className="overflow-y-auto bg-[#F6F0E7] px-4 py-4 sm:px-6 sm:py-6">
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
                      className="rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] p-5 shadow-[0_8px_30px_rgba(180,140,90,0.08)]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-orange-700/70">
                            {entry.folio}
                          </p>
                          <h3 className="mt-2 text-xl font-black text-[#2B1A12]">
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
                          <p className="mt-2 text-lg font-black text-[#2B1A12]">
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
                          <p className="mt-2 font-semibold text-[#2B1A12]">
                            {formatCurrency(entry.total, earnings.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8d755b]">
                            Costo de envio
                          </p>
                          <p className="mt-2 font-semibold text-[#2B1A12]">
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
                          <p className="mt-2 font-semibold text-[#2B1A12]">
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
          <div className="w-full max-w-xl rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] p-4 shadow-[0_8px_30px_rgba(180,140,90,0.08)] sm:p-6">
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
                  className={`${DELIVERY_FIELD_CLASS} mt-2 block w-full file:mr-4 file:rounded-full file:border-0 file:bg-[#f6ebdd] file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-[#222222]`}
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
                  className={`${DELIVERY_FIELD_CLASS} mt-2 w-full resize-none`}
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
                className="rounded-full bg-[linear-gradient(135deg,#d36a1f_0%,#f08d3c_100%)] px-5 py-2.5 text-sm font-bold text-[#FFFDF8] shadow-[0_8px_30px_rgba(180,140,90,0.08)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assignmentActionOrderId === deliveryEvidence.orderId
                  ? "Guardando evidencia..."
                  : "Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deliveryConfirmOrder ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(47,36,25,0.26)] px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
          <div className="w-full max-w-lg rounded-[28px] border border-[#E7D8C7] bg-[#FFF9F2] p-5 text-[#2f2419] shadow-[0_22px_70px_rgba(88,62,35,0.18)] sm:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-[#22a05a]">
              Confirmar entrega
            </p>
            <h2 className="mt-3 text-2xl font-black">
              ¿Confirmas que ya entregaste este pedido?
            </h2>
            <div className="mt-4 rounded-2xl border border-[#E7D8C7] bg-[#FFFDF8] p-4">
              <p className="text-sm font-extrabold text-[#4B3425]">
                #{deliveryConfirmOrder.id} ·{" "}
                {deliveryConfirmOrder.businessName || "Negocio"}
              </p>
              <p className="mt-1 text-sm text-[#6F5D4C]">
                Cliente: {deliveryConfirmOrder.contact.name}
              </p>
              <p className="mt-1 text-sm text-[#6F5D4C]">
                {deliveryConfirmOrder.fullAddress ||
                  deliveryConfirmOrder.address.fullAddress ||
                  deliveryConfirmOrder.address.street}
              </p>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#6F5D4C]">
              Al confirmar, el pedido se marcará como entregado, se guardará la
              hora de entrega y desaparecerá de tus entregas actuales.
            </p>

            <div className="mt-6 grid gap-3 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={handleCancelDeliveredDialog}
                disabled={assignmentActionOrderId === deliveryConfirmOrder.id}
                className="rounded-full border border-[#dcc7b0] bg-white px-5 py-2.5 text-sm font-bold text-[#6e5d4b] transition hover:bg-[#faf2e8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeliveredFromDialog}
                disabled={assignmentActionOrderId === deliveryConfirmOrder.id}
                className="rounded-full bg-[#22c55e] px-5 py-2.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(34,197,94,0.22)] transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {assignmentActionOrderId === deliveryConfirmOrder.id
                  ? "Marcando entregado..."
                  : "Sí, marcar entregado"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(247,241,232,0.82)] px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
          <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#D8C2AA]/70 bg-[#FFF9F2] px-6 py-5">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-[#b36a2b]/80">
                  Configuración
                </p>
                <h2 className="mt-2 text-2xl font-black text-[#2B1A12]">
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

            <div className="overflow-y-auto bg-[#F6F0E7] px-6 py-6">
              <div className="grid gap-6 lg:grid-cols-[0.8fr,1.2fr]">
                <section className="rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] p-5 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
                  <p className="text-sm font-bold text-[#2B1A12]">
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
                      className="rounded-2xl bg-[#FF6A00] px-4 py-2 text-sm font-extrabold text-[#FFFDF8]"
                    >
                      {avatarPreview ? "Cambiar foto" : "Subir foto"}
                    </button>
                  </div>
                </section>

                <section className="rounded-[24px] border border-[#E7D8C7] bg-[#FFF9F2] p-5 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 md:col-span-2">
                      <span className="text-sm font-bold text-[#2B1A12]">
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
                        className={DELIVERY_FIELD_CLASS}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#2B1A12]">
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
                        className={DELIVERY_FIELD_CLASS}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#2B1A12]">
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
                        className={DELIVERY_FIELD_CLASS}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#2B1A12]">
                        Estado
                      </span>
                      <select
                        value={
                          profileForm.driver_status === "OFFLINE"
                            ? "offline"
                            : profileForm.driver_status === "ACTIVE"
                              ? "activo"
                              : "pausado"
                        }
                        onChange={(event) =>
                          setProfileForm((prev) => ({
                            ...prev,
                            is_available: event.target.value === "activo",
                            driver_status:
                              event.target.value === "activo"
                                ? "ACTIVE"
                                : event.target.value === "offline"
                                  ? "OFFLINE"
                                  : "RESTING",
                          }))
                        }
                        className={DELIVERY_FIELD_CLASS}
                      >
                        <option value="activo">Activo</option>
                        <option value="pausado">Pausado</option>
                        <option value="offline">Desconectado</option>
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#2B1A12]">
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
                        className={DELIVERY_FIELD_CLASS}
                      >
                        <option value="">Selecciona</option>
                        <option value="moto">Moto</option>
                        <option value="bicicleta">Bicicleta</option>
                        <option value="auto">Auto</option>
                        <option value="a_pie">A pie</option>
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-[#2B1A12]">
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
                        className={DELIVERY_FIELD_CLASS}
                        placeholder="Solo si aplica"
                      />
                    </label>
                    <label className="grid gap-2 md:col-span-2">
                      <span className="text-sm font-bold text-[#2B1A12]">
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
                        className={DELIVERY_FIELD_CLASS}
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
                      className="rounded-2xl bg-[linear-gradient(135deg,#d36a1f_0%,#f08d3c_100%)] px-5 py-3 text-sm font-extrabold text-[#FFFDF8] shadow-[0_8px_24px_rgba(217,122,55,0.18)] disabled:opacity-60"
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
