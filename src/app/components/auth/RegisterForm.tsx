"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState(""); // 👈 estado para errores
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!acceptTerms) {
      setErrorMessage("Debes aceptar los términos para continuar");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden");
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email,
          phone: phoneNumber.trim(),
          password,
        }),
      });

      if (res.ok) {
        router.push("/"); // 👈 redirige al home si fue exitoso
      } else {
        const data = await res.json();
        setErrorMessage(data.error || "Error en el registro");
      }
    } catch (err) {
      console.error("Error en la petición:", err);
      setErrorMessage("Error de conexión con el servidor");
    }
  };

  return (
    <div className="rounded-2xl border border-orange-100 bg-white p-8 shadow-2xl">
      <h1 className="mb-8 text-center text-2xl font-semibold text-orange-950">
        Registro
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 👇 mensaje de error */}
        {errorMessage && (
          <p className="text-red-500 text-sm text-center">{errorMessage}</p>
        )}

        {/* First Name */}
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-sm text-orange-950">
            Nombre
          </Label>
          <Input
            id="firstName"
            type="text"
            placeholder="Tu nombre"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
            required
          />
        </div>

        {/* Last Name */}
        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-sm text-orange-950">
            Apellido
          </Label>
          <Input
            id="lastName"
            type="text"
            placeholder="Tu apellido"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
            required
          />
        </div>

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

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm text-orange-950">
            Número de teléfono
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="Tu número de contacto"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
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
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm text-orange-950">
            Confirmar contraseña
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="border-orange-200 bg-orange-50/50 text-orange-950 placeholder:text-orange-300 focus:border-orange-500"
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
          <Label htmlFor="terms" className="text-sm text-stone-500">
            Acepto Términos de uso y política de privacidad
          </Label>
        </div>

        <Button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 rounded-lg"
          disabled={!acceptTerms}
        >
          Registrarse
        </Button>

        <div className="text-center">
          <span className="text-sm text-stone-500">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/auth?mode=login"
              className="font-semibold text-orange-600 hover:text-orange-700"
            >
              Inicia sesión
            </Link>
          </span>
        </div>
      </form>
    </div>
  );
}
