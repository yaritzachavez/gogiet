"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePasswordStrength } from "@/lib/auth-account";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => String(searchParams.get("token") ?? "").trim(), [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (!token) {
      setErrorMessage("El enlace expiró.");
      return;
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string; message?: string }
        | null;

      if (!response.ok || payload?.success === false) {
        setErrorMessage(
          formatApiError(
            response.status,
            payload,
            "No pudimos actualizar tu contraseña. Intenta nuevamente.",
          ),
        );
        return;
      }

      setSuccessMessage(
        payload?.message || "Tu contraseña fue actualizada correctamente.",
      );
      window.setTimeout(() => {
        router.push("/auth?mode=login");
      }, 1200);
    } catch (error) {
      setErrorMessage(
        getFriendlyErrorMessage(
          error,
          "No pudimos actualizar tu contraseña. Intenta nuevamente.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f97316_0%,#fb923c_46%,#fff7ed_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-2xl border border-orange-100 bg-white p-8 shadow-2xl">
          <h1 className="mb-3 text-center text-2xl font-semibold text-orange-950">
            Crea una nueva contraseña
          </h1>
          <p className="mb-6 text-center text-sm text-stone-500">
            Elige una contraseña segura para volver a entrar a tu cuenta.
          </p>

          {errorMessage ? (
            <p className="mb-4 text-center text-sm text-red-600">{errorMessage}</p>
          ) : null}
          {successMessage ? (
            <p className="mb-4 text-center text-sm text-emerald-600">{successMessage}</p>
          ) : null}

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-orange-950">
                Nueva contraseña
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm text-orange-950">
                Confirmar contraseña
              </Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
              />
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-lg bg-orange-500 py-3 font-medium text-white hover:bg-orange-600"
            >
              {submitting ? "Actualizando..." : "Actualizar contraseña"}
            </Button>

            <p className="text-center text-sm text-stone-500">
              <Link
                href="/auth?mode=login"
                className="font-semibold text-orange-600 hover:text-orange-700"
              >
                Volver al inicio de sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
