"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isValidEmail,
  normalizeEmail,
  validatePasswordStrength,
} from "@/lib/auth-account-shared";
import { getClientApiUrl } from "@/lib/client-api";
import { formatApiError, getFriendlyErrorMessage } from "@/lib/friendly-errors";

export default function RequestResetPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSendCode = async () => {
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
            "No pudimos enviar las instrucciones de recuperación.",
          ),
        );
        return;
      }

      setCodeSent(true);
      setCodeVerified(false);
      setSuccessMessage(
        payload?.message || "Te enviamos un código para recuperar tu contraseña.",
      );
    } catch (error) {
      setErrorMessage(
        getFriendlyErrorMessage(
          error,
          "No pudimos enviar el código de recuperación.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage("Ingresa un correo válido.");
      return;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setErrorMessage("Ingresa el código de 6 dígitos.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(
        getClientApiUrl("/api/auth/forgot-password/verify-code"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            code: code.trim(),
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string; message?: string }
        | null;

      if (!response.ok || payload?.success === false) {
        setErrorMessage(
          formatApiError(
            response.status,
            payload,
            "No pudimos verificar tu código.",
          ),
        );
        return;
      }

      setCodeVerified(true);
      setSuccessMessage(payload?.message || "Código verificado correctamente.");
    } catch (error) {
      setErrorMessage(
        getFriendlyErrorMessage(error, "No pudimos verificar tu código."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage("Ingresa un correo válido.");
      return;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setErrorMessage("Ingresa el código de 6 dígitos.");
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
      const response = await fetch(getClientApiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          code: code.trim(),
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
            "No pudimos actualizar tu contraseña.",
          ),
        );
        return;
      }

      setSuccessMessage(
        payload?.message || "Tu contraseña fue actualizada correctamente.",
      );
      setCodeVerified(false);
      setCodeSent(false);
      setCode("");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMessage(
        getFriendlyErrorMessage(
          error,
          "No pudimos actualizar tu contraseña.",
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
            Escribe tu correo, verifica el código y crea una nueva contraseña.
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
              onClick={handleSendCode}
              disabled={submitting}
              className="w-full rounded-lg bg-orange-500 py-3 font-medium text-white hover:bg-orange-600"
            >
              {submitting ? "Enviando..." : codeSent ? "Reenviar código" : "Enviar código"}
            </Button>

            {codeSent ? (
              <div className="space-y-5 border-t border-orange-100 pt-5">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-sm text-orange-950">
                    Código de verificación
                  </Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
                  />
                </div>

                {!codeVerified ? (
                  <Button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={submitting}
                    className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-800"
                  >
                    {submitting ? "Verificando..." : "Verificar código"}
                  </Button>
                ) : null}

                {codeVerified ? (
                  <>
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
                      onClick={handleResetPassword}
                      disabled={submitting}
                      className="w-full rounded-lg bg-orange-500 py-3 font-medium text-white hover:bg-orange-600"
                    >
                      {submitting ? "Actualizando..." : "Actualizar contraseña"}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}

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
