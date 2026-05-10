"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = useMemo(
    () => String(searchParams.get("email") ?? "").trim().toLowerCase(),
    [searchParams],
  );
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerifyCode = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (!email || !code.trim()) {
      setErrorMessage("Ingresa tu correo y el código de verificación.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          code: code.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        message?: string;
      } | null;

      if (!response.ok || payload?.success === false) {
        setErrorMessage(
          formatApiError(
            response.status,
            payload,
            "No pudimos verificar el código enviado.",
          ),
        );
        return;
      }

      setSuccessMessage(
        payload?.message || "Correo verificado correctamente",
      );
      window.setTimeout(() => {
        router.push("/auth?mode=login");
      }, 1200);
    } catch (error) {
      console.warn("Error verificando correo:", error);
      setErrorMessage(
        getFriendlyErrorMessage(error, "No pudimos verificar el código."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (!email) {
      setErrorMessage("Falta el correo a verificar.");
      return;
    }

    try {
      setResending(true);
      const response = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        message?: string;
      } | null;

      if (!response.ok || payload?.success === false) {
        setErrorMessage(
          formatApiError(
            response.status,
            payload,
            "No pudimos reenviar el código.",
          ),
        );
        return;
      }

      setSuccessMessage(
        payload?.message || "Te enviamos un nuevo código de verificación",
      );
    } catch (error) {
      console.warn("Error reenviando código:", error);
      setErrorMessage(
        getFriendlyErrorMessage(error, "No pudimos reenviar el código."),
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f97316_0%,#fb923c_46%,#fff7ed_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-2xl border border-orange-100 bg-white p-8 shadow-2xl">
          <h1 className="mb-3 text-center text-2xl font-semibold text-orange-950">
            Verifica tu correo
          </h1>
          <p className="mb-6 text-center text-sm text-stone-500">
            Ingresa el código de 6 dígitos enviado a{" "}
            <span className="font-semibold text-orange-700">{email || "tu correo"}</span>
          </p>

          {errorMessage ? (
            <p className="mb-4 text-center text-sm text-red-600">
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p className="mb-4 text-center text-sm text-emerald-600">
              {successMessage}
            </p>
          ) : null}

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="verification-code" className="text-sm text-orange-950">
                Código de verificación
              </Label>
              <Input
                id="verification-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="border-orange-200 bg-orange-50/50 text-center text-lg tracking-[0.35em] text-orange-950 placeholder:tracking-normal placeholder:text-orange-300 focus:border-orange-500"
              />
            </div>

            <Button
              type="button"
              onClick={handleVerifyCode}
              disabled={submitting}
              className="w-full rounded-lg bg-orange-500 py-3 font-medium text-white hover:bg-orange-600"
            >
              {submitting ? "Verificando..." : "Verificar código"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleResendCode}
              disabled={resending}
              className="w-full rounded-lg border-orange-200 text-orange-700 hover:bg-orange-50"
            >
              {resending ? "Reenviando..." : "Reenviar código"}
            </Button>

            <p className="text-center text-sm text-stone-500">
              ¿Ya verificaste tu cuenta?{" "}
              <Link
                href="/auth?mode=login"
                className="font-semibold text-orange-600 hover:text-orange-700"
              >
                Iniciar sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
