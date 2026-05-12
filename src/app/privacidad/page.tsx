import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f8f5f0]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Privacidad"
          title="Aviso general de privacidad de Gogi Eats"
          description="Resumen público del uso de información dentro de la plataforma."
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/">Volver al inicio</Link>
            </Button>
          }
        />

        <SectionCard className="border-orange-100 bg-white/95 p-6 sm:p-8">
          <div className="space-y-4 text-sm leading-7 text-slate-700 sm:text-base">
            <p>
              Gogi Eats utiliza la información proporcionada por clientes,
              negocios y repartidores para operar la plataforma, procesar
              pedidos, dar soporte, validar identidad, coordinar pagos y mejorar
              el servicio.
            </p>
            <p>
              La información se trata bajo lineamientos internos de seguridad y
              conforme a la legislación aplicable. Los detalles operativos y
              responsabilidades de uso también se describen dentro de los
              reglamentos públicos de cada perfil.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link href="/reglamentos">Ver reglamentos</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/terminos">Ver términos</Link>
            </Button>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
