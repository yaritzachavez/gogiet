"use client";

import { AlertCircle, Edit, UserCheck, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ResponsiveModal from "@/app/components/Modal";
import { fetchWithSession } from "@/lib/client-auth";
import type { DBUser } from "@/types/db/users";

import LoadingRow from "./components/LoadingRow";
import StatusBadge from "./components/StatusBadge";
import SummaryCard from "./components/SummaryCard";

type UserRoleOption = {
  value:
    | "admin_general"
    | "cliente"
    | "repartidor"
    | "business_admin"
    | "business_staff";
  label: string;
};

type RawRole = {
  id?: number;
  name?: string;
};

type RawUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  created_at?: string;
  updated_at?: string;
  status_id?: number;
  status?: string | null;
  is_active?: boolean | number;
  isActive?: boolean;
  email_verified?: boolean | number;
  email_verified_at?: string | null;
  is_verified?: boolean;
  roles?: RawRole[];
};

const ROLE_OPTIONS: UserRoleOption[] = [
  { value: "admin_general", label: "ADMIN_GENERAL" },
  { value: "cliente", label: "CLIENTE" },
  { value: "repartidor", label: "REPARTIDOR" },
  { value: "business_admin", label: "DUENO_TIENDA / ADMIN_NEGOCIO" },
  { value: "business_staff", label: "VENDEDOR" },
];

const ROLE_LABELS: Record<string, string> = {
  admin_general: "ADMIN_GENERAL",
  cliente: "CLIENTE",
  repartidor: "REPARTIDOR",
  business_admin: "DUENO_TIENDA / ADMIN_NEGOCIO",
  business_staff: "VENDEDOR",
};

function resolveAccountActive(user: {
  is_active?: boolean | number;
  isActive?: boolean;
  status?: string | null;
}) {
  if (typeof user.isActive === "boolean") return user.isActive;
  if (typeof user.is_active === "boolean") return user.is_active;
  if (Number(user.is_active ?? 0) === 1) return true;

  const status = String(user.status ?? "")
    .trim()
    .toUpperCase();
  return status === "ACTIVE" || status === "ACTIVO";
}

function normalizeUser(rawUser: RawUser): DBUser {
  return {
    id: rawUser.id,
    first_name: rawUser.first_name ?? "",
    last_name: rawUser.last_name ?? "",
    email: rawUser.email ?? "",
    phone: rawUser.phone ?? "",
    created_at: rawUser.created_at ? new Date(rawUser.created_at) : new Date(),
    updated_at: rawUser.updated_at ? new Date(rawUser.updated_at) : new Date(),
    status_id: rawUser.status_id ?? 0,
    status: rawUser.status ?? null,
    is_active: resolveAccountActive(rawUser),
    is_verified: Boolean(rawUser.is_verified ?? rawUser.email_verified),
    email_verified_at: rawUser.email_verified_at ?? null,
    roles: Array.isArray(rawUser.roles)
      ? rawUser.roles
          .map((role) => role?.name)
          .filter((role: string | undefined): role is string => Boolean(role))
      : [],
  };
}

function getRoleLabel(roles: string[] | undefined) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return "Sin rol";
  }

  return roles.map((role) => ROLE_LABELS[role] ?? role).join(", ");
}

function EmailVerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold sm:px-3 ${
        verified
          ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200"
          : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300"
      }`}
    >
      {verified ? "Sí" : "No"}
    </span>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<DBUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<DBUser | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<UserRoleOption["value"][]>(
    [],
  );
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem("user");
      const parsedUser = rawUser
        ? (JSON.parse(rawUser) as { id?: number })
        : null;
      setCurrentUserId(
        Number.isFinite(Number(parsedUser?.id)) ? Number(parsedUser?.id) : null,
      );
    } catch (parseError) {
      console.error("No se pudo leer el usuario actual:", parseError);
      setCurrentUserId(null);
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetchWithSession("/api/users", {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "No se pudieron cargar los usuarios.");
      }

      setUsers(
        Array.isArray(data.users)
          ? data.users.map((user: RawUser) => normalizeUser(user))
          : [],
      );
    } catch (fetchError) {
      console.error("Error cargando usuarios:", fetchError);
      setError("No se pudieron cargar los usuarios.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const handleEdit = (user: DBUser) => {
    setSelectedUser(user);
    const currentRoles = Array.isArray(user.roles)
      ? user.roles.filter((role): role is UserRoleOption["value"] =>
          ROLE_OPTIONS.some((option) => option.value === role),
        )
      : [];
    setSelectedRoles(
      currentRoles.length
        ? currentRoles
        : (["cliente"] as UserRoleOption["value"][]),
    );
    setOpen(true);
  };

  const handleSave = async () => {
    if (!selectedUser) return;

    try {
      setSaving(true);

      const response = await fetchWithSession(
        `/api/admin/users/${selectedUser.id}/role`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roles: selectedRoles,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "No se pudo actualizar el rol.");
      }

      await refreshUsers();
      setOpen(false);
    } catch (saveError) {
      console.error("Error guardando rol:", saveError);
      setError("No se pudo actualizar el rol del usuario.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: DBUser) => {
    const isActive = Boolean(user.is_active);
    const nextIsActive = !isActive;

    if (
      isActive &&
      !window.confirm("¿Seguro que deseas desactivar este usuario?")
    ) {
      return;
    }

    try {
      setUpdatingStatusId(user.id);
      setError(null);

      const response = await fetchWithSession(
        `/api/admin/users/${user.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isActive: nextIsActive,
          }),
        },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error || "No se pudo actualizar el estado del usuario.",
        );
      }

      const nextStatusId = Number(
        data.user?.status_id ?? (nextIsActive ? 1 : 2),
      );
      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id
            ? {
                ...currentUser,
                status_id: nextStatusId,
                status: nextIsActive ? "ACTIVE" : "INACTIVE",
                is_active: nextIsActive,
              }
            : currentUser,
        ),
      );
    } catch (statusError) {
      console.error("Error actualizando estado de usuario:", statusError);
      setError("No se pudo actualizar el estado del usuario.");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const toggleRole = (role: UserRoleOption["value"]) => {
    setSelectedRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  };

  const stats = useMemo(() => {
    const total = users.length;
    const activos = users.filter((user) => user.is_active).length;
    const repartidores = users.filter((user) =>
      user.roles?.includes("repartidor"),
    ).length;

    return { total, activos, repartidores };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) => {
      const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
      const email = String(user.email ?? "").toLowerCase();

      return (
        fullName.includes(normalizedQuery) || email.includes(normalizedQuery)
      );
    });
  }, [searchQuery, users]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-6 sm:space-y-6 sm:px-6 sm:py-10 lg:space-y-8">
      <header className="flex items-center gap-2 sm:gap-3">
        <Users className="h-6 w-6 text-red-600 dark:text-red-400 sm:h-7 sm:w-7" />
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white sm:text-3xl">
          Usuarios
        </h1>
      </header>

      <section className="space-y-4 rounded-2xl bg-white/90 p-4 shadow-md ring-1 ring-red-200/60 dark:bg-white/10 dark:ring-white/10 sm:space-y-5 sm:p-6 lg:space-y-6">
        <header className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-red-700 dark:text-red-400 sm:text-xl">
            <UserCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            Administración de roles
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-300 sm:text-sm">
            Solo el ADMIN_GENERAL puede asignar roles desde este panel.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          <SummaryCard label="Usuarios Totales" value={stats.total} />
          <SummaryCard
            label="Usuarios Activos"
            value={stats.activos}
            accent="orange"
          />
          <SummaryCard
            label="Repartidores"
            value={stats.repartidores}
            accent="red"
          />
        </div>

        <div className="max-w-md">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar por nombre o correo..."
            className="w-full rounded-xl border border-red-200/60 bg-white px-4 py-2.5 text-sm text-zinc-700 shadow-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:focus:border-red-400 dark:focus:ring-red-500/10"
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-red-200/60 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          <table className="w-full divide-y divide-red-100/80 text-xs sm:text-sm">
            <thead className="bg-red-50/70 text-left font-semibold uppercase tracking-[0.1em] text-red-500 sm:tracking-[0.2em]">
              <tr>
                <th className="px-3 py-2.5 sm:px-4 sm:py-3">Usuario</th>
                <th className="px-3 py-2.5 sm:px-4 sm:py-3">Contacto</th>
                <th className="hidden sm:table-cell px-3 py-2.5 sm:px-4 sm:py-3">
                  Estado de cuenta
                </th>
                <th className="hidden lg:table-cell px-3 py-2.5 sm:px-4 sm:py-3">
                  Correo verificado
                </th>
                <th className="hidden md:table-cell px-3 py-2.5 sm:px-4 sm:py-3">
                  Rol
                </th>
                <th className="px-3 py-2.5 text-center sm:px-4 sm:py-3">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-red-100/60 bg-white text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
              {loading ? (
                <LoadingRow />
              ) : error ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-red-500 sm:px-4 sm:py-8"
                  >
                    <AlertCircle className="mx-auto mb-2 h-4 w-4 sm:h-5 sm:w-5" />
                    {error}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-zinc-400 sm:px-4 sm:py-8"
                  >
                    No hay usuarios registrados.
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-zinc-400 sm:px-4 sm:py-8"
                  >
                    No se encontraron usuarios
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="transition hover:bg-red-50/40 dark:hover:bg-white/10"
                  >
                    <td className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">
                      <div className="line-clamp-2">
                        {user.first_name} {user.last_name}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs sm:text-sm">{user.email}</span>
                        <span className="text-xs text-zinc-400">
                          {user.phone || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2.5 sm:px-4 sm:py-3">
                      <StatusBadge isActive={Boolean(user.is_active)} />
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2.5 sm:px-4 sm:py-3">
                      <EmailVerifiedBadge
                        verified={Boolean(user.is_verified)}
                      />
                    </td>
                    <td className="hidden md:table-cell px-3 py-2.5 sm:px-4 sm:py-3">
                      <span className="rounded-full border border-red-200/60 px-3 py-1 text-xs font-semibold text-red-600 dark:border-white/20 dark:text-red-200">
                        {getRoleLabel(user.roles)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center sm:px-4 sm:py-3">
                      {currentUserId === user.id ? (
                        <span className="text-xs font-semibold text-zinc-400">
                          Protegido
                        </span>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(user)}
                            disabled={updatingStatusId === user.id}
                            className={`inline-flex min-w-[86px] items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:py-2 ${
                              user.is_active
                                ? "border-rose-200/80 text-rose-600 hover:bg-rose-50 dark:border-rose-400/25 dark:text-rose-200 dark:hover:bg-rose-500/10"
                                : "border-emerald-200/80 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400/25 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                            }`}
                          >
                            {updatingStatusId === user.id
                              ? "Guardando..."
                              : user.is_active
                                ? "Desactivar"
                                : "Activar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEdit(user)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200/60 px-2 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-white/20 dark:text-red-200 dark:hover:bg-white/10 sm:gap-1.5 sm:px-3 sm:py-2"
                          >
                            <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">
                              Cambiar rol
                            </span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="Cambiar roles de usuario"
        icon={<Edit className="h-4 w-4 text-red-400 sm:h-5 sm:w-5" />}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse sm:gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60 sm:px-4 sm:py-2 sm:text-sm"
            >
              {saving ? "Guardando..." : "Guardar roles"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/20 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/10 sm:px-4 sm:py-2 sm:text-sm"
            >
              Cancelar
            </button>
          </div>
        }
      >
        {selectedUser ? (
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">
                {selectedUser.first_name} {selectedUser.last_name}
              </p>
              <p className="text-xs text-zinc-400">{selectedUser.email}</p>
            </div>

            <div className="space-y-3">
              <p className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Roles
              </p>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(option.value)}
                      onChange={() => toggleRole(option.value)}
                      className="h-4 w-4 rounded border-zinc-500 text-red-600 focus:ring-red-400"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-zinc-400">
            No hay datos disponibles.
          </p>
        )}
      </ResponsiveModal>
    </div>
  );
}
