"use client";

import { AlertCircle, Edit, Plus, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ResponsiveModal from "@/app/components/Modal";
import LoadingRow from "../components/LoadingRow";
import StatusBadge from "../components/StatusBadge";
import SummaryCard from "../components/SummaryCard";

type BusinessRecord = {
  id: number;
  name: string;
  legal_name: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  address_notes: string | null;
  business_category_id: number | null;
  category_name: string | null;
  owner_id: number | null;
  status_id: number | null;
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type BusinessStat = {
  business_id: number;
  today_orders: number;
  total_sales: number;
};

type UserOption = {
  id: number;
  name: string;
  email: string;
  phone?: string;
};

type CategoryOption = {
  id: number;
  name: string;
};

type BusinessFormState = {
  owner_id: number | null;
  name: string;
  business_category_id: number | "";
  city: string;
  district: string;
  address: string;
  legal_name: string;
  tax_id: string;
  address_notes: string;
  is_active: boolean;
};

const EMPTY_FORM: BusinessFormState = {
  owner_id: null,
  name: "",
  business_category_id: "",
  city: "",
  district: "",
  address: "",
  legal_name: "",
  tax_id: "",
  address_notes: "",
  is_active: true,
};

export default function AdminNegociosPage() {
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [statsByBusiness, setStatsByBusiness] = useState<
    Record<number, BusinessStat>
  >({});
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(
    null,
  );
  const [form, setForm] = useState<BusinessFormState>(EMPTY_FORM);
  const [userSearch, setUserSearch] = useState("");
  const [ownerResults, setOwnerResults] = useState<UserOption[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<UserOption | null>(null);
  const [ownerSearchMessage, setOwnerSearchMessage] = useState("");
  const [savingForm, setSavingForm] = useState(false);
  const [updatingBusinessId, setUpdatingBusinessId] = useState<number | null>(
    null,
  );
  const [toastMessage, setToastMessage] = useState("");

  const stats = useMemo(
    () => ({
      total: businesses.length,
      activos: businesses.filter((business) => business.is_active).length,
    }),
    [businesses],
  );

  useEffect(() => {
    if (!toastMessage) return;

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  useEffect(() => {
    const token = window.localStorage.getItem("token");

    if (!token) {
      setError("Debes iniciar sesión para ver los negocios.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadBusinesses = async () => {
      try {
        setLoading(true);
        setError(null);

        const [businessResponse, statsResponse] = await Promise.all([
          fetch("/api/admin/business", {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }),
          fetch("/api/admin/business/stats", {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }),
        ]);

        const businessesData = await businessResponse.json();
        const statsData = await statsResponse.json();

        if (!businessResponse.ok || !businessesData.success) {
          console.error("Error real cargando negocios:", {
            status: businessResponse.status,
            body: businessesData,
          });
          setError(
            businessesData.error || "No se pudieron cargar los negocios",
          );
          setBusinesses([]);
          return;
        }

        if (!statsResponse.ok || !statsData.success) {
          console.error("Error real cargando stats negocios:", {
            status: statsResponse.status,
            body: statsData,
          });
        }

        const businessList = Array.isArray(businessesData.businesses)
          ? (businessesData.businesses as BusinessRecord[])
          : [];

        const statMap = Array.isArray(statsData.stats)
          ? Object.fromEntries(
              statsData.stats.map((stat: BusinessStat) => [
                Number(stat.business_id),
                {
                  business_id: Number(stat.business_id),
                  today_orders: Number(stat.today_orders ?? 0),
                  total_sales: Number(stat.total_sales ?? 0),
                },
              ]),
            )
          : {};

        setBusinesses(businessList);
        setStatsByBusiness(statMap);
      } catch (requestError) {
        if ((requestError as Error).name === "AbortError") return;
        console.error("Error inesperado cargando negocios:", requestError);
        setError("No se pudieron cargar los negocios");
        setBusinesses([]);
      } finally {
        setLoading(false);
      }
    };

    loadBusinesses();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem("token");
    if (!token) return;

    const loadCategories = async () => {
      try {
        const categoriesResponse = await fetch("/api/business/categories", {
          cache: "no-store",
        });

        const categoriesData = await categoriesResponse.json();

        if (categoriesResponse.ok) {
          setCategories(
            Array.isArray(categoriesData.categories)
              ? (categoriesData.categories as CategoryOption[])
              : [],
          );
        }
      } catch (requestError) {
        console.error("Error cargando catálogos de negocios:", requestError);
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    const token = window.localStorage.getItem("token");

    if (!open || !token) {
      return;
    }

    const trimmedSearch = userSearch.trim();

    if (trimmedSearch.length < 2) {
      setOwnerResults([]);
      setOwnerLoading(false);
      setOwnerSearchMessage(
        trimmedSearch.length === 0
          ? ""
          : "Escribe al menos 2 caracteres para buscar.",
      );
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setOwnerLoading(true);
        setOwnerSearchMessage("Buscando...");

        const response = await fetch(
          `/api/admin/users/search?q=${encodeURIComponent(trimmedSearch)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        );
        const data = await response.json().catch(() => ({ users: [] }));

        if (!response.ok || !data.success) {
          console.error("Error buscando propietarios:", data);
          setOwnerResults([]);
          setOwnerSearchMessage(
            data.error || "No se pudo buscar a los usuarios.",
          );
          return;
        }

        const results = Array.isArray(data.users)
          ? (data.users as UserOption[]).filter(
              (user, index, self) =>
                index ===
                self.findIndex(
                  (candidate) =>
                    candidate.id === user.id && candidate.email === user.email,
                ),
            )
          : [];

        setOwnerResults(results);
        setOwnerSearchMessage(
          results.length === 0 ? "No se encontraron usuarios" : "",
        );
      } catch (requestError) {
        if ((requestError as Error).name === "AbortError") return;
        console.error("Error buscando propietarios:", requestError);
        setOwnerResults([]);
        setOwnerSearchMessage("No se pudo buscar a los usuarios.");
      } finally {
        setOwnerLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, userSearch]);

  useEffect(() => {
    const token = window.localStorage.getItem("token");

    if (
      !open ||
      !form.owner_id ||
      selectedOwner?.id === form.owner_id ||
      !token
    ) {
      return;
    }

    const controller = new AbortController();

    const loadOwnerById = async () => {
      try {
        const response = await fetch(
          `/api/admin/users/search?id=${form.owner_id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        );
        const data = await response.json().catch(() => ({ users: [] }));

        if (!response.ok || !data.success || !Array.isArray(data.users)) {
          return;
        }

        const owner = data.users[0] as UserOption | undefined;

        if (owner) {
          setSelectedOwner(owner);
          setUserSearch(owner.name);
        }
      } catch (requestError) {
        if ((requestError as Error).name === "AbortError") return;
        console.error("Error cargando propietario seleccionado:", requestError);
      }
    };

    loadOwnerById();

    return () => controller.abort();
  }, [open, form.owner_id, selectedOwner?.id]);

  const updateForm = <K extends keyof BusinessFormState>(
    field: K,
    value: BusinessFormState[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openNewModal = () => {
    setIsNew(true);
    setSelectedBusinessId(null);
    setForm(EMPTY_FORM);
    setUserSearch("");
    setOwnerResults([]);
    setSelectedOwner(null);
    setOwnerSearchMessage("");
    setOpen(true);
  };

  const openEditModal = (business: BusinessRecord) => {
    setIsNew(false);
    setSelectedBusinessId(business.id);
    setForm({
      owner_id: business.owner_id,
      name: business.name,
      business_category_id: business.business_category_id ?? "",
      city: business.city ?? "",
      district: business.district ?? "",
      address: business.address ?? "",
      legal_name: business.legal_name ?? "",
      tax_id: "",
      address_notes: business.address_notes ?? "",
      is_active: business.is_active,
    });
    setUserSearch("");
    setOwnerResults([]);
    setSelectedOwner(null);
    setOwnerSearchMessage("");
    setOpen(true);
  };

  const validateForm = () => {
    const errors: string[] = [];

    if (!form.owner_id) errors.push("Debe seleccionar un propietario.");
    if (!form.name.trim()) errors.push("El nombre del negocio es obligatorio.");
    if (!form.business_category_id)
      errors.push("Debe seleccionar una categoría.");
    if (!form.city.trim()) errors.push("La ciudad es obligatoria.");

    if (errors.length > 0) {
      window.alert(`❌ No se puede continuar:\n\n${errors.join("\n")}`);
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const token = window.localStorage.getItem("token");

    if (!token) {
      window.alert("Debes iniciar sesión nuevamente");
      return;
    }

    try {
      setSavingForm(true);

      const url = isNew
        ? "/api/admin/business"
        : `/api/admin/business/${selectedBusinessId}`;

      const response = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("Error al guardar negocio:", data);
        window.alert(`❌ Error: ${data.error || "No se pudo guardar."}`);
        return;
      }

      const business = data.business as BusinessRecord;

      if (business) {
        setBusinesses((current) =>
          isNew
            ? [business, ...current]
            : current.map((item) =>
                item.id === business.id ? business : item,
              ),
        );

        setStatsByBusiness((current) => ({
          ...current,
          [business.id]: current[business.id] ?? {
            business_id: business.id,
            today_orders: 0,
            total_sales: 0,
          },
        }));
      }

      setToastMessage(
        isNew ? "Negocio creado correctamente" : "Negocio actualizado",
      );
      setOpen(false);
      setForm(EMPTY_FORM);
      setSelectedBusinessId(null);
      setIsNew(false);
      setUserSearch("");
      setSelectedOwner(null);
      setOwnerResults([]);
      setOwnerSearchMessage("");
    } catch (requestError) {
      console.error("Error inesperado guardando negocio:", requestError);
      window.alert("❌ Error inesperado. Consulta consola.");
    } finally {
      setSavingForm(false);
    }
  };

  const handleToggleStatus = async (
    businessId: number,
    currentValue: boolean,
  ) => {
    const token = window.localStorage.getItem("token");

    if (!token) {
      window.alert("Debes iniciar sesión nuevamente");
      return;
    }

    try {
      setUpdatingBusinessId(businessId);

      const response = await fetch(`/api/admin/business/${businessId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          is_active: !currentValue,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("Error actualizando negocio:", data);
        window.alert("Error al actualizar negocio");
        return;
      }

      setBusinesses((current) =>
        current.map((business) =>
          business.id === businessId
            ? {
                ...business,
                is_active: Boolean(data.business?.is_active ?? !currentValue),
                status_id: Number(
                  (data.business?.is_active ?? !currentValue) ? 1 : 2,
                ),
              }
            : business,
        ),
      );

      setToastMessage(
        data.message ||
          (!currentValue ? "Negocio activado" : "Negocio desactivado"),
      );
    } catch (requestError) {
      console.error("Error inesperado actualizando negocio:", requestError);
      window.alert("Error al actualizar negocio");
    } finally {
      setUpdatingBusinessId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-6 sm:px-6 sm:py-10">
      {toastMessage ? (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
          {toastMessage}
        </div>
      ) : null}

      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-red-600 sm:h-7 sm:w-7" />
          <h1 className="text-2xl font-semibold dark:text-white">Negocios</h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/business/reports"
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-white/10 dark:text-red-300 dark:hover:bg-white/10"
          >
            Ver reportes
          </Link>
          <button
            onClick={openNewModal}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-white hover:bg-red-700"
            type="button"
          >
            <Plus className="h-4 w-4" /> Agregar negocio
          </button>
        </div>
      </header>

      <section className="space-y-5 rounded-2xl bg-white/90 p-4 shadow-md dark:bg-white/10">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Negocios Totales" value={stats.total} />
          <SummaryCard
            label="Negocios Activos"
            value={stats.activos}
            accent="orange"
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full divide-y divide-red-100 text-xs sm:text-sm">
            <thead className="bg-red-50 font-semibold uppercase text-red-600">
              <tr>
                <th className="px-3 py-2.5 text-left">Negocio</th>
                <th className="hidden px-3 py-2.5 text-left sm:table-cell">
                  Ciudad
                </th>
                <th className="hidden px-3 py-2.5 text-left sm:table-cell">
                  Categoría
                </th>
                <th className="hidden px-3 py-2.5 text-left lg:table-cell">
                  Pedidos hoy
                </th>
                <th className="hidden px-3 py-2.5 text-left lg:table-cell">
                  Ventas
                </th>
                <th className="hidden px-3 py-2.5 text-left sm:table-cell">
                  Estado
                </th>
                <th className="px-3 py-2.5 text-center">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-red-100">
              {loading ? (
                <LoadingRow />
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-red-500">
                    <AlertCircle className="mx-auto mb-2 h-4 w-4" />
                    {error}
                  </td>
                </tr>
              ) : businesses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-zinc-500">
                    No hay negocios registrados
                  </td>
                </tr>
              ) : (
                businesses.map((business) => {
                  const businessStats = statsByBusiness[business.id];
                  const isUpdating = updatingBusinessId === business.id;

                  return (
                    <tr
                      key={`business-${business.id}`}
                      className="hover:bg-red-50 dark:hover:bg-white/10"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{business.name}</div>
                        <div className="text-xs text-zinc-400">
                          {business.legal_name || "Sin razón social"}
                        </div>
                      </td>

                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        {business.city || "Sin ciudad"}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        {business.category_name || "Sin categoría"}
                      </td>
                      <td className="hidden px-3 py-2.5 lg:table-cell">
                        {businessStats?.today_orders ?? 0}
                      </td>
                      <td className="hidden px-3 py-2.5 lg:table-cell">
                        {formatCurrency(businessStats?.total_sales ?? 0)}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <StatusBadge status={business.is_active ? 1 : 2} />
                      </td>

                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() =>
                              handleToggleStatus(
                                business.id,
                                business.is_active,
                              )
                            }
                            type="button"
                            disabled={isUpdating}
                            className={`inline-flex min-w-[88px] items-center justify-center rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                              business.is_active
                                ? "border-orange-300 text-orange-600 hover:bg-orange-50"
                                : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {isUpdating
                              ? "Guardando..."
                              : business.is_active
                                ? "Activo"
                                : "Inactivo"}
                          </button>

                          <button
                            onClick={() => openEditModal(business)}
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-red-600 hover:bg-red-50 dark:text-red-300"
                          >
                            <Edit className="h-4 w-4" />
                            <span className="hidden sm:inline">Editar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={isNew ? "Crear negocio" : "Editar negocio"}
        icon={<Edit className="h-4 w-4 text-red-400 sm:h-5 sm:w-5" />}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse sm:gap-3">
            <button
              onClick={handleSubmit}
              type="button"
              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 sm:px-4 sm:text-sm"
            >
              {savingForm
                ? "Guardando..."
                : isNew
                  ? "Crear negocio"
                  : "Guardar cambios"}
            </button>

            <button
              onClick={() => setOpen(false)}
              type="button"
              className="rounded-lg border border-white/20 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/10 sm:px-4 sm:text-sm"
            >
              Cancelar
            </button>
          </div>
        }
      >
        <form className="space-y-5 sm:space-y-6">
          <div className="space-y-1">
            <label
              htmlFor="business-owner-search"
              className="text-xs font-semibold text-zinc-400"
            >
              Dueño / Propietario <span className="text-red-500">*</span>
            </label>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="business-owner-search"
                  type="text"
                  placeholder="Buscar por nombre, apellido, correo o teléfono"
                  value={userSearch}
                  onChange={(event) => {
                    setUserSearch(event.target.value);
                    if (selectedOwner) {
                      setSelectedOwner(null);
                      updateForm("owner_id", null);
                    }
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs text-white focus:ring-2 focus:ring-red-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOwner(null);
                    setOwnerResults([]);
                    setOwnerSearchMessage("");
                    setUserSearch("");
                    updateForm("owner_id", null);
                  }}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"
                >
                  Limpiar selección
                </button>
              </div>

              {selectedOwner ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  Propietario seleccionado:{" "}
                  <span className="font-semibold">
                    {selectedOwner.name} — {selectedOwner.email}
                  </span>
                </div>
              ) : null}

              {!selectedOwner && ownerLoading ? (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-300">
                  Buscando…
                </div>
              ) : null}

              {!selectedOwner && ownerSearchMessage ? (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-300">
                  {ownerSearchMessage}
                </div>
              ) : null}

              {!selectedOwner && ownerResults.length > 0 ? (
                <div
                  id="business-owner"
                  className="max-h-60 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900/95"
                >
                  {ownerResults.slice(0, 10).map((user) => (
                    <button
                      key={`user-${user.id}-${user.email}`}
                      type="button"
                      onClick={() => {
                        setSelectedOwner(user);
                        setUserSearch(user.name);
                        setOwnerResults([]);
                        setOwnerSearchMessage("");
                        updateForm("owner_id", user.id);
                      }}
                      className="flex w-full flex-col items-start border-b border-zinc-800 px-3 py-2 text-left transition hover:bg-zinc-800 last:border-b-0"
                    >
                      <span className="text-sm font-semibold text-white">
                        {user.name}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {user.email}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="business-name"
              className="text-xs font-semibold text-zinc-400"
            >
              Nombre del negocio <span className="text-red-500">*</span>
            </label>
            <input
              id="business-name"
              type="text"
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="Ej: Tacos El Güero"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-white focus:ring-2 focus:ring-red-400"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="business-category"
              className="text-xs font-semibold text-zinc-400"
            >
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              id="business-category"
              value={form.business_category_id}
              onChange={(event) =>
                updateForm(
                  "business_category_id",
                  event.target.value ? Number(event.target.value) : "",
                )
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-white focus:ring-2 focus:ring-red-400"
            >
              <option value="">Selecciona categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="business-legal-name"
                className="text-xs font-semibold text-zinc-400"
              >
                Razón Social
              </label>
              <input
                id="business-legal-name"
                type="text"
                value={form.legal_name}
                onChange={(event) =>
                  updateForm("legal_name", event.target.value)
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-white focus:ring-2 focus:ring-red-400"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="business-tax-id"
                className="text-xs font-semibold text-zinc-400"
              >
                RFC / Tax ID
              </label>
              <input
                id="business-tax-id"
                type="text"
                value={form.tax_id}
                onChange={(event) => updateForm("tax_id", event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-white focus:ring-2 focus:ring-red-400"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="business-city"
                  className="text-xs font-semibold text-zinc-400"
                >
                  Ciudad <span className="text-red-500">*</span>
                </label>
                <input
                  id="business-city"
                  type="text"
                  value={form.city}
                  onChange={(event) => updateForm("city", event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-white focus:ring-red-400"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="business-district"
                  className="text-xs font-semibold text-zinc-400"
                >
                  Distrito / Colonia
                </label>
                <input
                  id="business-district"
                  type="text"
                  value={form.district}
                  onChange={(event) =>
                    updateForm("district", event.target.value)
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-white focus:ring-red-400"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="business-address"
                className="text-xs font-semibold text-zinc-400"
              >
                Dirección
              </label>
              <input
                id="business-address"
                type="text"
                value={form.address}
                onChange={(event) => updateForm("address", event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-white focus:ring-red-400"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="business-address-notes"
                className="text-xs font-semibold text-zinc-400"
              >
                Notas
              </label>
              <textarea
                id="business-address-notes"
                value={form.address_notes}
                onChange={(event) =>
                  updateForm("address_notes", event.target.value)
                }
                rows={2}
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs text-white focus:ring-red-400"
              />
            </div>

            {!isNew ? (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2">
                <label className="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-300">
                  <span>Estado del negocio</span>
                  <button
                    type="button"
                    onClick={() => updateForm("is_active", !form.is_active)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.is_active
                        ? "bg-red-500 shadow-inner shadow-red-300"
                        : "bg-zinc-500"
                    }`}
                  >
                    <span
                      className={`absolute left-1 inline-block size-5 rounded-full bg-white shadow transition-transform ${
                        form.is_active ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              </div>
            ) : null}
          </div>
        </form>
      </ResponsiveModal>
    </div>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}
