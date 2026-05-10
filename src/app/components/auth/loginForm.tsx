"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage("Completa tu correo y contraseña para continuar.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            token?: string;
            redirectTo?: string;
            user?: { id: number; name: string; roles?: string[] };
          }
        | null;

      if (res.ok && data?.success && data?.token && data?.user) {
        localStorage.setItem("token", data.token);
        login(
          {
            id: data.user.id,
            name: data.user.name,
            roles: data.user.roles ?? [],
          },
          data.token,
        );
        document.cookie = `authToken=${data.token}; path=/; max-age=32400; secure; samesite=lax`;
        // Redirigir según rol
        router.push(data.redirectTo || "/");
      } else {
        if (
          res.status === 403 &&
          data?.error === "Debes verificar tu correo antes de iniciar sesión"
        ) {
          router.push(`/verify-email?email=${encodeURIComponent(email)}`);
          return;
        }

        setErrorMessage(
          formatApiError(
            res.status,
            data,
            "No pudimos iniciar sesión. Intenta nuevamente.",
          ),
        );
      }
    } catch (err) {
      console.warn("Error en la petición de login", err);
      setErrorMessage(
        getFriendlyErrorMessage(
          err,
          "Tu conexión se perdió. Revisa tu internet e intenta nuevamente.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-orange-100 bg-white p-8 shadow-2xl">
      <h1 className="mb-8 text-center text-2xl font-semibold text-orange-950">
        Inicio de sesión
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mensaje de error */}
        {errorMessage && (
          <p className="text-red-500 text-sm text-center">{errorMessage}</p>
        )}

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm text-orange-950">
            Correo electrónico
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="correo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
            required
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm text-orange-950">
            Contraseña
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
            required
          />
          <div className="text-right">
            <Link
              href="/request-reset"
              className="text-sm font-semibold text-orange-600 hover:text-orange-700"
            >
              Olvidé mi contraseña
            </Link>
          </div>
        </div>

        {/* Login Button */}
        <Button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 rounded-lg"
          disabled={submitting}
        >
          {submitting ? "Ingresando..." : "Iniciar sesión"}
        </Button>

        {/* Register Link */}
        <div className="text-center">
          <span className="text-sm text-stone-500">
            ¿No tienes cuenta?{" "}
            <Link
              href="/auth?mode=register"
              className="font-semibold text-orange-600 hover:text-orange-700"
            >
              Regístrate
            </Link>
          </span>
        </div>
      </form>
    </div>
  );
}
