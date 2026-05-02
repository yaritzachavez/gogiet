"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    try {
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

      const data = await res.json();

      if (res.ok) {
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
        router.push(data.redirectTo);
      } else {
        setErrorMessage(data.error || "Error en el inicio de sesión");
      }
    } catch (err) {
      console.error("Error en la petición:", err);
      setErrorMessage("Error de conexión con el servidor");
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
        </div>

        {/* Login Button */}
        <Button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 rounded-lg"
        >
          Iniciar sesión
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
