"use client";

import {
  BarChart3,
  Camera,
  ClipboardList,
  Megaphone,
  PackagePlus,
  PlayCircle,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserPlus,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { UserAvatar } from "@/components/shared/user-avatar";

const TOKEN_STORAGE_KEYS = [
  "token",
  "authToken",
  "access_token",
  "gogi_token",
  "userToken",
  "accessToken",
];

type AdminSection =
  | "summary"
  | "orders"
  | "products"
  | "inventory"
  | "sellers"
  | "promotions"
  | "sales"
  | "settings";

type BusinessInfo = {
  id: number;
  name: string;
  avatarUrl: string | null;
  categoryName: string;
  categoryId: number | null;
  city: string;
  district: string;
  address: string;
  phone: string;
  email: string;
  legalName: string;
  taxId: string;
  addressNotes: string;
  ownerId: number | null;
  statusId: number;
  isOpen: boolean;
  productsCount: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
  criticalInventoryCount: number;
  updatedAt: string | null;
};

type OrderItem = {
  id: number;
  name: string;
  quantity: number;
  total: number;
  notes: string;
};

type BusinessOrder = {
  id: number;
  businessName: string;
  total: number;
  status: string;
  placedAt: string;
  customerName: string;
  paymentMethod: string;
  address: string;
  notes: string;
  deliveryUserId?: number | null;
  deliveryName?: string | null;
  deliveryPhone?: string | null;
  deliveryProfileImageUrl?: string | null;
  deliveryStatus?: string | null;
  deliveryRequested: boolean;
  items: OrderItem[];
};

type ProductItem = {
  id: number;
  name: string;
  price: number;
  stock_average: number;
  stock_danger: number;
  category_name: string | null;
  status_id: number | null;
  is_stock_available: boolean;
  description_short: string | null;
  thumbnail_url: string | null;
};

type TeamMember = {
  id: number;
  nombre: string;
  correo: string;
  telefono: string;
  pedidos: number;
  estado: string;
  desempeño: string;
  fechaIngreso: string;
  pedidosRecientes: Array<{
    id: number;
    total: number;
    createdAt: string;
    status: string;
  }>;
  posicion: string;
  source: "owner" | "manager";
};

type PromotionItem = {
  id: number;
  product_id: string;
  product_name: string;
  title?: string;
  promotion_type?: string;
  regular_price?: number;
  offer_price?: number | null;
  discount: number;
  start_date: string;
  end_date: string;
  active: boolean;
};

type StockAlert = {
  id: number;
  name: string;
  category: string;
  stock: number;
  stock_minimo: number;
  is_stock_available: boolean;
};

type WeeklyDay = {
  day: string;
  sales_total: number;
  orders_count: number;
};

type WeeklySales = {
  days: WeeklyDay[];
  current_period_sales_total: number;
  previous_period_sales_total: number;
  week_over_week_change: number;
};

type BusinessCategory = {
  id: number;
  name: string;
};

type ProductForm = {
  id: number;
  name: string;
  price: string;
  stock_average: string;
  stock_danger: string;
  description_short: string;
  is_stock_available: boolean;
  status_id: number;
};

type SellerForm = {
  selected_user_id: string;
  estado: string;
  posicion: string;
};

type SellerSearchResult = {
  id: number;
  name: string;
  email: string;
  phone?: string;
};

type PromotionForm = {
  id?: number;
  product_id: string;
  discount: string;
  start_date: string;
  end_date: string;
  active: boolean;
};

type TrainingQuestionForm = {
  clientId: string;
  question: string;
  options: string[];
  correctIndex: number;
};

type TrainingItem = {
  id: number;
  title: string;
  description: string;
  type: "video" | "test" | "video_test";
  video_url: string;
  passing_score: number;
  is_active: boolean;
  created_at: string;
  questions: Array<{
    id?: number;
    question: string;
    options: Array<{
      id?: number;
      text: string;
      isCorrect: boolean;
    }>;
  }>;
};

type TrainingResultItem = {
  assignment_id: number;
  training_id: number;
  training_title: string;
  user_id: number;
  seller_name: string;
  status: string;
  score: number;
  passed: boolean | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
};

type TrainingForm = {
  title: string;
  description: string;
  type: "video" | "test" | "video_test";
  video_url: string;
  passing_score: string;
  is_active: boolean;
  questions: TrainingQuestionForm[];
};

type TrainingAssignmentForm = {
  user_id: string;
  training_id: string;
  due_date: string;
};

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

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

function formatCurrency(value: number) {
  return MXN.format(Number.isFinite(value) ? value : 0);
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  return items.filter(
    (item, index, self) =>
      index ===
      self.findIndex((candidate) => getKey(candidate) === getKey(item)),
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeStatus(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(new Error("No se pudo leer el archivo de video."));
    reader.readAsDataURL(file);
  });
}

async function parseJsonResponse(response: Response) {
  const responseText = await response.text();
  let data: Record<string, unknown> = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { raw: responseText };
  }

  return data;
}

function AdminModal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl ring-1 ring-white/70">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function BusinessAdminDashboard() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AdminSection>("summary");
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(
    null,
  );
  const [businessOptions, setBusinessOptions] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [businessCategories, setBusinessCategories] = useState<
    BusinessCategory[]
  >([]);
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [promotions, setPromotions] = useState<PromotionItem[]>([]);
  const [trainings, setTrainings] = useState<TrainingItem[]>([]);
  const [trainingResults, setTrainingResults] = useState<TrainingResultItem[]>(
    [],
  );
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [weeklySales, setWeeklySales] = useState<WeeklySales>({
    days: [],
    current_period_sales_total: 0,
    previous_period_sales_total: 0,
    week_over_week_change: 0,
  });
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    business_category_id: "",
    city: "",
    district: "",
    address: "",
    legal_name: "",
    tax_id: "",
    address_notes: "",
    phone: "",
    email: "",
    status_id: "1",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<BusinessOrder | null>(
    null,
  );
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductForm | null>(
    null,
  );
  const [showSellerModal, setShowSellerModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [trainingModalTab, setTrainingModalTab] = useState<
    "create" | "assign" | "results"
  >("create");
  const [promotionForm, setPromotionForm] = useState<PromotionForm>({
    product_id: "",
    discount: "",
    start_date: "",
    end_date: "",
    active: true,
  });
  const [trainingForm, setTrainingForm] = useState<TrainingForm>({
    title: "",
    description: "",
    type: "video",
    video_url: "",
    passing_score: "70",
    is_active: true,
    questions: [],
  });
  const [trainingAssignmentForm, setTrainingAssignmentForm] =
    useState<TrainingAssignmentForm>({
      user_id: "",
      training_id: "",
      due_date: "",
    });
  const [sellerForm, setSellerForm] = useState<SellerForm>({
    selected_user_id: "",
    estado: "Activo",
    posicion: "Vendedor",
  });
  const [sellerUserSearch, setSellerUserSearch] = useState("");
  const [sellerSearchResults, setSellerSearchResults] = useState<
    SellerSearchResult[]
  >([]);
  const [sellerSearchLoading, setSellerSearchLoading] = useState(false);
  const [sellerSearchMessage, setSellerSearchMessage] = useState("");
  const [selectedSellerUser, setSelectedSellerUser] =
    useState<SellerSearchResult | null>(null);
  const [assignInitialTraining, setAssignInitialTraining] = useState(false);
  const [initialTrainingId, setInitialTrainingId] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const loadDashboard = useCallback(async () => {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const accessResponse = await fetch("/api/auth/access-center", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const accessData = await parseJsonResponse(accessResponse);

      if (!accessResponse.ok || accessData.success === false) {
        throw new Error(
          (typeof accessData.error === "string" && accessData.error) ||
            "No se pudieron validar los accesos del usuario.",
        );
      }

      const accessFlags =
        accessData.accessFlags && typeof accessData.accessFlags === "object"
          ? (accessData.accessFlags as Record<string, unknown>)
          : {};
      const canAccessAdminPanel =
        Boolean(accessFlags.admin) || Boolean(accessFlags.businessOwner);

      if (!canAccessAdminPanel) {
        router.replace("/pickdash/seller");
        return;
      }

      const query = selectedBusinessId
        ? `?business_id=${selectedBusinessId}`
        : "";
      const [
        businessResponse,
        ordersResponse,
        productsResponse,
        teamResponse,
        trainingsResponse,
        promotionsResponse,
        stockResponse,
        weeklyResponse,
        categoriesResponse,
      ] = await Promise.all([
        fetch(`/api/business/me${query}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`/api/business/orders${query}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`/api/business/products${query}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`/api/business/team${query}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`/api/business/trainings${query}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`/api/business/promotions${query}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`/api/business/stock-alerts${query}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`/api/business/reports/weekly${query}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch("/api/business/categories", {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      const [
        businessData,
        ordersData,
        productsData,
        teamData,
        trainingsData,
        promotionsData,
        stockData,
        weeklyData,
        categoriesData,
      ] = await Promise.all([
        parseJsonResponse(businessResponse),
        parseJsonResponse(ordersResponse),
        parseJsonResponse(productsResponse),
        parseJsonResponse(teamResponse),
        parseJsonResponse(trainingsResponse),
        parseJsonResponse(promotionsResponse),
        parseJsonResponse(stockResponse),
        parseJsonResponse(weeklyResponse),
        parseJsonResponse(categoriesResponse),
      ]);

      if (!businessResponse.ok || businessData.success === false) {
        console.error("Error real cargando /api/business/me:", {
          status: businessResponse.status,
          statusText: businessResponse.statusText,
          payload: businessData,
        });
        throw new Error(
          (typeof businessData.error === "string" && businessData.error) ||
            "No se pudo cargar el negocio.",
        );
      }

      const businessPayload =
        businessData.business && typeof businessData.business === "object"
          ? (businessData.business as Record<string, unknown>)
          : null;

      if (!businessPayload) {
        throw new Error("Este usuario no tiene un negocio asignado.");
      }

      const businessId = Number(businessPayload.id ?? 0);
      if (!selectedBusinessId && businessId > 0) {
        setSelectedBusinessId(businessId);
      }

      setBusinessOptions(
        Array.isArray(businessData.businesses)
          ? uniqueByKey(
              (businessData.businesses as Array<Record<string, unknown>>).map(
                (item) => ({
                  id: Number(item.id ?? 0),
                  name: String(item.name ?? `Negocio ${item.id ?? ""}`),
                }),
              ),
              (item) => `business-${item.id}`,
            )
          : [],
      );

      setBusiness({
        id: businessId,
        name: String(businessPayload.name ?? "Tu negocio"),
        avatarUrl:
          typeof businessPayload.avatar_url === "string"
            ? businessPayload.avatar_url
            : null,
        categoryName: String(
          businessPayload.category_name ??
            businessPayload.category ??
            "Negocio",
        ),
        categoryId: Number(businessPayload.business_category_id ?? 0) || null,
        city: String(businessPayload.city ?? ""),
        district: String(businessPayload.district ?? ""),
        address: String(businessPayload.address ?? ""),
        phone: String(businessPayload.phone ?? ""),
        email: String(businessPayload.email ?? ""),
        legalName: String(businessPayload.legal_name ?? ""),
        taxId: String(businessPayload.tax_id ?? ""),
        addressNotes: String(businessPayload.address_notes ?? ""),
        ownerId:
          Number(
            (businessPayload.business_owner as { user_id?: unknown })
              ?.user_id ?? 0,
          ) || null,
        statusId: Number(businessPayload.status_id ?? 1) || 1,
        isOpen: Boolean(businessPayload.is_open_now),
        productsCount: Number(businessData.products_count ?? 0),
        activeOrdersCount: Number(businessData.active_orders_count ?? 0),
        completedOrdersCount: Number(businessData.completed_orders_count ?? 0),
        criticalInventoryCount: Number(
          businessData.critical_inventory_count ?? 0,
        ),
        updatedAt:
          typeof businessPayload.updated_at === "string"
            ? businessPayload.updated_at
            : null,
      });
      setSettingsForm({
        name: String(businessPayload.name ?? ""),
        business_category_id: String(
          businessPayload.business_category_id ?? "",
        ),
        city: String(businessPayload.city ?? ""),
        district: String(businessPayload.district ?? ""),
        address: String(businessPayload.address ?? ""),
        legal_name: String(businessPayload.legal_name ?? ""),
        tax_id: String(businessPayload.tax_id ?? ""),
        address_notes: String(businessPayload.address_notes ?? ""),
        phone: String(businessPayload.phone ?? ""),
        email: String(businessPayload.email ?? ""),
        status_id: String(businessPayload.status_id ?? 1),
      });

      setOrders(
        Array.isArray(ordersData.orders)
          ? (ordersData.orders as BusinessOrder[])
          : [],
      );
      setProducts(
        Array.isArray(productsData.products)
          ? (productsData.products as ProductItem[])
          : [],
      );
      setTeam(
        Array.isArray(teamData.team)
          ? uniqueByKey(
              teamData.team as TeamMember[],
              (item) => `seller-${item.id}-${item.correo}-${item.source}`,
            )
          : [],
      );
      setTrainings(
        Array.isArray(trainingsData.trainings)
          ? (trainingsData.trainings as TrainingItem[])
          : [],
      );
      setTrainingResults(
        Array.isArray(trainingsData.results)
          ? (trainingsData.results as TrainingResultItem[])
          : [],
      );
      setPromotions(
        Array.isArray(promotionsData.promotions)
          ? (promotionsData.promotions as PromotionItem[])
          : [],
      );
      setStockAlerts(
        Array.isArray(stockData.alerts)
          ? (stockData.alerts as StockAlert[])
          : [],
      );
      setWeeklySales({
        days: Array.isArray(weeklyData.days)
          ? (weeklyData.days as WeeklyDay[])
          : [],
        current_period_sales_total: Number(
          weeklyData.current_period_sales_total ?? 0,
        ),
        previous_period_sales_total: Number(
          weeklyData.previous_period_sales_total ?? 0,
        ),
        week_over_week_change: Number(weeklyData.week_over_week_change ?? 0),
      });
      setBusinessCategories(
        Array.isArray(categoriesData.categories)
          ? (categoriesData.categories as BusinessCategory[])
          : [],
      );
    } catch (error) {
      console.error("Error cargando panel administrativo del negocio:", error);
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el panel administrativo.",
      );
    } finally {
      setLoading(false);
    }
  }, [router, selectedBusinessId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!showSellerModal || !business?.id) {
      return;
    }

    const token = getStoredToken();
    const trimmedSearch = sellerUserSearch.trim();

    if (!token) {
      setSellerSearchResults([]);
      setSellerSearchLoading(false);
      setSellerSearchMessage("Debes iniciar sesión nuevamente.");
      return;
    }

    if (trimmedSearch.length < 2) {
      setSellerSearchResults([]);
      setSellerSearchLoading(false);
      setSellerSearchMessage(
        trimmedSearch.length === 0
          ? ""
          : "Escribe al menos 2 caracteres para buscar.",
      );
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setSellerSearchLoading(true);
        setSellerSearchMessage("Buscando...");

        const response = await fetch(
          `/api/business/users/search?business_id=${business.id}&q=${encodeURIComponent(trimmedSearch)}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        );
        const data = await parseJsonResponse(response);

        if (!response.ok || data.success === false) {
          console.error("Error buscando usuarios para vendedor:", data);
          setSellerSearchResults([]);
          setSellerSearchMessage(
            (typeof data.error === "string" && data.error) ||
              "No se pudo buscar a los usuarios.",
          );
          return;
        }

        const results = Array.isArray(data.users)
          ? uniqueByKey(
              data.users as SellerSearchResult[],
              (item) => `user-${item.id}-${item.email}`,
            )
          : [];

        setSellerSearchResults(results);
        setSellerSearchMessage(
          results.length === 0 ? "No se encontraron usuarios" : "",
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Error buscando usuarios para vendedor:", error);
        setSellerSearchResults([]);
        setSellerSearchMessage("No se pudo buscar a los usuarios.");
      } finally {
        setSellerSearchLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [business?.id, sellerUserSearch, showSellerModal]);

  const refreshData = useCallback(async () => {
    await loadDashboard();
  }, [loadDashboard]);

  const salesMetrics = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let salesToday = 0;
    let monthlySales = 0;
    let deliveredOrders = 0;
    const paymentMethods = new Map<string, number>();

    for (const order of orders) {
      const date = new Date(order.placedAt);
      const dayKey = Number.isNaN(date.getTime())
        ? ""
        : date.toISOString().slice(0, 10);
      const currentMonth = dayKey.slice(0, 7);

      if (dayKey === todayKey) {
        salesToday += Number(order.total ?? 0);
      }

      if (currentMonth === monthKey) {
        monthlySales += Number(order.total ?? 0);
      }

      if (
        ["pedido_entregado", "entregado", "completado"].includes(
          normalizeStatus(order.status),
        )
      ) {
        deliveredOrders += 1;
      }

      const paymentKey = order.paymentMethod || "Sin método";
      paymentMethods.set(
        paymentKey,
        (paymentMethods.get(paymentKey) ?? 0) + Number(order.total ?? 0),
      );
    }

    return {
      salesToday,
      monthlySales,
      deliveredOrders,
      averageTicket: orders.length
        ? orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0) /
          orders.length
        : 0,
      paymentMethods: Array.from(paymentMethods.entries()).sort(
        (left, right) => right[1] - left[1],
      ),
    };
  }, [orders]);

  const activeProductsCount = products.filter(
    (product) => Number(product.status_id ?? 0) === 1,
  ).length;
  const activeSellersCount = team.filter(
    (seller) => seller.estado !== "Inactivo",
  ).length;
  const activePromotionsCount = promotions.filter(
    (promotion) => promotion.active,
  ).length;
  const recentOrders = orders.slice(0, 5);

  const runAction = useCallback(
    async (key: string, task: () => Promise<void>) => {
      try {
        setBusyKey(key);
        setFeedback(null);
        await task();
      } catch (error) {
        console.error("Error en acción administrativa:", error);
        setFeedback({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo completar la acción.",
        });
      } finally {
        setBusyKey("");
      }
    },
    [],
  );

  const handleOrderPreparation = async (orderId: number) => {
    const token = getStoredToken();
    if (!token) return;

    await runAction(`order-prep-${orderId}`, async () => {
      const response = await fetch(`/api/business/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "en_preparacion" }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo marcar el pedido en preparación.",
        );
      }

      setFeedback({
        type: "success",
        message: "Pedido marcado en preparación.",
      });
      await refreshData();
    });
  };

  const handleOrderReady = async (orderId: number) => {
    const token = getStoredToken();
    if (!token) return;

    await runAction(`order-ready-${orderId}`, async () => {
      const response = await fetch(`/api/business/orders/${orderId}/ready`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo marcar el pedido como listo.",
        );
      }

      setFeedback({
        type: "success",
        message:
          (typeof data.message === "string" && data.message) ||
          "Pedido listo correctamente.",
      });
      await refreshData();
    });
  };

  const handleRequestDriver = async (orderId: number) => {
    const token = getStoredToken();
    if (!token) return;

    await runAction(`order-driver-${orderId}`, async () => {
      const response = await fetch("/api/business/orders/request-delivery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo solicitar repartidor.",
        );
      }

      setFeedback({
        type: "success",
        message:
          (typeof data.message === "string" && data.message) ||
          "Repartidor solicitado correctamente.",
      });
      await refreshData();
    });
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProduct || !business) return;

    const token = getStoredToken();
    if (!token) return;

    await runAction(`product-save-${editingProduct.id}`, async () => {
      const response = await fetch("/api/business/products", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingProduct.id,
          business_id: business.id,
          name: editingProduct.name,
          price: Number(editingProduct.price),
          stock_average: Number(editingProduct.stock_average),
          stock_danger: Number(editingProduct.stock_danger),
          description_short: editingProduct.description_short,
          is_stock_available: editingProduct.is_stock_available,
          status_id: editingProduct.status_id,
        }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false || data.error) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo actualizar el producto.",
        );
      }

      setEditingProduct(null);
      setFeedback({
        type: "success",
        message: "Producto actualizado correctamente.",
      });
      await refreshData();
    });
  };

  const handleDeleteProduct = async (productId: number) => {
    const token = getStoredToken();
    if (!token) return;

    await runAction(`product-delete-${productId}`, async () => {
      const response = await fetch(`/api/business/products?id=${productId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo eliminar el producto.",
        );
      }

      setFeedback({
        type: "success",
        message: "Producto eliminado correctamente.",
      });
      await refreshData();
    });
  };

  const handleToggleProduct = async (product: ProductItem) => {
    const token = getStoredToken();
    if (!token || !business) return;

    const nextStatusId = Number(product.status_id ?? 0) === 1 ? 2 : 1;

    await runAction(`product-toggle-${product.id}`, async () => {
      const response = await fetch("/api/business/products", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: product.id,
          business_id: business.id,
          status_id: nextStatusId,
          is_stock_available: nextStatusId === 1,
        }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false || data.error) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo cambiar el estado del producto.",
        );
      }

      setFeedback({
        type: "success",
        message: "Estado del producto actualizado.",
      });
      await refreshData();
    });
  };

  const submitSeller = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business) return;

    const token = getStoredToken();
    if (!token) return;

    await runAction("seller-create", async () => {
      const response = await fetch("/api/business/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...sellerForm,
          business_id: business.id,
        }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo agregar el vendedor.",
        );
      }

      const sellerUserId = Number(data.seller_user_id ?? 0);

      if (assignInitialTraining && initialTrainingId && sellerUserId > 0) {
        const assignmentResponse = await fetch(
          "/api/business/training-assignments",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              business_id: business.id,
              user_id: sellerUserId,
              training_id: Number(initialTrainingId),
              due_date: null,
            }),
          },
        );
        const assignmentData = await parseJsonResponse(assignmentResponse);

        if (!assignmentResponse.ok || assignmentData.success === false) {
          throw new Error(
            (typeof assignmentData.error === "string" &&
              assignmentData.error) ||
              "No se pudo asignar la capacitación inicial.",
          );
        }
      }

      setShowSellerModal(false);
      setSellerForm({
        selected_user_id: "",
        estado: "Activo",
        posicion: "Vendedor",
      });
      setSellerUserSearch("");
      setSellerSearchResults([]);
      setSellerSearchLoading(false);
      setSellerSearchMessage("");
      setSelectedSellerUser(null);
      setAssignInitialTraining(false);
      setInitialTrainingId("");
      setFeedback({
        type: "success",
        message: assignInitialTraining
          ? "Vendedor agregado y capacitación inicial asignada."
          : "Vendedor agregado correctamente.",
      });
      await refreshData();
    });
  };

  const addTrainingQuestion = () => {
    setTrainingForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          clientId: `question-${Date.now()}-${prev.questions.length + 1}`,
          question: "",
          options: ["", "", "", ""],
          correctIndex: 0,
        },
      ],
    }));
  };

  const submitTraining = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business) return;

    const token = getStoredToken();
    if (!token) return;

    await runAction("training-create", async () => {
      const response = await fetch("/api/business/trainings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          business_id: business.id,
          title: trainingForm.title,
          description: trainingForm.description,
          type: trainingForm.type,
          video_url: trainingForm.video_url,
          passing_score: Number(trainingForm.passing_score || 70),
          is_active: trainingForm.is_active,
          questions: trainingForm.questions.map((question) => ({
            question: question.question,
            options: question.options.map((option, optionIndex) => ({
              text: option,
              isCorrect: optionIndex === question.correctIndex,
            })),
          })),
        }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo crear la capacitación.",
        );
      }

      setTrainingForm({
        title: "",
        description: "",
        type: "video",
        video_url: "",
        passing_score: "70",
        is_active: true,
        questions: [],
      });
      setFeedback({
        type: "success",
        message: "Capacitación creada correctamente.",
      });
      await refreshData();
      setTrainingModalTab("assign");
    });
  };

  const submitTrainingAssignment = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!business) return;

    const token = getStoredToken();
    if (!token) return;

    await runAction("training-assign", async () => {
      const response = await fetch("/api/business/training-assignments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          business_id: business.id,
          user_id: Number(trainingAssignmentForm.user_id),
          training_id: Number(trainingAssignmentForm.training_id),
          due_date: trainingAssignmentForm.due_date || null,
        }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo asignar la capacitación.",
        );
      }

      setTrainingAssignmentForm({
        user_id: "",
        training_id: "",
        due_date: "",
      });
      setFeedback({
        type: "success",
        message: "Capacitación asignada correctamente.",
      });
      await refreshData();
      setTrainingModalTab("results");
    });
  };

  const handleUpdateSeller = async (seller: TeamMember, nextState: string) => {
    const token = getStoredToken();
    if (!token || !business) return;

    await runAction(`seller-update-${seller.id}`, async () => {
      const response = await fetch(
        `/api/business/team/${seller.id}?business_id=${business.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            business_id: business.id,
            nombre: seller.nombre,
            telefono: seller.telefono || "Sin teléfono",
            estado: nextState,
            posicion: seller.posicion,
          }),
        },
      );
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo actualizar el vendedor.",
        );
      }

      setFeedback({
        type: "success",
        message: "Vendedor actualizado correctamente.",
      });
      await refreshData();
    });
  };

  const handleRemoveSeller = async (sellerId: number) => {
    const token = getStoredToken();
    if (!token || !business) return;

    await runAction(`seller-delete-${sellerId}`, async () => {
      const response = await fetch(
        `/api/business/team/${sellerId}?business_id=${business.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo quitar el vendedor.",
        );
      }

      setFeedback({
        type: "success",
        message: "Vendedor quitado correctamente.",
      });
      await refreshData();
    });
  };

  const submitPromotion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business) return;

    const token = getStoredToken();
    if (!token) return;

    const endpoint = "/api/business/promotions";
    const method = promotionForm.id ? "PATCH" : "POST";
    const body = promotionForm.id
      ? {
          id: promotionForm.id,
          discount: Number(promotionForm.discount),
          start_date: promotionForm.start_date,
          end_date: promotionForm.end_date,
          active: promotionForm.active,
        }
      : {
          business_id: business.id,
          product_id: Number(promotionForm.product_id),
          discount: Number(promotionForm.discount),
          start_date: promotionForm.start_date,
          end_date: promotionForm.end_date,
        };

    await runAction("promotion-save", async () => {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo guardar la promoción.",
        );
      }

      setShowPromotionModal(false);
      setPromotionForm({
        product_id: "",
        discount: "",
        start_date: "",
        end_date: "",
        active: true,
      });
      setFeedback({
        type: "success",
        message: "Promoción guardada correctamente.",
      });
      await refreshData();
    });
  };

  const handlePausePromotion = async (promotionId: number, active: boolean) => {
    const token = getStoredToken();
    if (!token) return;

    await runAction(`promotion-toggle-${promotionId}`, async () => {
      const response = await fetch("/api/business/promotions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: promotionId,
          active: !active,
        }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo cambiar el estado de la promoción.",
        );
      }

      setFeedback({
        type: "success",
        message: "Promoción actualizada correctamente.",
      });
      await refreshData();
    });
  };

  const handleDeletePromotion = async (promotionId: number) => {
    const token = getStoredToken();
    if (!token) return;

    await runAction(`promotion-delete-${promotionId}`, async () => {
      const response = await fetch(
        `/api/business/promotions?id=${promotionId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await parseJsonResponse(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo eliminar la promoción.",
        );
      }

      setFeedback({
        type: "success",
        message: "Promoción eliminada correctamente.",
      });
      await refreshData();
    });
  };

  const handleSaveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business || !business.ownerId) return;

    const token = getStoredToken();
    if (!token) return;

    await runAction("business-settings", async () => {
      const response = await fetch(`/api/business/${business.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          owner_id: business.ownerId,
          name: settingsForm.name,
          business_category_id: Number(settingsForm.business_category_id),
          city: settingsForm.city,
          district: settingsForm.district,
          address: settingsForm.address,
          legal_name: settingsForm.legal_name,
          tax_id: settingsForm.tax_id,
          address_notes: settingsForm.address_notes,
          phone: settingsForm.phone,
          email: settingsForm.email,
          status_id: Number(settingsForm.status_id),
        }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok || data.error) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "No se pudo guardar la configuración.",
        );
      }

      setFeedback({
        type: "success",
        message: "Configuración guardada correctamente.",
      });
      await refreshData();
    });
  };

  const handleBusinessAvatarChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;

    if (!file || !business?.id) {
      return;
    }

    const allowedTypes = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);

    if (!allowedTypes.has(file.type)) {
      setFeedback({
        type: "error",
        message: "Solo se permiten imágenes JPG, PNG o WEBP.",
      });
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFeedback({
        type: "error",
        message: "La imagen no debe superar 5 MB.",
      });
      event.target.value = "";
      return;
    }

    const token = getStoredToken();

    if (!token) {
      setFeedback({
        type: "error",
        message: "Tu sesión expiró. Inicia sesión nuevamente.",
      });
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);

    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append("business_id", String(business.id));
      formData.append("avatar", file);

      const response = await fetch("/api/business/avatar", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!response.ok || payload?.success === false) {
        throw new Error(
          (typeof payload?.error === "string" && payload.error) ||
            "No se pudo actualizar la imagen del negocio.",
        );
      }

      const nextAvatarUrl =
        typeof payload?.avatar_url === "string" ? payload.avatar_url : null;

      setBusiness((prev) =>
        prev
          ? {
              ...prev,
              avatarUrl: nextAvatarUrl,
            }
          : prev,
      );
      setAvatarPreview(null);
      setFeedback({
        type: "success",
        message: "Imagen actualizada correctamente",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la imagen del negocio.",
      });
    } finally {
      URL.revokeObjectURL(localPreview);
      setAvatarUploading(false);
      event.target.value = "";
    }
  };

  const handleRemoveBusinessAvatar = async () => {
    if (!business?.id) {
      return;
    }

    const token = getStoredToken();

    if (!token) {
      setFeedback({
        type: "error",
        message: "Tu sesión expiró. Inicia sesión nuevamente.",
      });
      return;
    }

    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append("business_id", String(business.id));
      formData.append("remove", "1");

      const response = await fetch("/api/business/avatar", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!response.ok || payload?.success === false) {
        throw new Error(
          (typeof payload?.error === "string" && payload.error) ||
            "No se pudo eliminar la imagen del negocio.",
        );
      }

      setBusiness((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      setAvatarPreview(null);
      setFeedback({
        type: "success",
        message: "Imagen eliminada correctamente",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar la imagen del negocio.",
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const sections = [
    { id: "summary", label: "Resumen", icon: BarChart3 },
    { id: "orders", label: "Pedidos", icon: ClipboardList },
    { id: "products", label: "Productos", icon: ShoppingBag },
    { id: "inventory", label: "Inventario", icon: Warehouse },
    { id: "sellers", label: "Vendedores", icon: Users },
    { id: "promotions", label: "Promociones", icon: Megaphone },
    { id: "sales", label: "Ventas", icon: ShieldCheck },
    { id: "settings", label: "Configuración", icon: Settings },
  ] as const;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f6f8] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[28px] border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500 shadow-xl">
          Cargando panel administrativo...
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
        <section className="relative overflow-hidden bg-orange-700 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,214,153,0.24),transparent_30%),linear-gradient(135deg,rgba(194,65,12,0.98)_0%,rgba(234,88,12,0.96)_45%,rgba(249,115,22,0.9)_100%)]" />
          <div className="absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_center,rgba(255,237,213,0.1),transparent_60%)]" />
          <div className="relative z-10 mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 lg:px-8">
            <div className="relative flex flex-col gap-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <UserAvatar
                      name={business?.name ?? "Tu negocio"}
                      src={avatarPreview || business?.avatarUrl}
                      size={88}
                      className="rounded-[28px] border-4 border-white/30 shadow-xl"
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="absolute -bottom-1 -right-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white text-orange-600 shadow-lg transition hover:bg-orange-50 disabled:opacity-60"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleBusinessAvatarChange}
                    />
                  </div>

                  <div className="max-w-4xl space-y-2.5">
                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-100/90 sm:text-sm">
                      Panel administrativo del negocio
                    </p>
                    <h1 className="text-3xl font-black leading-tight text-white drop-shadow-[0_6px_22px_rgba(124,45,18,0.35)] sm:text-4xl">
                      Panel de administración de{" "}
                      {business?.name ?? "tu negocio"}
                    </h1>
                    <p className="max-w-3xl text-sm font-semibold leading-6 text-white/92 sm:text-base">
                      Gestiona vendedores, productos, ventas, promociones e
                      inventario de tu negocio.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="rounded-full border border-white/20 bg-black/15 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                      >
                        {avatarUploading ? "Subiendo..." : "Cambiar foto"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveBusinessAvatar}
                        disabled={avatarUploading || !business?.avatarUrl}
                        className="rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white disabled:opacity-40"
                      >
                        Eliminar foto
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative mt-5 flex flex-wrap items-center gap-2.5">
              {businessOptions.length > 1 ? (
                <select
                  value={selectedBusinessId ?? ""}
                  onChange={(event) =>
                    setSelectedBusinessId(Number(event.target.value))
                  }
                  className="rounded-xl border border-white/20 bg-black/15 px-3.5 py-2 text-sm font-semibold text-white outline-none"
                >
                  {businessOptions.map((option) => (
                    <option
                      key={`business-${option.id}`}
                      value={option.id}
                      className="text-slate-900"
                    >
                      {option.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <span className="rounded-full border border-white/20 bg-black/15 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/90">
                {business?.categoryName ?? "Negocio"}
              </span>
              <span className="rounded-full border border-white/20 bg-black/15 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/90">
                {business?.isOpen ? "Abierto" : "Cerrado"}
              </span>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-8 max-w-7xl px-4 pb-16 sm:mt-10 sm:px-6 lg:px-8">
          {feedback ? (
            <div
              className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {feedback.message}
            </div>
          ) : null}

          {error ? (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard
              label="Ventas de hoy"
              value={formatCurrency(salesMetrics.salesToday)}
            />
            <StatCard
              label="Pedidos activos"
              value={String(business?.activeOrdersCount ?? 0)}
            />
            <StatCard
              label="Productos publicados"
              value={String(activeProductsCount)}
            />
            <StatCard
              label="Vendedores activos"
              value={String(activeSellersCount)}
            />
            <StatCard
              label="Promociones activas"
              value={String(activePromotionsCount)}
            />
            <StatCard
              label="Ganancias del mes"
              value={formatCurrency(salesMetrics.monthlySales)}
            />
          </section>

          <div className="mt-10 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-3">
              {sections.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold transition ${
                      active
                        ? "bg-slate-950 text-white shadow-lg"
                        : "bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2.5 xl:justify-end">
              <Link
                href={
                  business?.id
                    ? `/business/products/${business.id}/new`
                    : "/business"
                }
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                <PackagePlus className="h-4 w-4" />
                Agregar producto
              </Link>
              <button
                type="button"
                onClick={() => setShowPromotionModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-white shadow-sm transition hover:bg-orange-600"
              >
                <Megaphone className="h-4 w-4" />
                Crear promoción
              </button>
              <button
                type="button"
                onClick={() => setShowSellerModal(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <UserPlus className="h-4 w-4" />
                Agregar vendedor
              </button>
              <button
                type="button"
                onClick={() => setShowTrainingModal(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Sparkles className="h-4 w-4" />
                Capacitación
              </button>
            </div>
          </div>

          <div className="mt-10 grid gap-6">
            {activeSection === "summary" ? (
              <>
                <div className="grid gap-6 xl:grid-cols-[1.4fr,0.8fr]">
                  <PanelCard title="Resumen de ventas">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {weeklySales.days.map((day) => (
                        <div
                          key={day.day}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                            {day.day}
                          </p>
                          <p className="mt-3 text-xl font-black text-slate-950">
                            {formatCurrency(day.sales_total)}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-500">
                            {day.orders_count} pedidos
                          </p>
                        </div>
                      ))}
                    </div>
                  </PanelCard>

                  <PanelCard title="Promociones activas">
                    <div className="grid gap-3">
                      {promotions
                        .filter((item) => item.active)
                        .slice(0, 4)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-orange-200 bg-orange-50 p-4"
                          >
                            <p className="font-black text-slate-950">
                              {item.product_name}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-orange-700">
                              {item.offer_price !== null &&
                              item.offer_price !== undefined
                                ? `${formatCurrency(item.regular_price ?? 0)} a ${formatCurrency(item.offer_price)}`
                                : `${item.discount}% de descuento`}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {item.start_date} - {item.end_date}
                            </p>
                          </div>
                        ))}
                      {!promotions.some((item) => item.active) ? (
                        <EmptyState text="No hay promociones activas." />
                      ) : null}
                    </div>
                  </PanelCard>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <PanelCard title="Pedidos recientes">
                    <div className="grid gap-3">
                      {recentOrders.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-slate-950">
                                #{order.id} · {order.customerName}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-500">
                                {order.paymentMethod} ·{" "}
                                {formatDateTime(order.placedAt)}
                              </p>
                            </div>
                            <span className="text-sm font-black text-orange-600">
                              {formatCurrency(order.total)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PanelCard>

                  <PanelCard title="Productos con bajo stock">
                    <div className="grid gap-3">
                      {stockAlerts.slice(0, 6).map((alert) => (
                        <div
                          key={alert.id}
                          className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-black text-slate-950">
                                {alert.name}
                              </p>
                              <p className="text-sm font-semibold text-slate-500">
                                {alert.category}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-amber-700">
                                Stock: {alert.stock}
                              </p>
                              <p className="text-xs font-semibold text-slate-500">
                                Mínimo: {alert.stock_minimo}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {stockAlerts.length === 0 ? (
                        <EmptyState text="No hay alertas de stock por ahora." />
                      ) : null}
                    </div>
                  </PanelCard>
                </div>
              </>
            ) : null}

            {activeSection === "orders" ? (
              <PanelCard title="Pedidos del negocio">
                <div className="grid gap-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <p className="text-lg font-black text-slate-950">
                            #{order.id} · {order.customerName}
                          </p>
                          <p className="text-sm font-semibold text-slate-500">
                            {order.paymentMethod} ·{" "}
                            {formatCurrency(order.total)}
                          </p>
                          <p className="text-sm text-slate-500">
                            {order.address || "Sin dirección"}
                          </p>
                          {order.deliveryName ? (
                            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-3 py-2">
                              <UserAvatar
                                name={order.deliveryName}
                                src={order.deliveryProfileImageUrl}
                                size={40}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900">
                                  {order.deliveryName}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {order.deliveryPhone || "Sin teléfono"} ·{" "}
                                  {order.deliveryStatus || "Asignado"}
                                </p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip status={order.status} />
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-700"
                          >
                            Ver detalle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOrderPreparation(order.id)}
                            disabled={busyKey === `order-prep-${order.id}`}
                            className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-white disabled:opacity-60"
                          >
                            En preparación
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOrderReady(order.id)}
                            disabled={busyKey === `order-ready-${order.id}`}
                            className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-white disabled:opacity-60"
                          >
                            Marcar listo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestDriver(order.id)}
                            disabled={busyKey === `order-driver-${order.id}`}
                            className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-orange-700 disabled:opacity-60"
                          >
                            Solicitar repartidor
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {orders.length === 0 ? (
                    <EmptyState text="No hay pedidos para mostrar." />
                  ) : null}
                </div>
              </PanelCard>
            ) : null}

            {activeSection === "products" ? (
              <PanelCard title="Productos publicados">
                <div className="mb-4 flex justify-end">
                  <Link
                    href={
                      business?.id
                        ? `/business/products/${business.id}/new`
                        : "/business"
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white"
                  >
                    <PackagePlus className="h-4 w-4" />
                    Agregar producto
                  </Link>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-black text-slate-950">
                            {product.name}
                          </p>
                          <p className="text-sm font-semibold text-slate-500">
                            {product.category_name ?? "Sin categoría"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
                            Number(product.status_id ?? 0) === 1
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {Number(product.status_id ?? 0) === 1
                            ? "Activo"
                            : "Inactivo"}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
                        <p>
                          Precio: {formatCurrency(Number(product.price ?? 0))}
                        </p>
                        <p>Stock: {Number(product.stock_average ?? 0)}</p>
                        <p>Stock mínimo: {Number(product.stock_danger ?? 0)}</p>
                        <p>
                          Estado stock:{" "}
                          {product.is_stock_available
                            ? "Disponible"
                            : "Sin stock"}
                        </p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingProduct({
                              id: product.id,
                              name: product.name,
                              price: String(product.price ?? 0),
                              stock_average: String(product.stock_average ?? 0),
                              stock_danger: String(product.stock_danger ?? 0),
                              description_short:
                                product.description_short ?? "",
                              is_stock_available: Boolean(
                                product.is_stock_available,
                              ),
                              status_id: Number(product.status_id ?? 1) || 1,
                            })
                          }
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-700"
                        >
                          Editar producto
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleProduct(product)}
                          disabled={busyKey === `product-toggle-${product.id}`}
                          className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-orange-700 disabled:opacity-60"
                        >
                          {Number(product.status_id ?? 0) === 1
                            ? "Desactivar"
                            : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product.id)}
                          disabled={busyKey === `product-delete-${product.id}`}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-rose-700 disabled:opacity-60"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </PanelCard>
            ) : null}

            {activeSection === "inventory" ? (
              <PanelCard title="Inventario">
                <div className="grid gap-4 xl:grid-cols-2">
                  {products.map((product) => {
                    const lowStock =
                      Number(product.stock_average ?? 0) <=
                      Number(product.stock_danger ?? 0);

                    return (
                      <div
                        key={product.id}
                        className={`rounded-2xl border p-4 ${
                          lowStock
                            ? "border-amber-200 bg-amber-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-slate-950">
                              {product.name}
                            </p>
                            <p className="text-sm font-semibold text-slate-500">
                              {product.category_name ?? "Sin categoría"}
                            </p>
                          </div>
                          {lowStock ? (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-amber-700">
                              Bajo stock
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600">
                          <p>
                            Stock actual: {Number(product.stock_average ?? 0)}
                          </p>
                          <p>
                            Stock mínimo: {Number(product.stock_danger ?? 0)}
                          </p>
                        </div>
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingProduct({
                                id: product.id,
                                name: product.name,
                                price: String(product.price ?? 0),
                                stock_average: String(
                                  product.stock_average ?? 0,
                                ),
                                stock_danger: String(product.stock_danger ?? 0),
                                description_short:
                                  product.description_short ?? "",
                                is_stock_available: Boolean(
                                  product.is_stock_available,
                                ),
                                status_id: Number(product.status_id ?? 1) || 1,
                              })
                            }
                            className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-white"
                          >
                            Actualizar inventario
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PanelCard>
            ) : null}

            {activeSection === "sellers" ? (
              <PanelCard title="Vendedores">
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSellerModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white"
                  >
                    <UserPlus className="h-4 w-4" />
                    Agregar vendedor
                  </button>
                </div>
                <div className="grid gap-4">
                  {team.map((seller) => (
                    <div
                      key={`seller-${seller.id}-${seller.correo}-${seller.source}`}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-lg font-black text-slate-950">
                            {seller.nombre}
                          </p>
                          <p className="text-sm font-semibold text-slate-500">
                            {seller.correo} ·{" "}
                            {seller.telefono || "Sin teléfono"}
                          </p>
                          <p className="text-sm font-semibold text-slate-500">
                            {seller.posicion} · {seller.desempeño} ·{" "}
                            {seller.pedidos} pedidos
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
                              seller.estado === "Activo"
                                ? "bg-emerald-100 text-emerald-700"
                                : seller.estado === "En capacitación"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {seller.estado}
                          </span>
                          {seller.source === "manager" ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateSeller(
                                    seller,
                                    seller.estado === "Activo"
                                      ? "Inactivo"
                                      : "Activo",
                                  )
                                }
                                disabled={
                                  busyKey === `seller-update-${seller.id}`
                                }
                                className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-orange-700 disabled:opacity-60"
                              >
                                {seller.estado === "Activo"
                                  ? "Desactivar"
                                  : "Activar"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateSeller(seller, "En capacitación")
                                }
                                disabled={
                                  busyKey === `seller-update-${seller.id}`
                                }
                                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-700 disabled:opacity-60"
                              >
                                Cambiar permisos
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSeller(seller.id)}
                                disabled={
                                  busyKey === `seller-delete-${seller.id}`
                                }
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-rose-700 disabled:opacity-60"
                              >
                                Quitar vendedor
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </PanelCard>
            ) : null}

            {activeSection === "promotions" ? (
              <PanelCard title="Promociones">
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setPromotionForm({
                        product_id: "",
                        discount: "",
                        start_date: "",
                        end_date: "",
                        active: true,
                      });
                      setShowPromotionModal(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white"
                  >
                    <Megaphone className="h-4 w-4" />
                    Crear promoción
                  </button>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {promotions.map((promotion) => (
                    <div
                      key={promotion.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-black text-slate-950">
                            {promotion.product_name}
                          </p>
                          <p className="text-sm font-semibold text-slate-500">
                            {promotion.title ?? "Promoción"} ·{" "}
                            {promotion.start_date} a{" "}
                            {promotion.end_date || "sin fin"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                              Normal:{" "}
                              {formatCurrency(promotion.regular_price ?? 0)}
                            </span>
                            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-orange-700">
                              Oferta:{" "}
                              {promotion.offer_price !== null &&
                              promotion.offer_price !== undefined
                                ? formatCurrency(promotion.offer_price)
                                : "Sin precio oferta"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                              {promotion.promotion_type === "precio_oferta"
                                ? "Precio oferta"
                                : `${promotion.discount}% descuento`}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
                            promotion.active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {promotion.active ? "Activa" : "Pausada"}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPromotionForm({
                              id: promotion.id,
                              product_id: promotion.product_id,
                              discount: String(promotion.discount),
                              start_date: promotion.start_date,
                              end_date: promotion.end_date,
                              active: promotion.active,
                            });
                            setShowPromotionModal(true);
                          }}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-700"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handlePausePromotion(promotion.id, promotion.active)
                          }
                          disabled={
                            busyKey === `promotion-toggle-${promotion.id}`
                          }
                          className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-orange-700 disabled:opacity-60"
                        >
                          {promotion.active ? "Pausar" : "Reactivar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePromotion(promotion.id)}
                          disabled={
                            busyKey === `promotion-delete-${promotion.id}`
                          }
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-rose-700 disabled:opacity-60"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                  {promotions.length === 0 ? (
                    <EmptyState text="No hay promociones registradas." />
                  ) : null}
                </div>
              </PanelCard>
            ) : null}

            {activeSection === "sales" ? (
              <PanelCard title="Ventas">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Ventas por semana"
                    value={formatCurrency(
                      weeklySales.current_period_sales_total,
                    )}
                  />
                  <StatCard
                    label="Ventas por mes"
                    value={formatCurrency(salesMetrics.monthlySales)}
                  />
                  <StatCard
                    label="Pedidos entregados"
                    value={String(salesMetrics.deliveredOrders)}
                  />
                  <StatCard
                    label="Ticket promedio"
                    value={formatCurrency(salesMetrics.averageTicket)}
                  />
                </div>
                <div className="mt-6 grid gap-6 xl:grid-cols-[1fr,0.9fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-950">
                      Ventas por día
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {weeklySales.days.map((day) => (
                        <div key={day.day} className="rounded-xl bg-white p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                            {day.day}
                          </p>
                          <p className="mt-2 text-lg font-black text-slate-950">
                            {formatCurrency(day.sales_total)}
                          </p>
                          <p className="text-sm font-semibold text-slate-500">
                            {day.orders_count} pedidos
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-950">
                      Métodos de pago
                    </p>
                    <div className="mt-4 grid gap-3">
                      {salesMetrics.paymentMethods.map(([method, total]) => (
                        <div
                          key={method}
                          className="flex items-center justify-between rounded-xl bg-white px-4 py-3"
                        >
                          <span className="font-semibold text-slate-600">
                            {method}
                          </span>
                          <span className="font-black text-slate-950">
                            {formatCurrency(total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </PanelCard>
            ) : null}

            {activeSection === "settings" ? (
              <PanelCard title="Configuración del negocio">
                <form
                  onSubmit={handleSaveSettings}
                  className="grid gap-4 md:grid-cols-2"
                >
                  <Field
                    label="Nombre del negocio"
                    value={settingsForm.name}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({ ...prev, name: value }))
                    }
                  />
                  <label className="grid gap-1">
                    <span className="text-sm font-bold text-slate-600">
                      Categoría
                    </span>
                    <select
                      value={settingsForm.business_category_id}
                      onChange={(event) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          business_category_id: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
                    >
                      <option value="">Selecciona una categoría</option>
                      {businessCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Ciudad"
                    value={settingsForm.city}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({ ...prev, city: value }))
                    }
                  />
                  <Field
                    label="Distrito"
                    value={settingsForm.district}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({ ...prev, district: value }))
                    }
                  />
                  <Field
                    label="Dirección"
                    value={settingsForm.address}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({ ...prev, address: value }))
                    }
                    className="md:col-span-2"
                  />
                  <Field
                    label="Teléfono"
                    value={settingsForm.phone}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({ ...prev, phone: value }))
                    }
                  />
                  <Field
                    label="Correo"
                    value={settingsForm.email}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({ ...prev, email: value }))
                    }
                  />
                  <Field
                    label="Razón social"
                    value={settingsForm.legal_name}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        legal_name: value,
                      }))
                    }
                  />
                  <Field
                    label="RFC / Tax ID"
                    value={settingsForm.tax_id}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({ ...prev, tax_id: value }))
                    }
                  />
                  <Field
                    label="Notas de dirección"
                    value={settingsForm.address_notes}
                    onChange={(value) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        address_notes: value,
                      }))
                    }
                    className="md:col-span-2"
                  />
                  <label className="grid gap-1">
                    <span className="text-sm font-bold text-slate-600">
                      Estado
                    </span>
                    <select
                      value={settingsForm.status_id}
                      onChange={(event) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          status_id: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
                    >
                      <option value="1">Abierto / activo</option>
                      <option value="2">Cerrado / inactivo</option>
                    </select>
                  </label>
                  <div className="flex items-end justify-end md:col-span-2">
                    <button
                      type="submit"
                      disabled={busyKey === "business-settings"}
                      className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                    >
                      Guardar cambios
                    </button>
                  </div>
                </form>
              </PanelCard>
            ) : null}
          </div>
        </div>
      </main>

      <AdminModal
        title={
          selectedOrder ? `Pedido #${selectedOrder.id}` : "Detalle del pedido"
        }
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
      >
        {selectedOrder ? (
          <div className="grid gap-4 text-sm text-slate-600">
            <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wide text-white/60">
                Cliente
              </p>
              <p className="mt-1 text-xl font-black">
                {selectedOrder.customerName}
              </p>
              <p className="mt-2 text-sm text-white/80">
                {selectedOrder.paymentMethod} ·{" "}
                {formatCurrency(selectedOrder.total)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Dirección
              </p>
              <p className="mt-1 font-semibold text-slate-700">
                {selectedOrder.address || "Sin dirección"}
              </p>
            </div>
            {selectedOrder.deliveryName ? (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
                  Repartidor asignado
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <UserAvatar
                    name={selectedOrder.deliveryName}
                    src={selectedOrder.deliveryProfileImageUrl}
                    size={52}
                  />
                  <div>
                    <p className="text-base font-black text-slate-900">
                      {selectedOrder.deliveryName}
                    </p>
                    <p className="text-sm font-semibold text-slate-600">
                      {selectedOrder.deliveryPhone || "Sin teléfono"}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
                      {selectedOrder.deliveryStatus || "Asignado"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Productos
              </p>
              <ul className="mt-3 grid gap-2">
                {selectedOrder.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                  >
                    <span className="font-semibold text-slate-700">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-black text-slate-950">
                      {formatCurrency(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        title="Editar producto"
        open={Boolean(editingProduct)}
        onClose={() => setEditingProduct(null)}
      >
        {editingProduct ? (
          <form onSubmit={saveProduct} className="grid gap-4 md:grid-cols-2">
            <Field
              label="Nombre"
              value={editingProduct.name}
              onChange={(value) =>
                setEditingProduct((prev) =>
                  prev ? { ...prev, name: value } : prev,
                )
              }
              className="md:col-span-2"
            />
            <Field
              label="Precio"
              type="number"
              value={editingProduct.price}
              onChange={(value) =>
                setEditingProduct((prev) =>
                  prev ? { ...prev, price: value } : prev,
                )
              }
            />
            <Field
              label="Stock actual"
              type="number"
              value={editingProduct.stock_average}
              onChange={(value) =>
                setEditingProduct((prev) =>
                  prev ? { ...prev, stock_average: value } : prev,
                )
              }
            />
            <Field
              label="Stock mínimo"
              type="number"
              value={editingProduct.stock_danger}
              onChange={(value) =>
                setEditingProduct((prev) =>
                  prev ? { ...prev, stock_danger: value } : prev,
                )
              }
            />
            <label className="grid gap-1">
              <span className="text-sm font-bold text-slate-600">Estado</span>
              <select
                value={editingProduct.status_id}
                onChange={(event) =>
                  setEditingProduct((prev) =>
                    prev
                      ? { ...prev, status_id: Number(event.target.value) }
                      : prev,
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
              >
                <option value={1}>Activo</option>
                <option value={2}>Inactivo</option>
              </select>
            </label>
            <Field
              label="Descripción corta"
              value={editingProduct.description_short}
              onChange={(value) =>
                setEditingProduct((prev) =>
                  prev ? { ...prev, description_short: value } : prev,
                )
              }
              className="md:col-span-2"
            />
            <div className="flex justify-end md:col-span-2">
              <button
                type="submit"
                disabled={busyKey === `product-save-${editingProduct.id}`}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
              >
                Guardar producto
              </button>
            </div>
          </form>
        ) : null}
      </AdminModal>

      <AdminModal
        title="Agregar vendedor"
        open={showSellerModal}
        onClose={() => {
          setShowSellerModal(false);
          setSellerUserSearch("");
          setSellerSearchResults([]);
          setSellerSearchLoading(false);
          setSellerSearchMessage("");
          setSelectedSellerUser(null);
          setSellerForm({
            selected_user_id: "",
            estado: "Activo",
            posicion: "Vendedor",
          });
          setAssignInitialTraining(false);
          setInitialTrainingId("");
        }}
      >
        <form onSubmit={submitSeller} className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-bold text-slate-600">
              Buscar usuario registrado
            </span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={sellerUserSearch}
                onChange={(event) => {
                  setSellerUserSearch(event.target.value);
                  if (selectedSellerUser) {
                    setSelectedSellerUser(null);
                    setSellerForm((prev) => ({
                      ...prev,
                      selected_user_id: "",
                    }));
                  }
                }}
                placeholder="Busca por nombre, correo o teléfono"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
              />
              <button
                type="button"
                onClick={() => {
                  setSellerUserSearch("");
                  setSellerSearchResults([]);
                  setSellerSearchMessage("");
                  setSelectedSellerUser(null);
                  setSellerForm((prev) => ({
                    ...prev,
                    selected_user_id: "",
                  }));
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-700"
              >
                Limpiar selección
              </button>
            </div>
            {selectedSellerUser ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Usuario seleccionado: {selectedSellerUser.name} —{" "}
                {selectedSellerUser.email}
              </div>
            ) : null}
            {!selectedSellerUser && sellerSearchLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                Buscando…
              </div>
            ) : null}
            {!selectedSellerUser && sellerSearchMessage ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                {sellerSearchMessage}
              </div>
            ) : null}
            {!selectedSellerUser && sellerSearchResults.length > 0 ? (
              <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                {sellerSearchResults.slice(0, 10).map((user) => (
                  <button
                    key={`user-${user.id}-${user.email}`}
                    type="button"
                    onClick={() => {
                      setSelectedSellerUser(user);
                      setSellerUserSearch(user.name);
                      setSellerSearchResults([]);
                      setSellerSearchMessage("");
                      setSellerForm((prev) => ({
                        ...prev,
                        selected_user_id: String(user.id),
                      }));
                    }}
                    className="flex w-full flex-col items-start border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0"
                  >
                    <span className="text-sm font-bold text-slate-900">
                      {user.name}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {user.email}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <Field
            label="Permiso / posición"
            value={sellerForm.posicion}
            onChange={(value) =>
              setSellerForm((prev) => ({ ...prev, posicion: value }))
            }
          />
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-bold text-slate-600">Estado</span>
            <select
              value={sellerForm.estado}
              onChange={(event) =>
                setSellerForm((prev) => ({
                  ...prev,
                  estado: event.target.value,
                }))
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
            >
              <option value="Activo">Activo</option>
              <option value="En capacitación">En capacitación</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
            <input
              type="checkbox"
              checked={assignInitialTraining}
              onChange={(event) =>
                setAssignInitialTraining(event.target.checked)
              }
              className="size-4 rounded border-slate-300 text-orange-600"
            />
            <span className="text-sm font-bold text-slate-700">
              Asignar capacitación inicial
            </span>
          </label>
          {assignInitialTraining ? (
            <label className="grid gap-1 md:col-span-2">
              <span className="text-sm font-bold text-slate-600">
                Capacitación obligatoria
              </span>
              <select
                value={initialTrainingId}
                onChange={(event) => setInitialTrainingId(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
              >
                <option value="">Selecciona una capacitación</option>
                {trainings
                  .filter((training) => training.is_active)
                  .map((training) => (
                    <option key={training.id} value={training.id}>
                      {training.title}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <div className="flex justify-end md:col-span-2">
            <button
              type="submit"
              disabled={busyKey === "seller-create"}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              Guardar vendedor
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        title={promotionForm.id ? "Editar promoción" : "Crear promoción"}
        open={showPromotionModal}
        onClose={() => setShowPromotionModal(false)}
      >
        <form onSubmit={submitPromotion} className="grid gap-4 md:grid-cols-2">
          {!promotionForm.id ? (
            <label className="grid gap-1 md:col-span-2">
              <span className="text-sm font-bold text-slate-600">Producto</span>
              <select
                value={promotionForm.product_id}
                onChange={(event) =>
                  setPromotionForm((prev) => ({
                    ...prev,
                    product_id: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
              >
                <option value="">Selecciona un producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Field
            label="Descuento %"
            type="number"
            value={promotionForm.discount}
            onChange={(value) =>
              setPromotionForm((prev) => ({ ...prev, discount: value }))
            }
          />
          <Field
            label="Fecha inicio"
            type="date"
            value={promotionForm.start_date}
            onChange={(value) =>
              setPromotionForm((prev) => ({ ...prev, start_date: value }))
            }
          />
          <Field
            label="Fecha fin"
            type="date"
            value={promotionForm.end_date}
            onChange={(value) =>
              setPromotionForm((prev) => ({ ...prev, end_date: value }))
            }
          />
          {promotionForm.id ? (
            <label className="grid gap-1">
              <span className="text-sm font-bold text-slate-600">Estado</span>
              <select
                value={promotionForm.active ? "1" : "0"}
                onChange={(event) =>
                  setPromotionForm((prev) => ({
                    ...prev,
                    active: event.target.value === "1",
                  }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
              >
                <option value="1">Activa</option>
                <option value="0">Pausada</option>
              </select>
            </label>
          ) : null}
          <div className="flex justify-end md:col-span-2">
            <button
              type="submit"
              disabled={busyKey === "promotion-save"}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
            >
              Guardar promoción
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        title="Capacitación del equipo"
        open={showTrainingModal}
        onClose={() => setShowTrainingModal(false)}
      >
        <div className="pr-1">
          <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
            Crea materiales con video, agrega evaluaciones y asigna la
            capacitación correcta a cada vendedor sin salir del panel.
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {[
              { id: "create", label: "Crear capacitación" },
              { id: "assign", label: "Asignar capacitación" },
              { id: "results", label: "Ver resultados" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setTrainingModalTab(tab.id as "create" | "assign" | "results")
                }
                className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${
                  trainingModalTab === tab.id
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {trainingModalTab === "create" ? (
            <form
              onSubmit={submitTraining}
              className="grid gap-4 md:grid-cols-2"
            >
              <Field
                label="Título"
                value={trainingForm.title}
                onChange={(value) =>
                  setTrainingForm((prev) => ({ ...prev, title: value }))
                }
                className="md:col-span-2"
              />
              <Field
                label="Descripción"
                value={trainingForm.description}
                onChange={(value) =>
                  setTrainingForm((prev) => ({ ...prev, description: value }))
                }
                className="md:col-span-2"
              />
              <label className="grid gap-1">
                <span className="text-sm font-bold text-slate-600">Tipo</span>
                <select
                  value={trainingForm.type}
                  onChange={(event) =>
                    setTrainingForm((prev) => ({
                      ...prev,
                      type: event.target.value as
                        | "video"
                        | "test"
                        | "video_test",
                    }))
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
                >
                  <option value="video">Solo video</option>
                  <option value="test">Solo test</option>
                  <option value="video_test">Video + test</option>
                </select>
              </label>
              <Field
                label="Puntaje mínimo para aprobar"
                type="number"
                value={trainingForm.passing_score}
                onChange={(value) =>
                  setTrainingForm((prev) => ({ ...prev, passing_score: value }))
                }
              />

              {trainingForm.type === "video" ||
              trainingForm.type === "video_test" ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                    <div className="mb-3 flex items-center gap-2 text-slate-900">
                      <PlayCircle className="h-4 w-4 text-orange-600" />
                      <p className="text-sm font-black">Sección de video</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-500">
                      Puedes pegar un enlace de YouTube o Drive, o cargar un
                      archivo de video directamente.
                    </p>
                  </div>
                  <Field
                    label="Enlace del video"
                    value={trainingForm.video_url}
                    onChange={(value) =>
                      setTrainingForm((prev) => ({ ...prev, video_url: value }))
                    }
                    className="md:col-span-2"
                  />
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-sm font-bold text-slate-600">
                      Subir video o pegar enlace
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;

                        try {
                          const dataUrl = await fileToDataUrl(file);
                          setTrainingForm((prev) => ({
                            ...prev,
                            video_url: dataUrl,
                          }));
                        } catch (error) {
                          setFeedback({
                            type: "error",
                            message:
                              error instanceof Error
                                ? error.message
                                : "No se pudo cargar el video.",
                          });
                        }
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                    />
                  </label>
                </>
              ) : null}

              {trainingForm.type === "test" ||
              trainingForm.type === "video_test" ? (
                <div className="grid gap-4 md:col-span-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">
                          Preguntas del test
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          Cada pregunta debe tener 4 opciones y una respuesta
                          correcta.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addTrainingQuestion}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-700"
                      >
                        + Agregar pregunta
                      </button>
                    </div>
                  </div>
                  {trainingForm.questions.map((question, questionIndex) => (
                    <div
                      key={question.clientId}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <Field
                        label={`Pregunta ${questionIndex + 1}`}
                        value={question.question}
                        onChange={(value) =>
                          setTrainingForm((prev) => ({
                            ...prev,
                            questions: prev.questions.map((item, index) =>
                              index === questionIndex
                                ? { ...item, question: value }
                                : item,
                            ),
                          }))
                        }
                        className="mb-3"
                      />
                      <div className="grid gap-3 md:grid-cols-2">
                        {question.options.map((option, optionIndex) => (
                          <label
                            key={`${question.clientId}-option-${optionIndex + 1}`}
                            className="grid gap-1"
                          >
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              Opción {optionIndex + 1}
                            </span>
                            <input
                              type="text"
                              value={option}
                              onChange={(event) =>
                                setTrainingForm((prev) => ({
                                  ...prev,
                                  questions: prev.questions.map(
                                    (item, index) =>
                                      index === questionIndex
                                        ? {
                                            ...item,
                                            options: item.options.map(
                                              (currentOption, currentIndex) =>
                                                currentIndex === optionIndex
                                                  ? event.target.value
                                                  : currentOption,
                                            ),
                                          }
                                        : item,
                                  ),
                                }))
                              }
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
                            />
                          </label>
                        ))}
                      </div>
                      <label className="mt-3 grid gap-1">
                        <span className="text-sm font-bold text-slate-600">
                          Respuesta correcta
                        </span>
                        <select
                          value={question.correctIndex}
                          onChange={(event) =>
                            setTrainingForm((prev) => ({
                              ...prev,
                              questions: prev.questions.map((item, index) =>
                                index === questionIndex
                                  ? {
                                      ...item,
                                      correctIndex: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            }))
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
                        >
                          <option value={0}>Opción 1</option>
                          <option value={1}>Opción 2</option>
                          <option value={2}>Opción 3</option>
                          <option value={3}>Opción 4</option>
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex justify-end md:col-span-2">
                <button
                  type="submit"
                  disabled={busyKey === "training-create"}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                >
                  Guardar capacitación
                </button>
              </div>
            </form>
          ) : null}

          {trainingModalTab === "assign" ? (
            <form
              onSubmit={submitTrainingAssignment}
              className="grid gap-4 md:grid-cols-2"
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <p className="text-sm font-black text-slate-950">
                  Asignar capacitación al equipo
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Define el vendedor, la capacitación y una fecha límite para
                  dar seguimiento al avance.
                </p>
              </div>
              <label className="grid gap-1">
                <span className="text-sm font-bold text-slate-600">
                  Vendedor
                </span>
                <select
                  value={trainingAssignmentForm.user_id}
                  onChange={(event) =>
                    setTrainingAssignmentForm((prev) => ({
                      ...prev,
                      user_id: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
                >
                  <option value="">Selecciona un vendedor</option>
                  {team
                    .filter((seller) => seller.source === "manager")
                    .map((seller) => (
                      <option
                        key={`seller-option-${seller.id}-${seller.correo}`}
                        value={seller.id}
                      >
                        {seller.nombre}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-bold text-slate-600">
                  Capacitación
                </span>
                <select
                  value={trainingAssignmentForm.training_id}
                  onChange={(event) =>
                    setTrainingAssignmentForm((prev) => ({
                      ...prev,
                      training_id: event.target.value,
                    }))
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
                >
                  <option value="">Selecciona una capacitación</option>
                  {trainings
                    .filter((training) => training.is_active)
                    .map((training) => (
                      <option key={training.id} value={training.id}>
                        {training.title}
                      </option>
                    ))}
                </select>
              </label>
              <Field
                label="Fecha límite"
                type="date"
                value={trainingAssignmentForm.due_date}
                onChange={(value) =>
                  setTrainingAssignmentForm((prev) => ({
                    ...prev,
                    due_date: value,
                  }))
                }
              />
              <div className="flex items-end justify-end md:col-span-2">
                <button
                  type="submit"
                  disabled={busyKey === "training-assign"}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                >
                  Asignar
                </button>
              </div>
            </form>
          ) : null}

          {trainingModalTab === "results" ? (
            <div className="grid gap-3">
              {trainingResults.map((result) => (
                <div
                  key={result.assignment_id}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1.1fr_1fr_0.7fr_0.7fr]"
                >
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      {result.seller_name}
                    </p>
                    <p className="text-sm font-semibold text-slate-500">
                      {result.training_title}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Estado
                    </p>
                    <p
                      className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
                        result.status === "aprobado"
                          ? "bg-emerald-100 text-emerald-700"
                          : result.status === "reprobado"
                            ? "bg-rose-100 text-rose-700"
                            : result.status === "en_progreso"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {result.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Puntaje
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {result.score}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Fecha
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {formatDateTime(result.completed_at ?? result.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              {trainingResults.length === 0 ? (
                <EmptyState text="Aún no hay resultados de capacitaciones." />
              ) : null}
            </div>
          ) : null}
        </div>
      </AdminModal>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function PanelCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-slate-950">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-orange-300"
      />
    </label>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = normalizeStatus(status);
  const tone =
    normalized === "pedido_entregado" || normalized === "entregado"
      ? "bg-emerald-100 text-emerald-700"
      : normalized === "listo_para_recoger"
        ? "bg-rose-100 text-rose-700"
        : normalized === "repartidor_asignado" ||
            normalized === "repartidor_solicitado"
          ? "bg-orange-100 text-orange-700"
          : "bg-amber-100 text-amber-700";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}
