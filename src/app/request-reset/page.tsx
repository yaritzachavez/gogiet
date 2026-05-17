"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidEmail, normalizeEmail } from "@/lib/auth-account-shared";
import { getClientApiUrl } from "@/lib/client-api";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";

export default function RequestResetPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage("Ingresa un correo válido.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(getClientApiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string; message?: string }
        | null;

      if (!response.ok || payload?.success === false) {
        setErrorMessage(
          formatApiError(
            response.status,
            payload,
            "No pudimos enviar el enlace de recuperación.",
          ),
        );
        return;
      }

      setSuccessMessage(
        payload?.message ||
          "Si encontramos una cuenta asociada a ese correo, recibirás un enlace de recuperación.",
      );
    } catch (error) {
      setErrorMessage(
        getFriendlyErrorMessage(
          error,
          "No pudimos enviar el enlace de recuperación.",
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
            Recupera tu contraseña
          </h1>
          <p className="mb-6 text-center text-sm text-stone-500">
            Escribe tu correo y te enviaremos un enlace seguro para crear una nueva contraseña.
          </p>

          {errorMessage ? (
            <p className="mb-4 text-center text-sm text-red-600">{errorMessage}</p>
          ) : null}
          {successMessage ? (
            <p className="mb-4 text-center text-sm text-emerald-600">{successMessage}</p>
          ) : null}

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-orange-950">
                Correo electrónico
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
              />
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-lg bg-orange-500 py-3 font-medium text-white hover:bg-orange-600"
            >
              {submitting ? "Enviando..." : "Enviar enlace"}
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
