"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";

type Device = {
  id: number;
  name: string;
  location: string;
  lastActive: string;
  status: string;
};

type Business = {
  id: number;
  name: string;
  category: string;
  active: boolean;
};

const INITIAL_BUSINESSES: Business[] = [
  {
    id: 1,
    name: "Taquería El Primo",
    category: "Comida Mexicana",
    active: true,
  },
  { id: 2, name: "Green Bowls", category: "Saludable", active: true },
  { id: 3, name: "Café Aurora", category: "Cafetería", active: false },
];

const PAYMENT_METHODS = [
  "Tarjeta de crédito o débito",
  "PayPal",
  "Transferencia bancaria",
  "Pago en efectivo",
];

export default function AdminSettingsPage() {
  const { logout } = useAuth();
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("/administrador.jpg");
  const [newPassword, setNewPassword] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [language, setLanguage] = useState("es-MX");
  const [timeZone, setTimeZone] = useState("America/Mexico_City");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [twoFactorAuth, setTwoFactorAuth] = useState(true);
  const [securityError, setSecurityError] = useState("");
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [businesses, setBusinesses] = useState(INITIAL_BUSINESSES);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const handleToggleBusiness = (id: number) => {
    setBusinesses((prev) =>
      prev.map((business) =>
        business.id === id
          ? { ...business, active: !business.active }
          : business,
      ),
    );
  };

  useEffect(() => {
    const loadProfile = async () => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        setProfileError("Debes iniciar sesión nuevamente.");
        setProfileLoading(false);
        return;
      }

      try {
        setProfileLoading(true);
        setProfileError("");

        const response = await fetch("/api/admin/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data?.error || "No se pudo cargar el perfil.");
        }

        setProfileName(String(data.profile?.name ?? ""));
        setProfileEmail(String(data.profile?.email ?? ""));
        setProfileImageUrl(
          String(data.profile?.imageUrl ?? "").trim() || "/administrador.jpg",
        );
      } catch (error) {
        console.error("Error cargando perfil admin:", error);
        setProfileError("No se pudo cargar el perfil.");
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const loadSecurity = async () => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        setSecurityError("Debes iniciar sesión nuevamente.");
        return;
      }

      try {
        setSecurityError("");

        const response = await fetch("/api/admin/security", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data?.error || "No se pudo cargar la seguridad.");
        }

        setTwoFactorAuth(Boolean(data.security?.twoFactorEnabled ?? false));
        setDevices(
          Array.isArray(data.sessions)
            ? data.sessions.map(
                (session: {
                  id?: number;
                  deviceName?: string;
                  location?: string;
                  lastActiveAt?: string;
                  status?: string;
                }) => ({
                  id: Number(session.id ?? 0),
                  name: String(session.deviceName ?? "Dispositivo desconocido"),
                  location: String(
                    session.location ?? "Ubicación no disponible",
                  ),
                  lastActive: formatLastActive(session.lastActiveAt),
                  status: String(session.status ?? "active"),
                }),
              )
            : [],
        );
      } catch (error) {
        console.error("Error cargando seguridad admin:", error);
        setSecurityError("No se pudo cargar la seguridad.");
      }
    };

    loadSecurity();
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      const token = window.localStorage.getItem("token");

      if (!token) {
        setSettingsError("Debes iniciar sesión nuevamente.");
        return;
      }

      try {
        setSettingsError("");

        const response = await fetch("/api/admin/settings", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data?.error || "No se pudieron cargar las preferencias.",
          );
        }

        const nextLanguage = String(data.settings?.language ?? "es-MX");
        const nextTimezone = String(
          data.settings?.timezone ?? "America/Mexico_City",
        );
        const nextNotifications = Boolean(
          data.settings?.realtimeNotifications ?? true,
        );
        const nextDarkMode = Boolean(data.settings?.darkMode ?? false);

        setLanguage(nextLanguage);
        setTimeZone(nextTimezone);
        setNotificationsEnabled(nextNotifications);
        setDarkMode(nextDarkMode);

        window.localStorage.setItem("admin-language", nextLanguage);
        window.localStorage.setItem("admin-timezone", nextTimezone);
        window.localStorage.setItem(
          "admin-realtime-notifications",
          JSON.stringify(nextNotifications),
        );
        window.localStorage.setItem(
          "admin-dark-mode",
          JSON.stringify(nextDarkMode),
        );
      } catch (error) {
        console.error("Error cargando settings admin:", error);
        setSettingsError("No se pudieron cargar las preferencias.");
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem("admin-dark-mode", JSON.stringify(darkMode));
    window.dispatchEvent(new Event("gogi-theme-updated"));
  }, [darkMode]);

  useEffect(() => {
    window.localStorage.setItem(
      "admin-realtime-notifications",
      JSON.stringify(notificationsEnabled),
    );
    window.dispatchEvent(new Event("gogi-notifications-updated"));
  }, [notificationsEnabled]);

  useEffect(() => {
    if (!toastMessage) return;

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const handleSaveProfile = async () => {
    const token = window.localStorage.getItem("token");

    if (!token) {
      setProfileError("Debes iniciar sesión nuevamente.");
      return;
    }

    try {
      setSavingProfile(true);
      setProfileError("");

      const response = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profileName,
          email: profileEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "No se pudo actualizar el perfil.");
      }

      const rawUser = window.localStorage.getItem("user");
      const parsedUser = rawUser ? JSON.parse(rawUser) : null;

      if (parsedUser) {
        window.localStorage.setItem(
          "user",
          JSON.stringify({
            ...parsedUser,
            name: data.profile?.name ?? profileName,
            email: data.profile?.email ?? profileEmail,
          }),
        );
      }

      setProfileName(String(data.profile?.name ?? profileName));
      setProfileEmail(String(data.profile?.email ?? profileEmail));
      setIsEditingProfile(false);
      setToastMessage("Perfil actualizado");
    } catch (error) {
      console.error("Error guardando perfil admin:", error);
      setProfileError("No se pudo actualizar el perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    const token = window.localStorage.getItem("token");

    if (!token) {
      setPasswordError("Debes iniciar sesión nuevamente.");
      return;
    }

    try {
      setSavingPassword(true);
      setPasswordError("");

      const response = await fetch("/api/admin/password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "No se pudo actualizar la contraseña.");
      }

      setNewPassword("");
      setToastMessage("Contraseña actualizada correctamente");
    } catch (error) {
      console.error("Error actualizando contraseña admin:", error);
      setPasswordError("No se pudo actualizar la contraseña.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleToggleTwoFactor = async (nextValue: boolean) => {
    const token = window.localStorage.getItem("token");

    if (!token) {
      setSecurityError("Debes iniciar sesión nuevamente.");
      return;
    }

    try {
      setSavingSecurity(true);
      setSecurityError("");

      const response = await fetch("/api/admin/security", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          twoFactorEnabled: nextValue,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "No se pudo actualizar la seguridad.");
      }

      setTwoFactorAuth(nextValue);
      setToastMessage(
        nextValue
          ? "Autenticación en dos pasos activada"
          : "Autenticación en dos pasos desactivada",
      );
    } catch (error) {
      console.error("Error actualizando seguridad admin:", error);
      setSecurityError("No se pudo actualizar la seguridad.");
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    const token = window.localStorage.getItem("token");

    if (!token) {
      setSecurityError("Debes iniciar sesión nuevamente.");
      return;
    }

    const confirmed = window.confirm(
      "¿Seguro que deseas cerrar sesión en todos los dispositivos?",
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoggingOutAll(true);
      setSecurityError("");

      const response = await fetch("/api/admin/security/logout-all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data?.error || "No se pudieron cerrar las sesiones activas.",
        );
      }

      setToastMessage("Sesión cerrada en todos los dispositivos");
      logout();
    } catch (error) {
      console.error("Error cerrando sesiones admin:", error);
      setSecurityError("No se pudieron cerrar las sesiones activas.");
    } finally {
      setLoggingOutAll(false);
    }
  };

  const handleSaveQuickSettings = async () => {
    const token = window.localStorage.getItem("token");

    if (!token) {
      setSettingsError("Debes iniciar sesión nuevamente.");
      return;
    }

    try {
      setSavingSettings(true);
      setSettingsError("");

      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          language,
          timezone: timeZone,
          realtimeNotifications: notificationsEnabled,
          darkMode,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data?.error || "No se pudieron guardar las preferencias.",
        );
      }

      window.localStorage.setItem("admin-language", language);
      window.localStorage.setItem("admin-timezone", timeZone);
      window.localStorage.setItem(
        "admin-realtime-notifications",
        JSON.stringify(notificationsEnabled),
      );
      window.localStorage.setItem("admin-dark-mode", JSON.stringify(darkMode));

      setToastMessage("Preferencias guardadas");
    } catch (error) {
      console.error("Error guardando settings admin:", error);
      setSettingsError("No se pudieron guardar las preferencias.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    const token = window.localStorage.getItem("token");

    if (!token) {
      setProfileError("Debes iniciar sesión nuevamente.");
      event.target.value = "";
      return;
    }

    if (!file) {
      return;
    }

    try {
      setUploadingAvatar(true);
      setProfileError("");

      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/admin/upload-avatar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data?.error || "No se pudo actualizar la foto.");
      }

      const nextImageUrl =
        String(data.imageUrl ?? "").trim() || "/administrador.jpg";

      setProfileImageUrl(nextImageUrl);
      setToastMessage("Foto actualizada");

      const rawUser = window.localStorage.getItem("user");
      const parsedUser = rawUser ? JSON.parse(rawUser) : null;

      if (parsedUser) {
        window.localStorage.setItem(
          "user",
          JSON.stringify({
            ...parsedUser,
            profileImageUrl: nextImageUrl,
          }),
        );
        window.dispatchEvent(new Event("gogi-user-updated"));
      }
    } catch (error) {
      console.error("Error subiendo avatar admin:", error);
      setProfileError("No se pudo actualizar la foto.");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      {toastMessage ? (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg dark:border-white/10 dark:bg-zinc-900 dark:text-emerald-300">
          {toastMessage}
        </div>
      ) : null}
      <div className="rounded-3xl border border-red-200/60 bg-white/80 px-6 py-6 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-white/10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
              Panel administrativo
            </p>
            <h1 className="text-3xl font-semibold text-red-600">
              ⚙️ Ajustes del Sistema
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-300">
              Administra preferencias, seguridad y operaciones clave del
              ecosistema GogiEats.
            </p>
          </div>
          <Button
            variant="destructive"
            className="rounded-lg px-5"
            onClick={handleSaveQuickSettings}
            disabled={savingSettings}
          >
            {savingSettings ? "Guardando..." : "Guardar cambios rápidos"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2 border-red-200/60 bg-white/90 shadow-lg dark:border-white/10 dark:bg-white/10">
          <CardHeader className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-red-600">
                Perfil del administrador
              </CardTitle>
              <CardDescription>
                Controla tu información personal y la seguridad del acceso.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="destructive"
                className="rounded-lg"
                onClick={() => setIsEditingProfile(true)}
                disabled={isEditingProfile || profileLoading}
              >
                Editar perfil
              </Button>
              {isEditingProfile ? (
                <Button
                  variant="outline"
                  className="rounded-lg border-red-200/60 text-red-600 hover:bg-red-100"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                >
                  {savingProfile ? "Guardando..." : "Guardar cambios"}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {profileError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
                {profileError}
              </div>
            ) : null}
            <div className="flex flex-col gap-4 rounded-2xl bg-rose-50/60 p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5">
              <div className="flex items-center gap-4">
                <div className="relative size-16 overflow-hidden rounded-2xl ring-2 ring-red-200/60">
                  <Image
                    src={profileImageUrl}
                    alt="Foto de perfil del administrador"
                    width={80}
                    height={80}
                    className="size-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">
                    Administrador general
                  </p>
                  <h2 className="text-lg font-semibold text-red-600">
                    {profileLoading
                      ? "Cargando..."
                      : profileName || "Sin nombre"}
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-300">
                    {profileLoading
                      ? "Cargando..."
                      : profileEmail || "Sin correo"}
                  </p>
                </div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                variant="outline"
                className="rounded-lg border-red-200/60 text-red-600 hover:bg-red-100"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? "Subiendo..." : "Cambiar foto"}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-[1.4fr,1fr]">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre del administrador</Label>
                <Input
                  id="nombre"
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  disabled={
                    !isEditingProfile || savingProfile || profileLoading
                  }
                  className="rounded-lg border-red-200/60 bg-white/80 focus-visible:ring-red-400 dark:border-white/10 dark:bg-transparent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="correo">Correo electrónico</Label>
                <Input
                  id="correo"
                  type="email"
                  value={profileEmail}
                  onChange={(event) => setProfileEmail(event.target.value)}
                  disabled={
                    !isEditingProfile || savingProfile || profileLoading
                  }
                  className="rounded-lg border-red-200/60 bg-white/80 focus-visible:ring-red-400 dark:border-white/10 dark:bg-transparent"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[1.4fr,1fr]">
              <div className="space-y-2">
                <Label htmlFor="contrasena">Cambiar contraseña</Label>
                <Input
                  id="contrasena"
                  type="password"
                  placeholder="Ingresa una nueva contraseña segura"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="rounded-lg border-red-200/60 bg-white/80 focus-visible:ring-red-400 dark:border-white/10 dark:bg-transparent"
                />
                {passwordError ? (
                  <p className="text-sm text-red-600 dark:text-red-300">
                    {passwordError}
                  </p>
                ) : null}
              </div>
              <div className="flex items-end gap-3">
                <Button
                  variant="destructive"
                  className="flex-1 rounded-lg"
                  onClick={handleUpdatePassword}
                  disabled={savingPassword}
                >
                  {savingPassword ? "Actualizando..." : "Actualizar contraseña"}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 rounded-lg border-red-200/60 text-red-600 hover:bg-red-100"
                  onClick={logout}
                >
                  Cerrar sesión
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200/60 bg-white/90 shadow-lg dark:border-white/10 dark:bg-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-red-600">
              Preferencias del sistema
            </CardTitle>
            <CardDescription>
              Configura cómo se muestra y notifica la información clave.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
                {settingsError}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full rounded-lg border-red-200/60 bg-white/80 focus-visible:ring-red-400 dark:border-white/10 dark:bg-transparent">
                  <SelectValue placeholder="Selecciona un idioma" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-red-200/60 bg-white/95 dark:border-white/10 dark:bg-zinc-900">
                  <SelectItem value="es-MX">Español (MX)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Zona horaria</Label>
              <Select value={timeZone} onValueChange={setTimeZone}>
                <SelectTrigger className="w-full rounded-lg border-red-200/60 bg-white/80 focus-visible:ring-red-400 dark:border-white/10 dark:bg-transparent">
                  <SelectValue placeholder="Selecciona zona horaria" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-red-200/60 bg-white/95 dark:border-white/10 dark:bg-zinc-900">
                  <SelectItem value="America/Mexico_City">
                    America/Mexico_City
                  </SelectItem>
                  <SelectItem value="America/Guadalajara">
                    America/Guadalajara
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PreferenceToggle
              title="Notificaciones en tiempo real"
              description="Recibe alertas sobre pedidos, repartidores y soporte."
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
            <PreferenceToggle
              title="Modo oscuro"
              description="Activa un contraste cálido para trabajar de noche."
              checked={darkMode}
              onCheckedChange={setDarkMode}
            />
          </CardContent>
        </Card>

        <Card className="border-red-200/60 bg-white/90 shadow-lg dark:border-white/10 dark:bg-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-red-600">Seguridad</CardTitle>
            <CardDescription>
              Gestiona accesos y dispositivos conectados a tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {securityError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-red-200">
                {securityError}
              </div>
            ) : null}
            <PreferenceToggle
              title="Autenticación en dos pasos"
              description="Solicita un código adicional al iniciar sesión."
              checked={twoFactorAuth}
              onCheckedChange={handleToggleTwoFactor}
              disabled={savingSecurity}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-100">
                Dispositivos activos
              </p>
              <ul className="space-y-2">
                {devices.length ? (
                  devices.map((device) => (
                    <li
                      key={device.id}
                      className="rounded-xl border border-red-100/60 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-700 dark:text-zinc-100">
                            {device.name}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {device.location} · {device.lastActive}
                          </p>
                        </div>
                        <span className="rounded-full bg-orange-500/10 px-2 py-1 text-xs font-semibold text-orange-600">
                          {device.status === "closed" ? "Cerrado" : "Activo"}
                        </span>
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="rounded-xl border border-red-100/60 bg-white/70 px-4 py-3 text-sm text-zinc-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                    No hay dispositivos activos registrados.
                  </li>
                )}
              </ul>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-lg border-red-200/60 text-red-600 hover:bg-red-100"
              onClick={handleLogoutAllDevices}
              disabled={loggingOutAll}
            >
              {loggingOutAll
                ? "Cerrando sesiones..."
                : "Cerrar sesión en todos los dispositivos"}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-red-200/60 bg-white/90 shadow-lg dark:border-white/10 dark:bg-white/10">
          <CardHeader className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-red-600">Negocios</CardTitle>
              <CardDescription>
                Controla la actividad de los aliados comerciales dentro de la
                plataforma.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="rounded-lg border-red-200/60 text-red-600 hover:bg-red-100"
              >
                Editar negocio
              </Button>
              <Button variant="destructive" className="rounded-lg">
                Agregar negocio
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {businesses.map((business) => (
                <div
                  key={business.id}
                  className="flex flex-col gap-3 rounded-2xl border border-red-100/60 bg-white/70 p-4 shadow-sm md:flex-row md:items-center md:justify-between dark:border-white/10 dark:bg-white/5"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-100">
                      {business.name}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                      {business.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {business.active ? "Activo" : "Inactivo"}
                    </span>
                    <ToggleSwitch
                      checked={business.active}
                      onCheckedChange={() => handleToggleBusiness(business.id)}
                      ariaLabel={`Cambiar estado de ${business.name}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-red-200/60 bg-white/90 shadow-lg dark:border-white/10 dark:bg-white/10">
          <CardHeader className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-red-600">
                Pagos y comisiones
              </CardTitle>
              <CardDescription>
                Ajusta los porcentajes y métodos de pago disponibles para la
                operación.
              </CardDescription>
            </div>
            <Button variant="destructive" className="rounded-lg">
              Guardar configuración
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="comision-repartidores">
                  Comisión para repartidores (%)
                </Label>
                <Input
                  id="comision-repartidores"
                  type="number"
                  defaultValue={20}
                  min={0}
                  max={100}
                  step={0.5}
                  className="rounded-lg border-red-200/60 bg-white/80 focus-visible:ring-red-400 dark:border-white/10 dark:bg-transparent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comision-negocios">
                  Comisión para negocios (%)
                </Label>
                <Input
                  id="comision-negocios"
                  type="number"
                  defaultValue={12}
                  min={0}
                  max={100}
                  step={0.5}
                  className="rounded-lg border-red-200/60 bg-white/80 focus-visible:ring-red-400 dark:border-white/10 dark:bg-transparent"
                />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-100">
                Métodos de pago activos
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {PAYMENT_METHODS.map((method) => (
                  <li
                    key={method}
                    className="rounded-xl border border-red-100/60 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/5"
                  >
                    {method}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type PreferenceToggleProps = {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
};

function PreferenceToggle({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: PreferenceToggleProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-red-100/60 bg-white/70 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/5">
      <div>
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-100">
          {title}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
      <ToggleSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        ariaLabel={title}
        disabled={disabled}
      />
    </div>
  );
}

type ToggleSwitchProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
};

function ToggleSwitch({
  checked,
  onCheckedChange,
  ariaLabel,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-red-500 shadow-inner shadow-red-300" : "bg-zinc-300"
      }`}
    >
      <span
        className={`absolute left-1 inline-block size-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function formatLastActive(value: string | undefined) {
  if (!value) {
    return "Sin actividad reciente";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin actividad reciente";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
