import { Building2, ReceiptText, Truck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

const regulationCards = [
  {
    title: "Reglamento para negocios",
    description:
      "Consulta las condiciones generales aplicables a negocios afiliados dentro de Gogi Eats.",
    href: "/reglamentos/negocios",
    icon: Building2,
  },
  {
    title: "Reglamento para clientes",
    description:
      "Revisa términos, responsabilidades y lineamientos para quienes realizan pedidos.",
    href: "/reglamentos/clientes",
    icon: ReceiptText,
  },
  {
    title: "Reglamento para repartidores",
    description:
      "Conoce el contrato y reglamento general aplicable a quienes realizan entregas.",
    href: "/reglamentos/repartidores",
    icon: Truck,
  },
];

export default function RegulationsIndexPage() {
  return (
    <main className="min-h-screen bg-[#f8f5f0]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Centro legal"
          title="Reglamentos públicos de Gogi Eats"
          description="Accede a los documentos públicos de operación y uso de la plataforma."
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/">Volver al inicio</Link>
            </Button>
          }
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {regulationCards.map((card) => {
            const Icon = card.icon;

            return (
              <SectionCard
                key={card.href}
                className="border-orange-100 bg-white/95 p-6"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                  <Icon className="size-6" />
                </div>
                <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-950">
                  {card.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {card.description}
                </p>
                <Button asChild className="mt-6 rounded-full">
                  <Link href={card.href}>Abrir reglamento</Link>
                </Button>
              </SectionCard>
            );
          })}
        </div>
      </div>
    </main>
  );
}
