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
    <div className="mx-auto w-full max-w-lg">
      {mode === "register" ? <RegisterForm /> : <LoginForm />}
      <div className="mt-8 text-center">
        <p className="text-sm text-white/45">© 2025 Gogi Eats</p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,107,0,0.26),transparent_24%),radial-gradient(circle_at_78%_18%,rgba(255,127,38,0.18),transparent_18%),radial-gradient(circle_at_50%_100%,rgba(255,107,0,0.10),transparent_24%),linear-gradient(160deg,#0b0b0b_0%,#111111_42%,#0b0b0b_100%)]">
      <div className="min-h-screen bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0.34)_100%)] backdrop-blur-[2px]">
        <div className="app-shell grid min-h-screen grid-cols-1 items-center gap-6 py-5 sm:gap-8 sm:py-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div className="hidden lg:block">
            <div className="relative min-h-[34rem] w-full overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,rgba(255,107,0,0.08)_100%)] shadow-[0_30px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl xl:min-h-[38rem]">
              <Image
                src="/repartidor.png"
                alt="Repartidor entregando un pedido"
                fill
                className="object-cover object-center scale-[1.03]"
                priority
              />
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(11,11,11,0.10)_0%,rgba(11,11,11,0.46)_44%,rgba(255,107,0,0.28)_100%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,127,38,0.28),transparent_34%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(255,107,0,0.24),transparent_30%)]" />
              <div className="absolute inset-x-0 bottom-0 p-6 xl:p-8">
                <div className="max-w-md rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(17,17,17,0.70)_0%,rgba(255,107,0,0.14)_100%)] p-5 backdrop-blur-xl xl:p-6">
                  <p className="text-xs font-extrabold uppercase tracking-[0.32em] text-orange-300">
                    Gogi Eats Access
                  </p>
                  <h1 className="mt-3 balanced-text text-3xl font-black leading-tight text-white xl:text-4xl">
                    Delivery local con presencia de startup real.
                  </h1>
                  <p className="mt-3 text-sm leading-7 text-white/68">
                    Accede a una experiencia moderna, rápida y lista para
                    escalar con negocios, repartidores y clientes en un mismo
                    ecosistema.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Suspense
            fallback={
              <div className="py-12 text-center text-white">Cargando...</div>
            }
          >
            <AuthContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
