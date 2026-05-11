"use client";

import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f97316_0%,#fb923c_46%,#fff7ed_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-2xl border border-orange-100 bg-white p-8 shadow-2xl">
          <h1 className="mb-3 text-center text-2xl font-semibold text-orange-950">
            Verificación desactivada
          </h1>
          <p className="mb-6 text-center text-sm text-stone-500">
            La verificación por correo fue desactivada temporalmente. Ya puedes
            iniciar sesión con tu cuenta.
          </p>

          <Link
            href="/login"
            className="block w-full rounded-lg bg-orange-500 py-3 text-center font-medium text-white hover:bg-orange-600"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
