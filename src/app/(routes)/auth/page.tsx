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
          <div className="flex w-full items-center justify-center">
            <div className="relative flex w-full max-w-[34rem] items-center justify-center border-none bg-transparent shadow-none sm:max-w-[38rem] lg:min-h-[34rem] lg:max-w-none xl:min-h-[38rem]">
              <Image
                src="/3.png"
                alt="Gogi Eats"
                width={900}
                height={900}
                className="h-auto max-h-[22rem] w-full object-contain sm:max-h-[30rem] lg:max-h-[620px]"
                priority
              />
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
