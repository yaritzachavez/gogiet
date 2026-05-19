"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { fetchWithSession } from "@/lib/client-auth";

export default function FormClient({ businessId }: { businessId: number }) {
  const [name, setName] = useState("");

  const canSubmit = name.trim().length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const res = await fetchWithSession(`/api/categories/${businessId}/new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        business_id: businessId, // <-- enviado a tu endpoint
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(`Error: ${data.error}`);
      return;
    }

    alert("Categoría creada correctamente");
    setName("");

    // Opcional: regresar al panel del negocio
    // router.push(`/business/${businessId}`);
  }

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white shadow-sm transition focus:border-[#4c956c] focus:outline-none focus:ring-2 focus:ring-[#c5ead1]";

  return (
    <main className="min-h-screen bg-fixed bg-cover bg-center [background-image:url('/fondo.png')]">
      <div className="min-h-screen bg-[linear-gradient(180deg,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.72)_45%,rgba(0,0,0,0.9)_100%)]">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          {/* ENCABEZADO */}
          <section className="relative overflow-hidden rounded-[32px] border border-[#dbe7c7] bg-gradient-to-br from-[#1f3029] via-[#2f4638] to-[#3f5c45] p-8 text-white shadow-2xl sm:p-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-[#f2fbe0]">
              Nueva categoría
            </span>

            <div className="mt-5 space-y-3">
              <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
                Agrega una categoría al menú
              </h1>
              <p className="max-w-xl text-sm text-white/90">
                Se utilizará para clasificar productos dentro del catálogo.
              </p>
            </div>

            <Link
              href="/business"
              className="absolute right-6 top-6 inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              ← Regresar
            </Link>
          </section>

          {/* FORMULARIO */}
          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6 rounded-[32px] bg-black/70 p-6 shadow-xl ring-1 ring-white/10"
          >
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-sm font-medium text-[#1b4332]"
              >
                Nombre de la categoría
              </label>

              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Bebidas calientes"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-gradient-to-r from-[#2f5238] via-[#4c956c] to-[#a7c957] px-4 py-3 text-sm font-semibold text-white shadow-2xl transition hover:brightness-[1.05] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar categoría
            </button>

            <p className="text-[11px] text-[#5c6f5b]">
              La categoría se guardará en borrador hasta que conectes el
              backend.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
