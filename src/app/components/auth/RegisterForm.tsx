"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isValidEmail,
  normalizePhone,
  validatePasswordStrength,
} from "@/lib/auth-account-shared";
import { getClientApiUrl } from "@/lib/client-api";
import { getFriendlyErrorMessage } from "@/lib/friendly-errors";

export default function RegisterForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const sendVerificationCode = async () => {
    try {
      setErrorMessage("");
      setSuccessMessage("");

      if (!email.trim()) {
        setErrorMessage("Ingresa un correo.");
        return;
      }

      if (!isValidEmail(email.trim())) {
        setErrorMessage("Ingresa un correo válido.");
        return;
      }

      setSendingCode(true);

      const response = await fetch(
        getClientApiUrl("/api/auth/send-verification-code"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
          }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            message?: string;
          }
        | null;

      if (response.ok && data?.success) {
        setCodeSent(true);
        setSuccessMessage(
          data?.message || "Código enviado correctamente.",
        );
      } else {
        setErrorMessage(
          data?.error ||
            data?.message ||
            "No se pudo enviar el código.",
        );
      }
    } catch (err) {
      console.warn("Error enviando código", err);
      setErrorMessage(
        getFriendlyErrorMessage(
          err,
          "No se pudo enviar el código. Revisa tu conexión e intenta nuevamente.",
        ),
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !phoneNumber.trim() ||
      !password
    ) {
      setErrorMessage("Completa todos los campos obligatorios.");
      return;
    }

    if (!isValidEmail(email.trim())) {
      setErrorMessage("Ingresa un correo válido.");
      return;
    }

    const passwordError = validatePasswordStrength(password);

    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }

    if (!acceptTerms) {
      setErrorMessage("Debes aceptar los términos y condiciones.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    if (!verificationCode.trim()) {
      setErrorMessage("Debes ingresar el código de verificación.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(getClientApiUrl("/api/auth/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email,
          phone: normalizePhone(phoneNumber),
          password,
          confirmPassword,
          verificationCode: verificationCode.trim(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            error?: string;
            message?: string;
            email?: string;
            requiresVerification?: boolean;
            user?: { email?: string };
          }
        | null;

      if (response.ok && data?.success) {
        setSuccessMessage("Cuenta creada correctamente.");
        router.push("/login");
      } else {
        setErrorMessage(
          data?.error ||
            data?.message ||
            "No pudimos crear tu cuenta. Intenta nuevamente.",
        );
        console.error("REGISTER FRONTEND ERROR:", {
          status: response.status,
          data,
        });
      }
    } catch (err) {
      console.warn("Error en la petición de registro", err);
      setErrorMessage(
        getFriendlyErrorMessage(
          err,
          "No pudimos crear tu cuenta. Revisa tu conexión e intenta nuevamente.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,107,0,0.10),transparent_28%),linear-gradient(180deg,rgba(26,26,26,0.96)_0%,rgba(18,18,18,0.96)_100%)] p-8 shadow-[0_32px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="mb-8">
        <p className="text-center text-xs font-extrabold uppercase tracking-[0.32em] text-orange-300">
          Crear cuenta
        </p>
        <h1 className="mt-3 text-center text-3xl font-black text-[#f5f5f5]">
          Registro
        </h1>
        <p className="mt-3 text-center text-sm text-[#b3b3b3]">
          Únete a Gogi Eats y empieza a pedir con una experiencia moderna y
          local.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 👇 mensaje de error */}
        {errorMessage && (
          <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-300">
            {successMessage}
          </p>
        )}

        {/* First Name */}
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-sm text-[#f5f5f5]">
            Nombre
          </Label>
          <Input
            id="firstName"
            type="text"
            placeholder="Tu nombre"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="text-[#f5f5f5] placeholder:text-[#7f7f7f]"
            required
          />
        </div>

        {/* Last Name */}
        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-sm text-[#f5f5f5]">
            Apellido
          </Label>
          <Input
            id="lastName"
            type="text"
            placeholder="Tu apellido"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="text-[#f5f5f5] placeholder:text-[#7f7f7f]"
            required
          />
        </div>

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

        {/* Verification Code */}
        <div className="space-y-3">
          <Button
            type="button"
            onClick={sendVerificationCode}
            disabled={sendingCode || !email.trim()}
            className="w-full py-3 text-white"
          >
            {sendingCode
              ? "Enviando código..."
              : codeSent
                ? "Reenviar código"
                : "Enviar código"}
          </Button>

          {codeSent && (
            <div className="space-y-2">
              <Label
                htmlFor="verificationCode"
                className="text-sm text-[#f5f5f5]"
              >
                Código de verificación
              </Label>
              <Input
                id="verificationCode"
                type="text"
                placeholder="123456"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="text-center tracking-[0.5em] text-[#f5f5f5] placeholder:text-[#7f7f7f]"
                required
              />
            </div>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm text-[#f5f5f5]">
            Número de teléfono
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="Tu número de contacto"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(normalizePhone(e.target.value))}
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
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm text-[#f5f5f5]">
            Confirmar contraseña
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="text-[#f5f5f5] placeholder:text-[#7f7f7f]"
            required
          />
        </div>

        {/* Terms */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="terms"
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(checked === true)}
          />
          <Label htmlFor="terms" className="text-sm text-[#b3b3b3]">
            Acepto Términos de uso y política de privacidad
          </Label>
        </div>

        <Button
          type="submit"
          className="w-full py-3 text-white"
          disabled={!acceptTerms || submitting}
        >
          {submitting ? "Creando cuenta..." : "Registrarse"}
        </Button>

        <div className="text-center">
          <span className="text-sm text-[#8f8f8f]">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/auth?mode=login"
              className="font-semibold text-orange-300 hover:text-orange-200"
            >
              Inicia sesión
            </Link>
          </span>
        </div>
      </form>
    </div>
  );
}