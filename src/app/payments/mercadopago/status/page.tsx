import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

type StatusPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readString(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function MercadoPagoStatusPage({
  searchParams,
}: StatusPageProps) {
  const params = searchParams ? await searchParams : {};
  const status = readString(params.status).toLowerCase();
  const orderId = readString(params.orderId);
  const customMessage = readString(params.message);

  const copyByStatus = {
    success: {
      title: "Pago aprobado",
      description:
        "Mercado Pago aprobó tu pago. Estamos confirmándolo en el pedido para que el negocio lo atienda.",
    },
    pending: {
      title: "Pago pendiente",
      description:
        "Mercado Pago dejó tu pago en estado pendiente. Te avisaremos cuando quede confirmado.",
    },
    failure: {
      title: "Pago no completado",
      description:
        customMessage ||
        "No pudimos completar el pago con tarjeta. Puedes revisar tu pedido e intentarlo de nuevo.",
    },
  } as const;

  const content =
    copyByStatus[status as keyof typeof copyByStatus] ?? copyByStatus.pending;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
        <PageHeader
          eyebrow="Mercado Pago"
          title={content.title}
          description={content.description}
        />

        <SectionCard className="p-6">
          <div className="space-y-4">
            <p className="text-sm font-medium text-[#b3b3b3]">
              {orderId
                ? `Pedido relacionado: #${orderId}`
                : "No recibimos el número de pedido en el regreso del pago."}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {orderId ? (
                <Button asChild size="lg">
                  <Link href={`/orders/${orderId}`}>Ver pedido</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="lg">
                <Link href="/shop">Seguir explorando</Link>
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
