"use client";

import {
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileQuestion,
  Filter,
  GraduationCap,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Store,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

const DEFAULT_BUSINESS = {
  id: null,
  name: "Tu negocio",
  category: "negocio",
  location: "Ubicacion por definir",
  hours: "Horario por definir",
  productsCount: 0,
  updatedAt: null as string | null,
};

const TOKEN_STORAGE_KEYS = [
  "token",
  "authToken",
  "access_token",
  "gogi_token",
  "userToken",
  "accessToken",
];

const MXN_CURRENCY_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const ACTIVE_ORDER_STATUSES = new Set([
  "pendiente",
  "por_validar_pago",
  "pago_validado",
  "en_preparacion",
  "preparando",
  "listo_para_recoger",
  "repartidor_solicitado",
  "repartidor_asignado",
]);

const HISTORY_ORDER_STATUSES = new Set([
  "pedido_entregado",
  "entregado",
  "completado",
]);

type OrderTicket = {
  orderId: number;
  id: string;
  negocio: string;
  total: string;
  estado: string;
  hora: string;
  cliente: string;
  metodoPago: string;
  direccion: string;
  notas?: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    precio: string;
    extras?: string;
  }>;
  deliveryRequested?: boolean;
};

type ManagerSection = "dashboard" | "orders";

type NewOrderData = {
  cliente: string;
  direccion: string;
  metodoPago: string;
  itemNombre: string;
  cantidad: number;
  precio: number;
  notas?: string;
};

type DashboardMode = "business" | "seller";

type BusinessSummary = {
  id: number | null;
  name: string;
  category: string;
  location: string;
  hours: string;
  productsCount: number;
  updatedAt: string | null;
};

type SellerTrainingOption = {
  id: number;
  text: string;
  isCorrect: boolean;
};

type SellerTrainingQuestion = {
  id: number;
  question: string;
  options: SellerTrainingOption[];
};

type SellerTrainingAssignment = {
  assignment_id: number;
  training_id: number;
  business_id: number;
  business_name: string;
  title: string;
  description: string;
  type: "video" | "test" | "video_test";
  video_url: string;
  passing_score: number;
  status: string;
  due_date: string | null;
  video_completed_at: string | null;
  score: number;
  passed: boolean | null;
  completed_at: string | null;
  questions: SellerTrainingQuestion[];
};

function getStoredToken() {
  if (typeof window === "undefined") return null;

  for (const key of TOKEN_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);

    if (value?.trim()) {
      return value.trim();
    }
  }

  return null;
}

function toSafeNumber(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value ?? 0);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeBusinessStatus(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function formatTime(value: unknown) {
  const date = new Date(String(value ?? new Date().toISOString()));

  if (Number.isNaN(date.getTime())) {
    return "Sin hora";
  }

  return date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastSync(value: string | null) {
  if (!value) {
    return "Sincronizacion reciente";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sincronizacion reciente";
  }

  return `Actualizado ${date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

function formatShortDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isButcheryCategory(category: string) {
  const normalized = normalizeBusinessStatus(category);

  return (
    normalized.includes("carnicer") ||
    normalized.includes("carne") ||
    normalized.includes("corte")
  );
}

export function BusinessManagerDashboard({ mode }: { mode: DashboardMode }) {
  const pathname = usePathname();
  const [orders, setOrders] = useState<OrderTicket[]>([]);
  const [business, setBusiness] = useState<BusinessSummary>(DEFAULT_BUSINESS);
  const [businessError, setBusinessError] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<OrderTicket | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderTicket | null>(null);
  const [activeSection, setActiveSection] =
    useState<ManagerSection>("dashboard");
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [sellerTrainings, setSellerTrainings] = useState<
    SellerTrainingAssignment[]
  >([]);
  const [trainingsLoading, setTrainingsLoading] = useState(false);
  const [trainingsError, setTrainingsError] = useState("");
  const [openTrainingId, setOpenTrainingId] = useState<number | null>(null);
  const [trainingAnswers, setTrainingAnswers] = useState<
    Record<number, Record<number, number>>
  >({});
  const [actionLoading, setActionLoading] = useState<{
    orderId: number | null;
    type: "ready" | "delivery" | null;
  }>({ orderId: null, type: null });
  const [trainingActionLoading, setTrainingActionLoading] = useState<{
    assignmentId: number | null;
    type: "video" | "test" | null;
  }>({ assignmentId: null, type: null });
  const [actionFeedback, setActionFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const productLabel = useMemo(
    () => (isButcheryCategory(business.category) ? "Cortes" : "Productos"),
    [business.category],
  );
  const inventoryDescription = isButcheryCategory(business.category)
    ? "inventario de cortes"
    : "catalogo de productos";
  const panelLabel =
    mode === "seller" ? "Panel de vendedor" : "Panel de negocio";
  const backHref = mode === "seller" ? "/pickdash" : "/business";
  const backLabel =
    mode === "seller"
      ? "Volver al selector de paneles"
      : "Volver al panel de negocio";

  const activeOrders = orders.filter((order) =>
    ACTIVE_ORDER_STATUSES.has(normalizeBusinessStatus(order.estado)),
  );
  const historyOrders = orders.filter((order) =>
    HISTORY_ORDER_STATUSES.has(normalizeBusinessStatus(order.estado)),
  );
  const activePreparationCount = activeOrders.filter((order) =>
    ["en_preparacion", "preparando", "listo_para_recoger"].includes(
      normalizeBusinessStatus(order.estado),
    ),
  ).length;
  const dashboardMetrics = [
    {
      label: "Pedidos activos",
      value: String(activeOrders.length),
      delta: "Activos ahora",
      tone: "orange" as const,
    },
    {
      label: "En preparacion",
      value: String(activePreparationCount),
      delta: "Preparacion y recoleccion",
      tone: "amber" as const,
    },
    {
      label: "Entregados",
      value: String(historyOrders.length),
      delta: "En historial",
      tone: "sky" as const,
    },
    {
      label: productLabel,
      value: `${business.productsCount} ${productLabel.toLowerCase()}`,
      delta: "Resumen del catalogo",
      tone: "rose" as const,
    },
  ] as const;
  const pendingTrainings = sellerTrainings.filter((training) =>
    ["pendiente", "en_progreso"].includes(
      normalizeBusinessStatus(training.status),
    ),
  );
  const completedTrainings = sellerTrainings.filter((training) =>
    ["aprobado", "reprobado"].includes(
      normalizeBusinessStatus(training.status),
    ),
  );

  const loadBusinessProfile = useCallback(async () => {
    const token = getStoredToken();

    if (!token) {
      setBusiness(DEFAULT_BUSINESS);
      setBusinessError("Debes iniciar sesion nuevamente.");
      return;
    }

    try {
      setBusinessError("");

      const response = await fetch("/api/business/me", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const responseText = await response.text();
      let data: Record<string, unknown> = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok || data.success === false) {
        console.error("Error cargando perfil del negocio:", {
          status: response.status,
          statusText: response.statusText,
          responseText,
          data,
        });
        setBusiness(DEFAULT_BUSINESS);
        setBusinessError(
          (typeof data.error === "string" && data.error) ||
            (typeof data.message === "string" && data.message) ||
            "No se pudo cargar la informacion del negocio.",
        );
        return;
      }

      const businessPayload =
        data.business && typeof data.business === "object"
          ? (data.business as Record<string, unknown>)
          : null;

      if (!businessPayload) {
        setBusiness(DEFAULT_BUSINESS);
        setBusinessError(
          "Este usuario no tiene un negocio asignado actualmente.",
        );
        return;
      }

      const locationParts = [
        typeof businessPayload.city === "string" ? businessPayload.city : "",
        typeof businessPayload.district === "string"
          ? businessPayload.district
          : "",
      ].filter(Boolean);
      const hourRows = Array.isArray(data.hours)
        ? (data.hours as Array<Record<string, unknown>>)
        : [];
      const hasOpenHours = hourRows.some(
        (row) => !row.is_closed && row.open_time && row.close_time,
      );

      setBusiness({
        id: Number(businessPayload.id ?? 0) || null,
        name:
          (typeof businessPayload.name === "string" && businessPayload.name) ||
          DEFAULT_BUSINESS.name,
        category:
          (typeof businessPayload.category_name === "string" &&
            businessPayload.category_name) ||
          (typeof businessPayload.category === "string" &&
            businessPayload.category) ||
          DEFAULT_BUSINESS.category,
        location: locationParts.join(", ") || DEFAULT_BUSINESS.location,
        hours: hasOpenHours ? "Horario disponible" : DEFAULT_BUSINESS.hours,
        productsCount: toSafeNumber(data.products_count),
        updatedAt:
          typeof businessPayload.updated_at === "string"
            ? businessPayload.updated_at
            : null,
      });
    } catch (error) {
      console.error("Error cargando perfil del negocio:", error);
      setBusiness(DEFAULT_BUSINESS);
      setBusinessError("No se pudo cargar la informacion del negocio.");
    }
  }, []);

  const loadOrders = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading ?? true;
      const token = getStoredToken();

      if (!token) {
        setOrders([]);
        if (showLoading) {
          setOrdersLoading(false);
        }
        setOrdersError("Debes iniciar sesion nuevamente.");
        return;
      }

      try {
        if (showLoading) {
          setOrdersLoading(true);
        }
        setOrdersError("");

        const response = await fetch("/api/business/orders", {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const responseText = await response.text();
        let data: Record<string, unknown> = {};

        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          data = { raw: responseText };
        }

        if (!response.ok || data.success === false) {
          console.error("Error cargando pedidos del negocio:", {
            status: response.status,
            statusText: response.statusText,
            responseText,
            data,
          });
          setOrders([]);
          setOrdersError(
            (typeof data.error === "string" && data.error) ||
              "No se pudieron cargar los pedidos del negocio.",
          );
          return;
        }

        const businessName = business.name || DEFAULT_BUSINESS.name;
        const parsedOrders = Array.isArray(data.orders)
          ? (data.orders as Array<Record<string, unknown>>).map((order) => ({
              orderId: Number(order.id ?? 0),
              id: `FO-${String(order.id ?? "")}`,
              negocio: String(order.businessName ?? businessName),
              total: MXN_CURRENCY_FORMATTER.format(toSafeNumber(order.total)),
              estado: String(order.status ?? "Pendiente"),
              hora: formatTime(order.placedAt),
              cliente: String(order.customerName ?? "Cliente"),
              metodoPago: String(order.paymentMethod ?? "Sin metodo"),
              direccion: String(order.address ?? "Sin direccion"),
              notas: String(order.notes ?? ""),
              deliveryRequested: Boolean(order.deliveryRequested),
              items: Array.isArray(order.items)
                ? order.items.map((item) => ({
                    nombre: String(
                      (item as Record<string, unknown>).name ?? "Producto",
                    ),
                    cantidad: Number(
                      (item as Record<string, unknown>).quantity ?? 0,
                    ),
                    precio: MXN_CURRENCY_FORMATTER.format(
                      toSafeNumber((item as Record<string, unknown>).total),
                    ),
                    extras: String(
                      (item as Record<string, unknown>).notes ?? "",
                    ),
                  }))
                : [],
            }))
          : [];
        const parsedActiveOrders = parsedOrders.filter((order) =>
          ACTIVE_ORDER_STATUSES.has(normalizeBusinessStatus(order.estado)),
        );

        setOrders(parsedOrders);
        setOpenOrderId((current) =>
          current && parsedActiveOrders.some((order) => order.id === current)
            ? current
            : (parsedActiveOrders[0]?.id ?? null),
        );
      } catch (error) {
        console.error("Error cargando pedidos del negocio:", error);
        setOrders([]);
        setOrdersError("No se pudieron cargar los pedidos del negocio.");
      } finally {
        if (showLoading) {
          setOrdersLoading(false);
        }
      }
    },
    [business.name],
  );

  const loadTrainings = useCallback(async () => {
    if (mode !== "seller") {
      setSellerTrainings([]);
      setTrainingsLoading(false);
      setTrainingsError("");
      return;
    }

    const token = getStoredToken();

    if (!token) {
      setSellerTrainings([]);
      setTrainingsLoading(false);
      setTrainingsError("Debes iniciar sesion nuevamente.");
      return;
    }

    try {
      setTrainingsLoading(true);
      setTrainingsError("");

      const response = await fetch("/api/seller/trainings", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const responseText = await response.text();
      let data: Record<string, unknown> = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok || data.success === false) {
        console.error("Error cargando capacitaciones del vendedor:", {
          status: response.status,
          statusText: response.statusText,
          responseText,
          data,
        });
        setSellerTrainings([]);
        setTrainingsError(
          (typeof data.error === "string" && data.error) ||
            "No se pudieron cargar tus capacitaciones.",
        );
        return;
      }

      const parsedTrainings = Array.isArray(data.trainings)
        ? (data.trainings as Array<Record<string, unknown>>).map((item) => ({
            assignment_id: Number(item.assignment_id ?? 0),
            training_id: Number(item.training_id ?? 0),
            business_id: Number(item.business_id ?? 0),
            business_name: String(item.business_name ?? "Negocio"),
            title: String(item.title ?? "Capacitación"),
            description: String(item.description ?? ""),
            type: String(item.type ?? "video") as
              | "video"
              | "test"
              | "video_test",
            video_url: String(item.video_url ?? ""),
            passing_score: Number(item.passing_score ?? 70),
            status: String(item.status ?? "pendiente"),
            due_date: typeof item.due_date === "string" ? item.due_date : null,
            video_completed_at:
              typeof item.video_completed_at === "string"
                ? item.video_completed_at
                : null,
            score: Number(item.score ?? 0),
            passed:
              item.passed === null || item.passed === undefined
                ? null
                : Boolean(item.passed),
            completed_at:
              typeof item.completed_at === "string" ? item.completed_at : null,
            questions: Array.isArray(item.questions)
              ? (item.questions as Array<Record<string, unknown>>).map(
                  (question) => ({
                    id: Number(question.id ?? 0),
                    question: String(question.question ?? ""),
                    options: Array.isArray(question.options)
                      ? (
                          question.options as Array<Record<string, unknown>>
                        ).map((option) => ({
                          id: Number(option.id ?? 0),
                          text: String(option.text ?? ""),
                          isCorrect: Boolean(option.isCorrect),
                        }))
                      : [],
                  }),
                )
              : [],
          }))
        : [];

      setSellerTrainings(parsedTrainings);
    } catch (error) {
      console.error("Error cargando capacitaciones del vendedor:", error);
      setSellerTrainings([]);
      setTrainingsError("No se pudieron cargar tus capacitaciones.");
    } finally {
      setTrainingsLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    loadBusinessProfile();
    loadOrders({ showLoading: true });
    loadTrainings();

    const handleWindowFocus = () => {
      loadBusinessProfile();
      loadOrders({ showLoading: false });
      loadTrainings();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadBusinessProfile();
        loadOrders({ showLoading: false });
        loadTrainings();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadBusinessProfile, loadOrders, loadTrainings]);

  const handleOpenNewOrder = () => {
    setActiveSection("orders");
    setShowOrderModal(true);
  };

  const handleManageStore = () => {
    setActiveSection("orders");
  };

  const handleCreateOrder = (data: NewOrderData) => {
    const now = new Date();
    const idNumber = Math.floor(1000 + Math.random() * 9000);
    const total = data.precio * data.cantidad;
    const formattedTotal = MXN_CURRENCY_FORMATTER.format(total);
    const newOrder: OrderTicket = {
      orderId: idNumber,
      id: `FO-${idNumber}`,
      negocio: business.name,
      total: formattedTotal,
      estado: "Preparando",
      hora: formatTime(now.toISOString()),
      cliente: data.cliente,
      metodoPago: data.metodoPago,
      direccion: data.direccion,
      notas: data.notas,
      items: [
        {
          nombre: data.itemNombre,
          cantidad: data.cantidad,
          precio: formattedTotal,
        },
      ],
    };

    setOrders((prev) => [newOrder, ...prev]);
    setOpenOrderId(newOrder.id);
    setActiveSection("dashboard");
    setShowOrderModal(false);
  };

  const getEditableOrderData = (order: OrderTicket): NewOrderData => {
    const firstItem = order.items[0];
    const lineTotal =
      Number(firstItem?.precio.replace(/[^\d.]/g, "")) ||
      Number(order.total.replace(/[^\d.]/g, "")) ||
      0;
    const quantity = firstItem?.cantidad ?? 1;

    return {
      cliente: order.cliente,
      direccion: order.direccion,
      metodoPago: order.metodoPago,
      itemNombre: firstItem?.nombre ?? "",
      cantidad: quantity,
      precio: lineTotal / quantity,
      notas: order.notas,
    };
  };

  const handleUpdateOrder = (data: NewOrderData) => {
    if (!editingOrder) return;

    const total = data.precio * data.cantidad;
    const formattedTotal = MXN_CURRENCY_FORMATTER.format(total);

    setOrders((prev) =>
      prev.map((order) =>
        order.id === editingOrder.id
          ? {
              ...order,
              orderId: editingOrder.orderId,
              total: formattedTotal,
              cliente: data.cliente,
              metodoPago: data.metodoPago,
              direccion: data.direccion,
              notas: data.notas,
              items: [
                {
                  nombre: data.itemNombre,
                  cantidad: data.cantidad,
                  precio: formattedTotal,
                },
              ],
            }
          : order,
      ),
    );
    setEditingOrder(null);
  };

  const handleOrderReady = async (orderId: number) => {
    const token = getStoredToken();

    if (!token) {
      setActionFeedback({
        type: "error",
        message: "Debes iniciar sesion nuevamente.",
      });
      return;
    }

    try {
      setActionLoading({ orderId, type: "ready" });
      setActionFeedback(null);
      console.log("Marcando pedido listo", orderId);

      const response = await fetch(`/api/business/orders/${orderId}/ready`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const responseText = await response.text();
      let data: Record<string, unknown> = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw: responseText };
      }

      console.log("Respuesta backend", data);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            (typeof data.message === "string" && data.message) ||
            `Error HTTP ${response.status}`,
        );
      }

      setActionFeedback({
        type: "success",
        message:
          (typeof data.message === "string" && data.message) ||
          "Pedido listo y repartidor solicitado correctamente.",
      });
      await loadOrders();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error("Error real backend", message, error);
      setActionFeedback({
        type: "error",
        message: message || "No se pudo marcar el pedido como listo.",
      });
    } finally {
      setActionLoading({ orderId: null, type: null });
    }
  };

  const handleTrainingAnswerChange = (
    assignmentId: number,
    questionId: number,
    answerId: number,
  ) => {
    setTrainingAnswers((prev) => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] ?? {}),
        [questionId]: answerId,
      },
    }));
  };

  const handleTrainingVideoSeen = async (assignmentId: number) => {
    const token = getStoredToken();

    if (!token) {
      setActionFeedback({
        type: "error",
        message: "Debes iniciar sesion nuevamente.",
      });
      return;
    }

    try {
      setTrainingActionLoading({ assignmentId, type: "video" });
      const response = await fetch(
        `/api/seller/trainings/${assignmentId}/video`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo marcar el video como visto.",
        );
      }

      setActionFeedback({
        type: "success",
        message:
          (typeof data.message === "string" && data.message) ||
          "Video marcado como visto.",
      });
      await loadTrainings();
    } catch (error) {
      console.error("Error marcando video de capacitación:", error);
      setActionFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo marcar el video como visto.",
      });
    } finally {
      setTrainingActionLoading({ assignmentId: null, type: null });
    }
  };

  const handleTrainingTestSubmit = async (
    assignment: SellerTrainingAssignment,
  ) => {
    const token = getStoredToken();

    if (!token) {
      setActionFeedback({
        type: "error",
        message: "Debes iniciar sesion nuevamente.",
      });
      return;
    }

    const answersMap = trainingAnswers[assignment.assignment_id] ?? {};
    const answers = assignment.questions.map((question) => ({
      question_id: question.id,
      answer_id: Number(answersMap[question.id] ?? 0),
    }));

    if (answers.some((answer) => !answer.answer_id)) {
      setActionFeedback({
        type: "error",
        message: "Responde todas las preguntas antes de enviar el test.",
      });
      return;
    }

    try {
      setTrainingActionLoading({
        assignmentId: assignment.assignment_id,
        type: "test",
      });
      const response = await fetch(
        `/api/seller/trainings/${assignment.assignment_id}/test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ answers }),
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo guardar el resultado del test.",
        );
      }

      setActionFeedback({
        type: "success",
        message:
          (typeof data.message === "string" && data.message) ||
          "Resultado guardado correctamente.",
      });
      await loadTrainings();
    } catch (error) {
      console.error("Error enviando test de capacitación:", error);
      setActionFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el resultado del test.",
      });
    } finally {
      setTrainingActionLoading({ assignmentId: null, type: null });
    }
  };

  return (
    <>
      <main className="min-h-screen bg-[#f5f6f5] text-slate-950">
        <section className="bg-gradient-to-br from-orange-600 via-orange-500 to-amber-400 text-white shadow-xl shadow-orange-900/15">
          <div className="mx-auto max-w-7xl px-4 pb-28 pt-12 sm:px-6 lg:px-8">
            <div className="max-w-5xl space-y-6">
              <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-white/85">
                {panelLabel} - {business.name}
              </p>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-black leading-tight sm:text-5xl">
                  Gestion de pedidos de {business.name}
                </h1>
                <p className="max-w-4xl text-lg font-semibold leading-8 text-white/90">
                  Supervisa pedidos existentes, coordina la operacion diaria y
                  controla tu {inventoryDescription} con informacion actualizada
                  de {business.name}.
                </p>
                <p className="max-w-4xl text-sm font-semibold text-white/80">
                  {business.category} · {business.location} · {business.hours}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {pathname !== backHref ? (
                  <Link
                    href={backHref}
                    className="inline-flex items-center gap-3 rounded-2xl bg-white/15 px-7 py-4 text-sm font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-white/25"
                  >
                    <Store className="h-5 w-5" />
                    {backLabel}
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={handleOpenNewOrder}
                  className="inline-flex items-center gap-3 rounded-2xl bg-white px-7 py-4 text-sm font-extrabold text-orange-600 shadow-lg transition hover:-translate-y-0.5 hover:bg-orange-50"
                >
                  <Plus className="h-5 w-5" />
                  Agregar pedido
                </button>
                <button
                  type="button"
                  onClick={handleManageStore}
                  className="inline-flex items-center gap-3 rounded-2xl bg-orange-800/35 px-7 py-4 text-sm font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-orange-900/35"
                >
                  <ClipboardList className="h-5 w-5" />
                  Ver historial
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <HeroBadge>{productLabel} en vivo</HeroBadge>
                <HeroBadge tone="white">
                  {formatLastSync(business.updatedAt)}
                </HeroBadge>
              </div>
            </div>
          </div>
        </section>

        <div
          id="dashboard"
          className="mx-auto -mt-16 flex max-w-7xl flex-col gap-8 px-4 pb-16 sm:px-6 lg:px-8"
        >
          {actionFeedback ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
                actionFeedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {actionFeedback.message}
            </div>
          ) : null}

          {businessError ? (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {businessError}
            </div>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dashboardMetrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setActiveSection("dashboard")}
              className={`inline-flex items-center gap-3 rounded-2xl px-6 py-4 text-sm font-extrabold shadow-sm transition hover:bg-orange-50 ${
                activeSection === "dashboard"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-900/15 hover:bg-orange-600"
                  : "bg-white text-slate-700"
              }`}
            >
              <BarChart3 className="h-5 w-5" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("orders")}
              className={`inline-flex items-center gap-3 rounded-2xl px-6 py-4 text-sm font-extrabold shadow-sm transition hover:bg-orange-50 ${
                activeSection === "orders"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-900/15 hover:bg-orange-600"
                  : "bg-white text-slate-700"
              }`}
            >
              <Store className="h-5 w-5" />
              Pedidos
            </button>
          </div>

          {activeSection === "dashboard" ? (
            <div className="grid gap-8">
              <section className="rounded-[24px] bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-6">
                <div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-black">
                        Pedidos del negocio
                      </h2>
                      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                        Monitorea tu progreso, cierra pedidos listos y visualiza
                        lo ordenado.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection("orders")}
                      className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-orange-600"
                    >
                      Ver historial
                      <span aria-hidden>›</span>
                    </button>
                  </div>

                  {ordersLoading ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                      Cargando pedidos del negocio...
                    </div>
                  ) : ordersError ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">
                      {ordersError}
                    </div>
                  ) : activeOrders.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                      No tienes pedidos activos en este momento.
                    </div>
                  ) : (
                    <ul className="mt-6 grid gap-3 text-sm">
                      {activeOrders.map((order) => {
                        const isOpen = openOrderId === order.id;

                        return (
                          <li
                            key={order.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-orange-200 hover:shadow-md"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setOpenOrderId(isOpen ? null : order.id)
                              }
                              className="flex w-full flex-wrap items-start justify-between gap-4 text-left"
                            >
                              <div>
                                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">
                                  Pedido
                                </p>
                                <p className="mt-2 text-lg font-black text-slate-950">
                                  {order.negocio}
                                </p>
                                <p className="text-xs font-semibold text-slate-400">
                                  Actualizado a las {order.hora} h
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-base font-black text-orange-600">
                                  #{order.id.replace("FO-", "")}
                                </p>
                                <OrderStatusBadge status={order.estado} />
                              </div>
                            </button>
                            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                              <span className="text-sm font-semibold text-slate-500">
                                Total
                              </span>
                              <span className="text-xl font-black text-slate-950">
                                {order.total}
                              </span>
                            </div>
                            {isOpen ? (
                              <div className="mt-4 grid gap-4 rounded-2xl bg-orange-50 p-4 text-sm text-slate-600 sm:grid-cols-[1.1fr,0.9fr]">
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-orange-600">
                                      Cliente
                                    </p>
                                    <p className="mt-1 font-bold text-slate-800">
                                      {order.cliente}
                                    </p>
                                    <p className="text-slate-500">
                                      {order.metodoPago}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-orange-600">
                                      Entrega
                                    </p>
                                    <p className="mt-1 text-slate-600">
                                      {order.direccion}
                                    </p>
                                    {order.notas ? (
                                      <p className="mt-1 text-slate-500">
                                        Notas: {order.notas}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="rounded-2xl bg-white p-4 shadow-sm">
                                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-orange-600">
                                    Ticket del pedido
                                  </p>
                                  <ul className="mt-3 space-y-2">
                                    {order.items.map((item, index) => (
                                      <li
                                        key={`${order.id}-${index}`}
                                        className="flex justify-between gap-3"
                                      >
                                        <span className="font-semibold">
                                          {item.cantidad}x {item.nombre}
                                        </span>
                                        <span className="font-bold">
                                          {item.precio}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                  <div className="mt-3 flex flex-wrap gap-2 border-t border-orange-100 pt-3">
                                    <button
                                      type="button"
                                      className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
                                      onClick={() =>
                                        handleOrderReady(order.orderId)
                                      }
                                      disabled={
                                        actionLoading.orderId === order.orderId
                                      }
                                    >
                                      {actionLoading.orderId ===
                                        order.orderId &&
                                      actionLoading.type === "ready"
                                        ? "Procesando..."
                                        : "Pedido listo"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>

              {mode === "seller" ? (
                <section className="rounded-[24px] bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <GraduationCap className="h-5 w-5 text-orange-600" />
                        <h2 className="text-2xl font-black">
                          Mis capacitaciones
                        </h2>
                      </div>
                      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                        Revisa tus capacitaciones asignadas, marca videos como
                        vistos y completa tus evaluaciones desde aquí.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <HeroBadge>
                        {pendingTrainings.length} pendientes
                      </HeroBadge>
                      <HeroBadge tone="white">
                        {completedTrainings.length} terminadas
                      </HeroBadge>
                    </div>
                  </div>

                  {trainingsLoading ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                      Cargando capacitaciones...
                    </div>
                  ) : trainingsError ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">
                      {trainingsError}
                    </div>
                  ) : sellerTrainings.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                      Aún no tienes capacitaciones asignadas.
                    </div>
                  ) : (
                    <div className="mt-6 grid gap-4">
                      {sellerTrainings.map((training) => {
                        const trainingOpen =
                          openTrainingId === training.assignment_id;
                        const normalizedStatus = normalizeBusinessStatus(
                          training.status,
                        );
                        const canMarkVideo =
                          (training.type === "video" ||
                            training.type === "video_test") &&
                          !training.video_completed_at &&
                          normalizedStatus !== "aprobado";
                        const canSubmitTest =
                          (training.type === "test" ||
                            training.type === "video_test") &&
                          normalizedStatus !== "aprobado";

                        return (
                          <article
                            key={training.assignment_id}
                            className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-orange-200 hover:shadow-md"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setOpenTrainingId(
                                  trainingOpen ? null : training.assignment_id,
                                )
                              }
                              className="flex w-full flex-wrap items-start justify-between gap-4 text-left"
                            >
                              <div>
                                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">
                                  {training.business_name}
                                </p>
                                <p className="mt-2 text-lg font-black text-slate-950">
                                  {training.title}
                                </p>
                                <p className="text-sm font-semibold text-slate-500">
                                  {training.type === "video"
                                    ? "Solo video"
                                    : training.type === "test"
                                      ? "Solo test"
                                      : "Video + test"}
                                </p>
                              </div>
                              <div className="text-right">
                                <TrainingStatusBadge status={training.status} />
                                <p className="mt-2 text-xs font-semibold text-slate-400">
                                  Límite: {formatShortDate(training.due_date)}
                                </p>
                              </div>
                            </button>

                            {trainingOpen ? (
                              <div className="mt-4 grid gap-4 rounded-2xl bg-orange-50 p-4 text-sm text-slate-700">
                                <div className="rounded-2xl bg-white p-4 shadow-sm">
                                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-orange-600">
                                    Resumen
                                  </p>
                                  <p className="mt-2 font-semibold text-slate-700">
                                    {training.description ||
                                      "Capacitación sin descripción adicional."}
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                    <span className="rounded-full bg-slate-100 px-3 py-1">
                                      Puntaje mínimo {training.passing_score}%
                                    </span>
                                    {training.completed_at ? (
                                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                                        Completada{" "}
                                        {formatShortDate(training.completed_at)}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                {(training.type === "video" ||
                                  training.type === "video_test") && (
                                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2">
                                      <PlayCircle className="h-4 w-4 text-orange-600" />
                                      <p className="text-sm font-black text-slate-950">
                                        Video
                                      </p>
                                    </div>
                                    {training.video_url ? (
                                      <div className="mt-3 grid gap-3">
                                        <a
                                          href={training.video_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex w-fit items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-orange-700"
                                        >
                                          <BookOpenCheck className="h-4 w-4" />
                                          Abrir video
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleTrainingVideoSeen(
                                              training.assignment_id,
                                            )
                                          }
                                          disabled={
                                            !canMarkVideo ||
                                            (trainingActionLoading.assignmentId ===
                                              training.assignment_id &&
                                              trainingActionLoading.type ===
                                                "video")
                                          }
                                          className="inline-flex w-fit items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-orange-300"
                                        >
                                          <CheckCircle2 className="h-4 w-4" />
                                          {trainingActionLoading.assignmentId ===
                                            training.assignment_id &&
                                          trainingActionLoading.type === "video"
                                            ? "Guardando..."
                                            : training.video_completed_at
                                              ? "Video completado"
                                              : "Marcar como visto"}
                                        </button>
                                      </div>
                                    ) : (
                                      <p className="mt-3 text-sm font-semibold text-slate-500">
                                        Esta capacitación no tiene un video
                                        disponible.
                                      </p>
                                    )}
                                  </div>
                                )}

                                {(training.type === "test" ||
                                  training.type === "video_test") && (
                                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2">
                                      <FileQuestion className="h-4 w-4 text-orange-600" />
                                      <p className="text-sm font-black text-slate-950">
                                        Evaluación
                                      </p>
                                    </div>
                                    <div className="mt-4 grid gap-4">
                                      {training.questions.map((question) => (
                                        <div
                                          key={question.id}
                                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                        >
                                          <p className="font-black text-slate-950">
                                            {question.question}
                                          </p>
                                          <div className="mt-3 grid gap-2">
                                            {question.options.map((option) => (
                                              <label
                                                key={option.id}
                                                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                                              >
                                                <input
                                                  type="radio"
                                                  name={`assignment-${training.assignment_id}-question-${question.id}`}
                                                  value={option.id}
                                                  checked={
                                                    Number(
                                                      trainingAnswers[
                                                        training.assignment_id
                                                      ]?.[question.id] ?? 0,
                                                    ) === option.id
                                                  }
                                                  onChange={() =>
                                                    handleTrainingAnswerChange(
                                                      training.assignment_id,
                                                      question.id,
                                                      option.id,
                                                    )
                                                  }
                                                  className="size-4 border-slate-300 text-orange-600"
                                                />
                                                <span className="text-sm font-semibold text-slate-700">
                                                  {option.text}
                                                </span>
                                              </label>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleTrainingTestSubmit(training)
                                        }
                                        disabled={
                                          !canSubmitTest ||
                                          (trainingActionLoading.assignmentId ===
                                            training.assignment_id &&
                                            trainingActionLoading.type ===
                                              "test")
                                        }
                                        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                                      >
                                        <GraduationCap className="h-4 w-4" />
                                        {trainingActionLoading.assignmentId ===
                                          training.assignment_id &&
                                        trainingActionLoading.type === "test"
                                          ? "Enviando..."
                                          : "Enviar test"}
                                      </button>
                                      {training.passed !== null ? (
                                        <span
                                          className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
                                            training.passed
                                              ? "bg-emerald-100 text-emerald-700"
                                              : "bg-rose-100 text-rose-700"
                                          }`}
                                        >
                                          {training.passed
                                            ? `Aprobada ${training.score}%`
                                            : `Reprobada ${training.score}%`}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          ) : null}

          {activeSection === "orders" ? (
            <section className="rounded-[22px] border border-orange-100 bg-orange-50/60 p-4 shadow-xl shadow-orange-900/10 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-black">Historial de pedidos</h2>
                <button
                  type="button"
                  onClick={() => setActiveSection("dashboard")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-orange-600 shadow-lg transition hover:bg-orange-50"
                >
                  <ClipboardList className="h-4 w-4" />
                  Volver a pedidos activos
                </button>
              </div>

              <div className="mt-4 grid gap-2 lg:grid-cols-[1fr,10rem]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Buscar pedidos..."
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-800 transition hover:bg-orange-50"
                >
                  <Filter className="h-4 w-4" />
                  Filtros
                </button>
              </div>

              {ordersLoading ? (
                <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
                  Cargando historial...
                </div>
              ) : historyOrders.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
                  Aun no tienes pedidos entregados en el historial.
                </div>
              ) : (
                <ul className="mt-5 grid gap-2.5">
                  {historyOrders.map((order) => (
                    <li
                      key={order.id}
                      className="grid items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-4 py-3 shadow-sm ring-1 ring-white transition hover:border-green-400 hover:shadow-md sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-black text-slate-950">
                            #{order.id.replace("FO-", "")}
                          </p>
                          <OrderStatusBadge status={order.estado} />
                        </div>
                        <p className="mt-0.5 truncate text-sm font-extrabold text-slate-700">
                          {order.negocio}
                        </p>
                        <p className="truncate text-xs font-semibold text-slate-500">
                          {order.cliente} · {order.hora} h
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-950 px-4 py-2 text-left text-white sm:text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-white/65">
                          Total
                        </p>
                        <p className="text-xl font-black leading-none">
                          {order.total}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setViewingOrder(order)}
                          aria-label={`Ver pedido ${order.id}`}
                          className="inline-flex size-9 items-center justify-center rounded-full bg-orange-100 text-orange-700 transition hover:bg-orange-200"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingOrder(order)}
                          aria-label={`Editar pedido ${order.id}`}
                          className="inline-flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      </main>
      <NewOrderModal
        open={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        onSubmit={handleCreateOrder}
        productLabel={productLabel}
      />
      <OrderDetailModal
        order={viewingOrder}
        onClose={() => setViewingOrder(null)}
        onEdit={(order) => {
          setViewingOrder(null);
          setEditingOrder(order);
        }}
      />
      <NewOrderModal
        key={editingOrder?.id ?? "edit-order"}
        open={Boolean(editingOrder)}
        onClose={() => setEditingOrder(null)}
        onSubmit={handleUpdateOrder}
        initialData={editingOrder ? getEditableOrderData(editingOrder) : null}
        title="Editar pedido"
        description="Actualiza los datos principales del pedido seleccionado."
        submitLabel="Guardar cambios"
        productLabel={productLabel}
      />
    </>
  );
}

function HeroBadge({
  children,
  tone = "orange",
}: {
  children: ReactNode;
  tone?: "orange" | "white";
}) {
  const styles =
    tone === "white"
      ? "border-white/60 bg-white/15 text-white/80"
      : "border-orange-100/70 bg-white/10 text-white";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${styles}`}
    >
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "orange" | "amber" | "sky" | "rose";
}) {
  const palette =
    tone === "orange"
      ? "from-orange-200/80 via-orange-300/60 to-orange-400/40 text-orange-700"
      : tone === "amber"
        ? "from-amber-200/80 via-amber-300/60 to-amber-400/40 text-amber-700"
        : tone === "sky"
          ? "from-sky-200/80 via-sky-300/60 to-sky-400/40 text-sky-700"
          : "from-rose-200/80 via-rose-300/60 to-rose-400/40 text-rose-700";

  return (
    <div
      className={`overflow-hidden rounded-[22px] bg-gradient-to-br ${palette} p-[1px]`}
    >
      <div className="relative h-full rounded-[20px] bg-white/95 p-5 shadow-sm ring-1 ring-white/70 backdrop-blur">
        <div className="pointer-events-none absolute -top-12 right-0 size-24 rounded-full bg-white/40 blur-3xl" />
        <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-400">
          {label}
        </p>
        <h3 className="mt-3 text-3xl font-semibold text-zinc-800">{value}</h3>
        <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          {delta}
        </span>
      </div>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const normalized = normalizeBusinessStatus(status);
  const theme =
    normalized === "pedido_entregado" ||
    normalized === "entregado" ||
    normalized === "completado"
      ? "border border-green-300 bg-green-100 text-green-700"
      : normalized === "listo_para_recoger"
        ? "bg-rose-50 text-rose-600"
        : normalized === "por_validar_pago" || normalized === "pago_validado"
          ? "bg-amber-50 text-amber-600"
          : normalized === "repartidor_asignado" ||
              normalized === "repartidor_solicitado"
            ? "bg-orange-50 text-orange-600"
            : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${theme}`}
    >
      {status}
    </span>
  );
}

function TrainingStatusBadge({ status }: { status: string }) {
  const normalized = normalizeBusinessStatus(status);
  const theme =
    normalized === "aprobado"
      ? "bg-emerald-100 text-emerald-700"
      : normalized === "reprobado"
        ? "bg-rose-100 text-rose-700"
        : normalized === "en_progreso"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${theme}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function NewOrderModal({
  open,
  onClose,
  onSubmit,
  initialData,
  title = "Agregar pedido",
  description = "Registra un pedido manual para prepararlo y pedir repartidor.",
  submitLabel = "Crear pedido",
  productLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewOrderData) => void;
  initialData?: NewOrderData | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  productLabel: string;
}) {
  const initialForm = useMemo(
    () => ({
      cliente: initialData?.cliente ?? "",
      direccion: initialData?.direccion ?? "",
      metodoPago: initialData?.metodoPago ?? "Efectivo",
      itemNombre: initialData?.itemNombre ?? "",
      cantidad: String(initialData?.cantidad ?? 1),
      precio: initialData?.precio ? String(initialData.precio) : "",
      notas: initialData?.notas ?? "",
    }),
    [initialData],
  );

  const [form, setForm] = useState(initialForm);
  const [touched, setTouched] = useState(false);

  const resetForm = useCallback(() => {
    setForm(initialForm);
    setTouched(false);
  }, [initialForm]);

  useEffect(() => {
    setForm(initialForm);
    setTouched(false);
  }, [initialForm]);

  if (!open) {
    return null;
  }

  const quantity = Number(form.cantidad);
  const price = Number(form.precio);
  const isValid =
    form.cliente.trim() &&
    form.direccion.trim() &&
    form.itemNombre.trim() &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    Number.isFinite(price) &&
    price > 0;

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!isValid) {
      return;
    }

    onSubmit({
      cliente: form.cliente.trim(),
      direccion: form.direccion.trim(),
      metodoPago: form.metodoPago,
      itemNombre: form.itemNombre.trim(),
      cantidad: quantity,
      precio: price,
      notas: form.notas.trim() || undefined,
    });
    resetForm();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/40 bg-white/95 shadow-2xl ring-1 ring-white/70">
        <div className="flex items-center justify-between bg-orange-600/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-orange-800">{title}</h2>
            <p className="text-xs text-zinc-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex size-8 items-center justify-center rounded-full border border-orange-200/70 text-orange-700 transition hover:bg-orange-50"
            aria-label="Cerrar nuevo pedido"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 px-6 py-6 text-sm sm:grid-cols-2"
        >
          <label className="grid gap-1">
            <span className="font-semibold text-zinc-600">Cliente *</span>
            <input
              type="text"
              value={form.cliente}
              onChange={(event) => handleChange("cliente", event.target.value)}
              className="rounded-xl border border-orange-200/70 bg-white px-3 py-2 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              placeholder="Ej. Fernanda Ruiz"
              required
            />
            {touched && !form.cliente.trim() ? (
              <span className="text-xs text-rose-500">
                El cliente es obligatorio.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1">
            <span className="font-semibold text-zinc-600">Metodo de pago</span>
            <select
              value={form.metodoPago}
              onChange={(event) =>
                handleChange("metodoPago", event.target.value)
              }
              className="rounded-xl border border-orange-200/70 bg-white px-3 py-2 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Transferencia SPEI">Transferencia SPEI</option>
              <option value="PayPal">PayPal</option>
            </select>
          </label>

          <label className="grid gap-1 sm:col-span-2">
            <span className="font-semibold text-zinc-600">
              Direccion de entrega *
            </span>
            <input
              type="text"
              value={form.direccion}
              onChange={(event) =>
                handleChange("direccion", event.target.value)
              }
              className="rounded-xl border border-orange-200/70 bg-white px-3 py-2 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              placeholder="Calle, colonia, municipio"
              required
            />
            {touched && !form.direccion.trim() ? (
              <span className="text-xs text-rose-500">
                La direccion es obligatoria.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1 sm:col-span-2">
            <span className="font-semibold text-zinc-600">
              {productLabel.slice(0, -1) || "Producto"} *
            </span>
            <input
              type="text"
              value={form.itemNombre}
              onChange={(event) =>
                handleChange("itemNombre", event.target.value)
              }
              className="rounded-xl border border-orange-200/70 bg-white px-3 py-2 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              placeholder={
                productLabel === "Cortes"
                  ? "Ej. Rib Eye Prime 350g"
                  : "Ej. Combo especial"
              }
              required
            />
            {touched && !form.itemNombre.trim() ? (
              <span className="text-xs text-rose-500">
                El producto es obligatorio.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1">
            <span className="font-semibold text-zinc-600">Cantidad *</span>
            <input
              type="number"
              min="1"
              step="1"
              value={form.cantidad}
              onChange={(event) => handleChange("cantidad", event.target.value)}
              className="rounded-xl border border-orange-200/70 bg-white px-3 py-2 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              required
            />
            {touched && (!Number.isFinite(quantity) || quantity <= 0) ? (
              <span className="text-xs text-rose-500">
                Ingresa una cantidad valida.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1">
            <span className="font-semibold text-zinc-600">
              Precio unitario *
            </span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.precio}
              onChange={(event) => handleChange("precio", event.target.value)}
              className="rounded-xl border border-orange-200/70 bg-white px-3 py-2 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              placeholder="0.00"
              required
            />
            {touched && (!Number.isFinite(price) || price <= 0) ? (
              <span className="text-xs text-rose-500">
                Ingresa un precio valido.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1 sm:col-span-2">
            <span className="font-semibold text-zinc-600">Notas</span>
            <textarea
              value={form.notas}
              onChange={(event) => handleChange("notas", event.target.value)}
              className="min-h-24 rounded-xl border border-orange-200/70 bg-white px-3 py-2 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
              placeholder="Indicaciones de empaque o entrega"
            />
          </label>

          <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-orange-200/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-600 transition hover:bg-orange-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-orange-700"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrderDetailModal({
  order,
  onClose,
  onEdit,
}: {
  order: OrderTicket | null;
  onClose: () => void;
  onEdit: (order: OrderTicket) => void;
}) {
  if (!order) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl ring-1 ring-white/70">
        <div className="flex items-center justify-between bg-orange-600/10 px-6 py-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-orange-600">
              Pedido {order.id}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {order.cliente}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-full border border-orange-200/70 text-orange-700 transition hover:bg-orange-50"
            aria-label="Cerrar detalle de pedido"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 px-6 py-6 text-sm text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-white">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/60">
                Estado
              </p>
              <p className="text-base font-black">{order.estado}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs font-bold uppercase tracking-wide text-white/60">
                Total
              </p>
              <p className="text-3xl font-black">{order.total}</p>
            </div>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
              <dt className="text-xs font-extrabold uppercase tracking-wide text-orange-600">
                Negocio
              </dt>
              <dd className="mt-1 font-bold text-slate-800">{order.negocio}</dd>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
              <dt className="text-xs font-extrabold uppercase tracking-wide text-orange-600">
                Pago
              </dt>
              <dd className="mt-1 font-bold text-slate-800">
                {order.metodoPago}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                Entrega
              </dt>
              <dd className="mt-1 font-semibold text-slate-700">
                {order.direccion}
              </dd>
            </div>
          </dl>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Ticket
            </p>
            <ul className="mt-3 grid gap-2">
              {order.items.map((item, index) => (
                <li
                  key={`${order.id}-detail-${index}`}
                  className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="font-bold text-slate-800">
                      {item.cantidad}x {item.nombre}
                    </p>
                    {item.extras ? (
                      <p className="text-xs text-slate-500">{item.extras}</p>
                    ) : null}
                  </div>
                  <span className="font-black text-slate-950">
                    {item.precio}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {order.notas ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700">
                Notas
              </p>
              <p className="mt-1 font-semibold text-amber-900">{order.notas}</p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-orange-200/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-600 transition hover:bg-orange-50"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-orange-700"
            >
              Editar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
