"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { useNotify } from "@/context/NotificationContext";
import { isValidEmail } from "@/lib/auth-account-shared";
import { getClientApiUrl } from "@/lib/client-api";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { login } = useAuth();
  const notify = useNotify();

  const resolvePostLoginRoute = (roles: string[] | undefined) => {
    const normalizedRoles = Array.isArray(roles)
      ? roles.map((role) => String(role).trim().toUpperCase())
      : [];

    if (normalizedRoles.includes("ADMIN_GENERAL")) {
      return "/admin";
    }

    if (
      normalizedRoles.includes("ADMIN_NEGOCIO") ||
      normalizedRoles.includes("VENDEDOR")
    ) {
      return "/business";
    }

    if (normalizedRoles.includes("REPARTIDOR")) {
      return "/delivery";
    }

    return "/shop";
  };

  const getLoginErrorMessage = (
    status: number,
    data?: { error?: string; message?: string } | null,
  ) => {
    if (data?.error?.trim()) {
      return data.error.trim();
    }

    if (status === 404) {
      return "No encontramos una cuenta con ese correo.";
    }

    if (status === 401) {
      return "La contraseña no es correcta.";
    }

    if (status === 429) {
      return "Tu cuenta está temporalmente bloqueada. Intenta nuevamente en unos minutos.";
    }

    if (status >= 500) {
      if (data?.error?.trim()) {
        return data.error.trim();
      }
      return "Ocurrió un problema en el servidor. Intenta nuevamente.";
    }

    return formatApiError(
      status,
      data,
      "No pudimos iniciar sesión. Intenta nuevamente.",
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      const message = "Completa tu correo y contraseña para continuar.";
      notify.warning(message, "Faltan datos");
      return;
    }

    if (!isValidEmail(email)) {
      const message = "Ingresa un correo válido.";
      notify.warning(message, "Correo inválido");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(getClientApiUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        redirectTo?: string;
        user?: { id: number; name: string; roles?: string[] };
      } | null;

      if (res.ok && data?.success) {
        const currentUser = await login();

        if (!currentUser) {
          notify.error(
            "No pudimos validar tu sesión después del login. Intenta nuevamente.",
            "Sesión no disponible",
          );
          return;
        }

        const targetRoute =
          data.redirectTo || resolvePostLoginRoute(currentUser.roles);

        notify.success("Sesión iniciada correctamente.", "Bienvenido");
        router.replace(targetRoute);
        router.refresh();
      } else {
        const message = getLoginErrorMessage(res.status, data);
        notify.error(message, "No pudimos iniciar sesión");
      }
    } catch (err) {
      console.warn("Error en la petición de login", err);
      const message = getFriendlyErrorMessage(
        err,
        "Error de conexión. Revisa tu internet e intenta nuevamente.",
      );
      notify.error(message, "Conexión no disponible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,107,0,0.10),transparent_28%),linear-gradient(180deg,rgba(26,26,26,0.96)_0%,rgba(18,18,18,0.96)_100%)] p-5 shadow-[0_32px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:rounded-[32px] sm:p-8">
      <div className="mb-6 sm:mb-8">
        <p className="text-center text-xs font-extrabold uppercase tracking-[0.32em] text-orange-300">
          Bienvenido
        </p>
        <h1 className="mt-3 text-center text-2xl font-black text-[#f5f5f5] sm:text-3xl">
          Inicia sesión
        </h1>
        <p className="mt-3 text-center text-sm text-[#b3b3b3]">
          Entra a tu cuenta para seguir pidiendo, administrar tu negocio o
          revisar tus paneles.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm text-[#f5f5f5]">
            Correo electrónico
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-[#f5f5f5] placeholder:text-[#7f7f7f]"
            required
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm text-[#f5f5f5]">
            Contraseña
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="text-[#f5f5f5] placeholder:text-[#7f7f7f]"
            required
          />
          <div className="text-right">
            <Link
              href="/request-reset"
              className="text-sm font-semibold text-orange-300 hover:text-orange-200"
            >
              Olvidé mi contraseña
            </Link>
          </div>
        </div>

        {/* Login Button */}
        <Button
          type="submit"
          className="w-full py-3 text-white"
          disabled={submitting}
        >
          {submitting ? "Ingresando..." : "Iniciar sesión"}
        </Button>

        {/* Register Link */}
        <div className="text-center">
          <span className="text-sm text-[#8f8f8f]">
            ¿No tienes cuenta?{" "}
            <Link
              href="/auth?mode=register"
              className="font-semibold text-orange-300 hover:text-orange-200"
            >
              Regístrate
            </Link>
          </span>
        </div>
      </form>
    </div>
  );
}
