"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "@/app/components/auth/loginForm";
import RegisterForm from "@/app/components/auth/RegisterForm";

function AuthContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "login";

  return (
    <div className="w-full max-w-md mx-auto">
      {mode === "register" ? <RegisterForm /> : <LoginForm />}
      <div className="text-center mt-8">
        <p className="text-white/60 text-sm">© 2025 Gogi Eats</p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#f97316_0%,#fb923c_46%,#fff7ed_100%)]">
      <div className="min-h-screen bg-orange-950/20 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left Panel */}
          <div className="hidden lg:block">
            <div className="relative h-96 w-full overflow-hidden rounded-3xl bg-white/10 shadow-2xl backdrop-blur">
              <Image
                src="/repartidor.png"
                alt="Repartidor entregando un pedido"
                fill
                className="object-cover object-center"
                priority
              />
              <div className="absolute inset-0 bg-orange-950/25" />
            </div>
          </div>

          {/* Right Panel */}
          <Suspense fallback={<div className="text-white">Cargando...</div>}>
            <AuthContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
