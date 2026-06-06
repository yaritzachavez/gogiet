import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

type RegulationSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

const REGULATION_SECTIONS: RegulationSection[] = [
  {
    title: "1. Definiciones",
    paragraphs: [
      "Gogi Eats: Plataforma tecnológica digital que funciona como intermediario entre clientes, negocios afiliados y repartidores independientes.",
      "Negocio afiliado: Persona física o moral registrada dentro de la plataforma para ofrecer productos o servicios mediante Gogi Eats.",
      "Cliente: Usuario que realiza pedidos mediante la plataforma.",
      "Repartidor: Persona independiente encargada de recoger y entregar pedidos.",
    ],
  },
  {
    title: "2. Naturaleza de la relación",
    paragraphs: [
      "El negocio afiliado reconoce y acepta que Gogi Eats funciona únicamente como intermediario tecnológico.",
      "No existe relación laboral, sociedad, franquicia o representación legal entre Gogi Eats y el negocio afiliado.",
      "El negocio opera bajo su propia responsabilidad fiscal, legal, sanitaria y comercial.",
    ],
    bullets: [
      "Permisos",
      "Licencias",
      "Obligaciones fiscales",
      "Calidad de productos",
      "Cumplimiento sanitario",
      "Operación interna",
    ],
  },
  {
    title: "3. Registro y verificación",
    paragraphs: [
      "Para registrarse en la plataforma, el negocio deberá proporcionar información real y actualizada.",
      "Gogi Eats podrá verificar manualmente la información proporcionada.",
    ],
    bullets: [
      "Nombre comercial",
      "Nombre del propietario o representante",
      "Número telefónico",
      "Dirección",
      "Horarios de operación",
      "Categoría del negocio",
      "Información bancaria",
      "Fotografías reales del negocio",
      "Cualquier información adicional solicitada",
    ],
  },
  {
    title: "4. Activación de cuenta",
    paragraphs: [
      "La activación del negocio estará sujeta a revisión y aprobación por parte de Gogi Eats.",
      "Gogi Eats podrá rechazar o suspender solicitudes por información falsa, actividad sospechosa, incumplimiento legal, mala reputación comprobada o riesgo operativo.",
    ],
  },
  {
    title: "5. Productos y servicios",
    paragraphs: [
      "El negocio afiliado es totalmente responsable de la calidad, preparación, ingredientes, precios, disponibilidad, higiene, empaquetado y tiempos de preparación.",
      "Todos los productos mostrados en la plataforma deberán coincidir con la realidad.",
    ],
    bullets: [
      "Publicidad engañosa",
      "Imágenes falsas",
      "Precios manipulados",
      "Productos ilegales",
      "Productos prohibidos por la plataforma",
    ],
  },
  {
    title: "6. Horarios y disponibilidad",
    paragraphs: [
      "El negocio deberá mantener actualizados horarios, productos disponibles, tiempos estimados e información relevante.",
      "Si el negocio permanece inactivo o desconectado, deberá desactivar temporalmente su disponibilidad.",
    ],
  },
  {
    title: "7. Pedidos",
    paragraphs: [
      "Una vez aceptado un pedido, el negocio deberá iniciar preparación en el menor tiempo posible, mantener comunicación adecuada mediante la plataforma y preparar el pedido correctamente.",
      "El negocio será responsable de errores relacionados con productos faltantes, pedidos incorrectos, mala preparación o empaquetado deficiente.",
    ],
  },
  {
    title: "8. Cancelaciones",
    paragraphs: [
      "El negocio deberá evitar cancelaciones innecesarias.",
      "Las cancelaciones frecuentes podrán ocasionar advertencias, pérdida de visibilidad, suspensión temporal o bloqueo permanente.",
      "Gogi Eats podrá aplicar medidas cuando detecte afectaciones constantes a clientes o repartidores.",
    ],
  },
  {
    title: "9. Pagos y comisiones",
    paragraphs: [
      "El negocio acepta que Gogi Eats podrá cobrar comisión por pedido, tarifas de servicio y costos operativos aplicables.",
      "Los pagos serán procesados conforme a las políticas internas de la plataforma.",
    ],
    bullets: [
      "Retener pagos temporalmente",
      "Aplicar descuentos operativos",
      "Realizar ajustes por reclamaciones o fraudes comprobados",
    ],
  },
  {
    title: "10. Reembolsos y reclamaciones",
    paragraphs: [
      "Los reclamos de clientes podrán ser revisados por Gogi Eats.",
      "En casos comprobados de errores graves, mala calidad, incumplimiento o pedidos incompletos, Gogi Eats podrá aplicar reembolsos, ajustes, penalizaciones o compensaciones.",
    ],
  },
  {
    title: "11. Conducta",
    paragraphs: [
      "El negocio y su personal deberán mantener comportamiento profesional y respetuoso hacia clientes, repartidores, soporte y personal de Gogi Eats.",
    ],
    bullets: [
      "Amenazas",
      "Discriminación",
      "Lenguaje ofensivo",
      "Fraude",
      "Maltrato",
      "Conductas agresivas",
    ],
  },
  {
    title: "12. Propiedad intelectual",
    paragraphs: [
      "El negocio autoriza a Gogi Eats a utilizar nombre comercial, logotipo, imágenes, productos y contenido relacionado únicamente para fines operativos, promocionales y publicitarios dentro de la plataforma.",
      "El negocio declara contar con los derechos necesarios sobre el contenido proporcionado.",
    ],
  },
  {
    title: "13. Privacidad y datos",
    paragraphs: [
      "El negocio autoriza el uso de su información para operación de la plataforma, procesamiento de pagos, soporte, promoción y mejora del servicio.",
      "Gogi Eats se compromete a proteger la información conforme a las políticas internas y legislación aplicable.",
    ],
  },
  {
    title: "14. Fallas del servicio",
    paragraphs: [
      "Gogi Eats podrá presentar interrupciones temporales debido a mantenimiento, fallas técnicas, internet o problemas externos.",
      "La plataforma no garantiza funcionamiento ininterrumpido las 24 horas.",
    ],
  },
  {
    title: "15. Suspensión o terminación",
    paragraphs: [
      "Gogi Eats podrá suspender o cancelar cuentas por fraude, actividad sospechosa, incumplimiento del reglamento, mala conducta, afectaciones reiteradas a clientes o daños a la reputación de la plataforma.",
    ],
  },
  {
    title: "16. Modificaciones",
    paragraphs: [
      "Gogi Eats podrá modificar este reglamento en cualquier momento para mejorar la operación y funcionamiento de la plataforma.",
      "Las modificaciones entrarán en vigor desde su publicación oficial.",
    ],
  },
  {
    title: "17. Limitación de responsabilidad",
    paragraphs: [
      "Gogi Eats actúa únicamente como intermediario tecnológico y no será responsable por daños indirectos, pérdidas comerciales, problemas internos del negocio o incumplimientos ajenos a la plataforma.",
    ],
  },
  {
    title: "18. Aceptación total",
    paragraphs: [
      "Al utilizar la plataforma, el negocio afiliado declara haber leído completamente este reglamento, comprender sus alcances, aceptar todas las condiciones establecidas y operar bajo su propia responsabilidad.",
    ],
  },
];

export default function BusinessRegulationsPage() {
  return (
    <main className="min-h-screen bg-[#f8f5f0]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Reglamentos públicos"
          title="Contrato y Reglamento General para Negocios Afiliados de Gogi Eats"
          description="Consulta el documento completo aplicable para los negocios que ofrecen productos o servicios dentro de la plataforma."
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/">Volver al inicio</Link>
            </Button>
          }
        />

        <SectionCard className="border-orange-200 bg-orange-50/80 p-6">
          <p className="text-sm leading-7 text-slate-700 sm:text-base">
            Bienvenido a Gogi Eats. El presente documento establece los
            términos, condiciones, responsabilidades y lineamientos aplicables
            para todos los negocios afiliados que utilicen la plataforma Gogi
            Eats para ofrecer productos o servicios.
          </p>
          <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
            Al registrarse, acceder o utilizar la plataforma, el negocio
            afiliado declara haber leído, comprendido y aceptado en su totalidad
            el presente reglamento.
          </p>
        </SectionCard>

        <div className="grid gap-5">
          {REGULATION_SECTIONS.map((section) => (
            <SectionCard
              key={section.title}
              className="border-slate-200 bg-white p-6"
            >
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                {section.title}
              </h2>

              <div className="mt-4 space-y-4">
                {section.paragraphs.map((paragraph) => (
                  <p
                    key={`${section.title}-${paragraph.slice(0, 24)}`}
                    className="text-sm leading-7 text-slate-700 sm:text-base"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              {section.bullets?.length ? (
                <ul className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 sm:text-base">
                  {section.bullets.map((bullet) => (
                    <li
                      key={`${section.title}-${bullet}`}
                      className="flex gap-3"
                    >
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </SectionCard>
          ))}
        </div>

        <SectionCard className="border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">
                ¿Quieres volver al sitio principal?
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Puedes regresar al inicio y seguir explorando Gogi Eats.
              </p>
            </div>
            <Button
              asChild
              className="rounded-full bg-orange-600 hover:bg-orange-700"
            >
              <Link href="/">Volver al inicio</Link>
            </Button>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
