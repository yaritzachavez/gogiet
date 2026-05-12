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
      "Repartidor: Persona física registrada dentro de la plataforma encargada de recoger y entregar pedidos utilizando sus propios medios y herramientas.",
      "Cliente: Usuario que realiza pedidos mediante la plataforma.",
      "Negocio afiliado: Establecimiento registrado dentro de Gogi Eats que ofrece productos o servicios a través de la plataforma.",
    ],
  },
  {
    title: "2. Naturaleza de la relación",
    paragraphs: [
      "El repartidor reconoce y acepta que su participación dentro de Gogi Eats es de carácter independiente y no constituye relación laboral, subordinación, sociedad, representación legal, asociación o vínculo patronal con Gogi Eats.",
      "Gogi Eats actúa únicamente como intermediario tecnológico para facilitar la conexión entre usuarios, negocios y repartidores.",
    ],
    bullets: [
      "Decide libremente cuándo conectarse o desconectarse de la plataforma.",
      "Utiliza vehículo, teléfono, internet y herramientas propias.",
      "Puede prestar servicios a otras plataformas o empresas.",
      "Es responsable de sus obligaciones fiscales, legales y personales.",
    ],
  },
  {
    title: "3. Registro y verificación",
    paragraphs: [
      "Para formar parte de la plataforma, el repartidor deberá proporcionar información real, vigente y verificable.",
      "Gogi Eats podrá rechazar, suspender o cancelar solicitudes que presenten información falsa, suplantación de identidad, documentación alterada, actividad sospechosa o conductas de riesgo.",
    ],
    bullets: [
      "Nombre completo",
      "Número telefónico",
      "Identificación oficial vigente",
      "Fotografía personal",
      "Datos bancarios o método de pago",
      "Información del vehículo utilizado",
      "Número de emergencia",
      "Cualquier otra información solicitada por Gogi Eats",
    ],
  },
  {
    title: "4. Activación y uso de cuenta",
    paragraphs: [
      "La cuenta del repartidor será revisada manualmente antes de ser activada.",
      "La cuenta es personal e intransferible.",
    ],
    bullets: [
      "Compartir cuentas",
      "Vender cuentas",
      "Permitir que terceros utilicen la cuenta",
      "Manipular pedidos o pagos",
      "Utilizar software fraudulento",
      "Generar pedidos falsos",
      "Simular entregas",
      "Realizar actividades que afecten la operación de la plataforma",
    ],
  },
  {
    title: "5. Disponibilidad y aceptación de pedidos",
    paragraphs: [
      "El repartidor podrá conectarse libremente en los horarios que desee.",
      "Los pedidos podrán ser aceptados de forma voluntaria mediante la plataforma.",
      "El abandono frecuente de pedidos, retrasos injustificados o cancelaciones recurrentes podrán generar sanciones.",
    ],
    bullets: [
      "Dirigirse al negocio en el menor tiempo posible",
      "Mantener comunicación activa",
      "Completar la entrega de manera responsable",
      "Actualizar correctamente el estado del pedido",
    ],
  },
  {
    title: "6. Entrega de pedidos",
    paragraphs: [
      "El repartidor deberá verificar que el pedido coincida con la información mostrada, transportarlo adecuadamente, mantener higiene y cuidado durante la entrega, entregarlo al cliente correcto y confirmar correctamente la entrega dentro de la plataforma.",
      "El repartidor será responsable de los daños ocasionados por mal manejo del pedido, robo comprobado, negligencia o conductas indebidas.",
    ],
  },
  {
    title: "7. Conducta y comportamiento",
    paragraphs: [
      "Todos los repartidores deberán mantener comportamiento profesional y respetuoso.",
      "Cualquier reporte grave podrá ocasionar suspensión inmediata y permanente.",
    ],
    bullets: [
      "Acoso",
      "Discriminación",
      "Amenazas",
      "Violencia",
      "Lenguaje ofensivo",
      "Conductas agresivas",
      "Estado inconveniente durante entregas",
      "Consumo de alcohol o sustancias ilícitas durante el servicio",
    ],
  },
  {
    title: "8. Seguridad",
    paragraphs: [
      "El repartidor reconoce que realiza entregas bajo su propia responsabilidad.",
      "Gogi Eats no garantiza seguridad absoluta durante recorridos, ausencia de accidentes, protección contra robos o condiciones climáticas favorables.",
    ],
    bullets: [
      "Conducir de forma segura",
      "Respetar reglamentos viales",
      "Mantener su vehículo en condiciones adecuadas",
      "Contar con permisos necesarios para circular",
    ],
  },
  {
    title: "9. Pagos y comisiones",
    paragraphs: [
      "Los pagos al repartidor serán calculados conforme a las tarifas y políticas internas vigentes dentro de la plataforma.",
      "Los pagos podrán realizarse diariamente, semanalmente o conforme al esquema vigente informado por la plataforma.",
    ],
    bullets: [
      "Modificar tarifas",
      "Aplicar ajustes operativos",
      "Retener pagos temporalmente en casos de investigación",
      "Descontar montos relacionados con fraude comprobado o daños ocasionados",
    ],
  },
  {
    title: "10. Cancelaciones y sanciones",
    paragraphs: [
      "Podrán aplicarse advertencias, suspensiones temporales o bloqueos permanentes cuando exista incumplimiento del reglamento o afectación a la operación.",
    ],
    bullets: [
      "Cancelaciones frecuentes",
      "Retrasos constantes",
      "Reportes reiterados",
      "Fraude",
      "Robo",
      "Manipulación de pedidos",
      "Cobros indebidos",
      "Mal comportamiento",
      "Daño a la reputación de Gogi Eats",
    ],
  },
  {
    title: "11. Soporte y comunicación",
    paragraphs: [
      "El repartidor podrá comunicarse con el soporte oficial de Gogi Eats mediante los canales autorizados.",
      "Gogi Eats no garantiza disponibilidad inmediata las 24 horas.",
    ],
  },
  {
    title: "12. Propiedad intelectual",
    paragraphs: [
      "El repartidor reconoce que la aplicación, marca, logotipos, diseño, sistema operativo y base tecnológica pertenecen exclusivamente a Gogi Eats.",
      "Queda prohibido copiar, distribuir o utilizar elementos de la plataforma sin autorización.",
    ],
  },
  {
    title: "13. Privacidad y datos",
    paragraphs: [
      "El repartidor autoriza el uso de sus datos para operación de la plataforma, validación de identidad, procesamiento de pagos, seguridad y mejora del servicio.",
      "Gogi Eats se compromete a proteger la información conforme a las políticas internas y legislación aplicable.",
    ],
  },
  {
    title: "14. Modificaciones",
    paragraphs: [
      "Gogi Eats podrá modificar el presente reglamento en cualquier momento para mejorar la operación, seguridad y funcionamiento de la plataforma.",
      "Las modificaciones entrarán en vigor desde su publicación dentro de la plataforma o medios oficiales.",
    ],
  },
  {
    title: "15. Terminación",
    paragraphs: [
      "Gogi Eats podrá suspender o cancelar cuentas en cualquier momento cuando considere que existe riesgo operativo, riesgo legal, riesgo financiero, actividad sospechosa o incumplimiento del reglamento.",
    ],
  },
  {
    title: "16. Aceptación total",
    paragraphs: [
      "Al registrarse y utilizar la plataforma, el repartidor declara haber leído completamente este documento, comprender sus alcances, aceptar todas las condiciones aquí establecidas y utilizar la plataforma bajo su propia responsabilidad.",
    ],
  },
];

export default function DeliveryRegulationsPage() {
  return (
    <main className="min-h-screen bg-[#f8f5f0]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Reglamentos públicos"
          title="Contrato y Reglamento General para Repartidores de Gogi Eats"
          description="Consulta el documento completo aplicable para las personas registradas como repartidores dentro de la plataforma."
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/">Volver al inicio</Link>
            </Button>
          }
        />

        <SectionCard className="border-orange-200 bg-orange-50/80 p-6">
          <p className="text-sm leading-7 text-slate-700 sm:text-base">
            El presente documento establece los términos, condiciones,
            responsabilidades y lineamientos aplicables para todas las personas
            registradas como repartidores dentro de la plataforma Gogi Eats.
          </p>
          <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
            Al crear una cuenta, registrarse, aceptar pedidos o utilizar la
            plataforma, el repartidor declara haber leído, comprendido y
            aceptado en su totalidad el presente reglamento.
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
                ¿Quieres consultar de nuevo la plataforma?
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Puedes volver al inicio y seguir explorando Gogi Eats.
              </p>
            </div>
            <Button asChild className="rounded-full bg-orange-600 hover:bg-orange-700">
              <Link href="/">Volver al inicio</Link>
            </Button>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
