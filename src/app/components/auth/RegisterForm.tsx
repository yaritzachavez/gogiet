"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotify } from "@/context/NotificationContext";
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
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const notify = useNotify();

  const sendVerificationCode = async () => {
    try {
      if (!email.trim()) {
        const message = "Ingresa un correo.";
        notify.warning(message, "Falta tu correo");
        return;
      }

      if (!isValidEmail(email.trim())) {
        const message = "Ingresa un correo válido.";
        notify.warning(message, "Correo inválido");
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

      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        message?: string;
      } | null;

      if (response.ok && data?.success) {
        setCodeSent(true);
        const message = data?.message || "Código enviado correctamente.";
        notify.success(message, "Revisa tu correo");
      } else {
        const message =
          data?.error || data?.message || "No se pudo enviar el código.";
        notify.error(message, "No pudimos enviar el código");
      }
    } catch (err) {
      console.warn("Error enviando código", err);
      const message = getFriendlyErrorMessage(
        err,
        "No se pudo enviar el código. Revisa tu conexión e intenta nuevamente.",
      );
      notify.error(message, "Conexión no disponible");
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !phoneNumber.trim() ||
      !password
    ) {
      const message = "Completa todos los campos obligatorios.";
      notify.warning(message, "Faltan datos");
      return;
    }

    if (!isValidEmail(email.trim())) {
      const message = "Ingresa un correo válido.";
      notify.warning(message, "Correo inválido");
      return;
    }

    const passwordError = validatePasswordStrength(password);

    if (passwordError) {
      notify.warning(passwordError, "Revisa tu contraseña");
      return;
    }

    if (!acceptTerms) {
      const message = "Debes aceptar los términos y condiciones.";
      notify.warning(message, "Falta tu confirmación");
      return;
    }

    if (password !== confirmPassword) {
      const message = "Las contraseñas no coinciden.";
      notify.warning(message, "Contraseñas distintas");
      return;
    }

    if (!verificationCode.trim()) {
      const message = "Debes ingresar el código de verificación.";
      notify.warning(message, "Falta el código");
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

      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        message?: string;
        email?: string;
        requiresVerification?: boolean;
        user?: { email?: string };
      } | null;

      if (response.ok && data?.success) {
        const message = "Cuenta creada correctamente.";
        notify.success(message, "Tu cuenta está lista");
        router.push("/login");
      } else {
        const message =
          data?.error ||
          data?.message ||
          "No pudimos crear tu cuenta. Intenta nuevamente.";
        notify.error(message, "No pudimos crear tu cuenta");
        console.error("REGISTER FRONTEND ERROR:", {
          status: response.status,
          data,
        });
      }
    } catch (err) {
      console.warn("Error en la petición de registro", err);
      const message = getFriendlyErrorMessage(
        err,
        "No pudimos crear tu cuenta. Revisa tu conexión e intenta nuevamente.",
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
          Crear cuenta
        </p>
        <h1 className="mt-3 text-center text-2xl font-black text-[#f5f5f5] sm:text-3xl">
          Registro
        </h1>
        <p className="mt-3 text-center text-sm text-[#b3b3b3]">
          Únete a Gogi Eats y empieza a pedir con una experiencia moderna y
          local.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
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
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms"
              checked={acceptTerms}
              onCheckedChange={(checked) => setAcceptTerms(checked === true)}
              aria-describedby="terms-description"
              className="mt-0.5 border-white/20 bg-white/5"
            />
            <Label htmlFor="terms" className="text-sm leading-6 text-[#d8d0c6]">
              Acepto los{" "}
              <Link
                href="/terminos"
                className="font-semibold text-orange-300 underline-offset-4 hover:text-orange-200 hover:underline"
              >
                Términos y Condiciones
              </Link>{" "}
              y el{" "}
              <Link
                href="/privacidad"
                className="font-semibold text-orange-300 underline-offset-4 hover:text-orange-200 hover:underline"
              >
                Aviso de Privacidad
              </Link>{" "}
              de Gogi Eats.
            </Label>
          </div>
          <p
            id="terms-description"
            className="mt-3 pl-7 text-xs leading-5 text-[#9f968c] sm:text-[13px] sm:leading-6"
          >
            Al registrarte aceptas que Gogi Eats use tus datos de nombre,
            correo, teléfono y ubicación únicamente para crear tu cuenta,
            validar tu identidad, procesar pedidos, coordinar entregas, enviar
            avisos sobre tu pedido, brindar soporte y mejorar el servicio.
            También aceptas las reglas de uso de la plataforma, tiempos de
            entrega, cancelaciones, reembolsos y responsabilidades como cliente.
          </p>
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
