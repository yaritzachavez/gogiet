import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f8f5f0]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Legal"
          title="Términos de uso de Gogi Eats"
          description="Consulta el marco general de uso de la plataforma y accede a los reglamentos específicos por perfil."
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/">Volver al inicio</Link>
            </Button>
          }
        />

        <SectionCard className="border-orange-100 bg-white/95 p-6 sm:p-8">
          <div className="space-y-4 text-sm leading-7 text-slate-700 sm:text-base">
            <p>
              Gogi Eats opera como una plataforma tecnológica que conecta
              clientes, negocios afiliados y repartidores independientes. El
              uso de la plataforma implica la aceptación de los lineamientos
              públicos aplicables a cada perfil.
            </p>
            <p>
              Para una lectura completa, consulta los reglamentos específicos
              que desarrollan responsabilidades, límites de uso, conducta,
              cancelaciones, pagos y funcionamiento operativo.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link href="/reglamentos/clientes">Términos para clientes</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/reglamentos/negocios">Términos para negocios</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/reglamentos/repartidores">
                Términos para repartidores
              </Link>
            </Button>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
