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
      "Cliente: Persona que utiliza la plataforma para realizar pedidos de productos o servicios ofrecidos por negocios afiliados.",
      "Negocio afiliado: Establecimiento registrado dentro de Gogi Eats que ofrece productos o servicios mediante la plataforma.",
      "Repartidor: Persona independiente encargada de recoger y entregar pedidos.",
    ],
  },
  {
    title: "2. Uso de la plataforma",
    paragraphs: [
      "El cliente se compromete a utilizar la plataforma de forma responsable, legal y respetuosa.",
      "El cliente es responsable de mantener actualizada su información.",
    ],
    bullets: [
      "Nombre real",
      "Número telefónico válido",
      "Dirección correcta y completa",
      "Información de pago válida en caso de pagos electrónicos",
    ],
  },
  {
    title: "3. Registro y cuenta",
    paragraphs: [
      "La cuenta del cliente es personal e intransferible.",
      "Gogi Eats podrá suspender o cancelar cuentas sospechosas.",
    ],
    bullets: [
      "Crear cuentas falsas",
      "Suplantar identidad",
      "Utilizar información falsa",
      "Compartir cuentas",
      "Realizar actividades fraudulentas",
      "Intentar afectar la operación de la plataforma",
    ],
  },
  {
    title: "4. Pedidos",
    paragraphs: [
      "Antes de confirmar un pedido, el cliente deberá verificar la información esencial del pedido.",
      "Una vez confirmado el pedido y aceptado por el negocio, comenzará el proceso de preparación y entrega.",
    ],
    bullets: [
      "Dirección de entrega",
      "Número telefónico",
      "Productos seleccionados",
      "Método de pago",
      "Comentarios especiales",
    ],
  },
  {
    title: "5. Disponibilidad",
    paragraphs: [
      "Los productos, precios, horarios y tiempos de entrega dependen directamente de cada negocio afiliado.",
      "Gogi Eats no garantiza disponibilidad permanente de productos o servicios.",
    ],
  },
  {
    title: "6. Tiempos de entrega",
    paragraphs: [
      "Los tiempos mostrados dentro de la plataforma son estimados y pueden variar.",
      "Gogi Eats no garantiza tiempos exactos de entrega.",
    ],
    bullets: [
      "Clima",
      "Tráfico",
      "Saturación de pedidos",
      "Distancia",
      "Problemas operativos",
      "Disponibilidad de repartidores",
    ],
  },
  {
    title: "7. Cancelaciones",
    paragraphs: [
      "El cliente podrá cancelar pedidos únicamente antes de que el negocio comience la preparación.",
      "Si el pedido ya fue aceptado o preparado, podrá aplicarse cargo parcial o total y el reembolso podrá ser rechazado.",
      "Las cancelaciones frecuentes o sospechosas podrán ocasionar restricciones en la cuenta.",
    ],
  },
  {
    title: "8. Pagos",
    paragraphs: [
      "El cliente acepta cubrir los conceptos aplicables del pedido.",
      "Los pagos electrónicos estarán sujetos a validaciones y procesos de terceros.",
      "Gogi Eats no almacena información bancaria sensible fuera de los servicios autorizados utilizados para procesar pagos.",
    ],
    bullets: [
      "Costo de productos",
      "Costo de envío",
      "Tarifas de servicio aplicables",
      "Impuestos correspondientes",
    ],
  },
  {
    title: "9. Reembolsos",
    paragraphs: [
      "Los reembolsos serán evaluados individualmente.",
      "Gogi Eats se reserva el derecho de aprobar o rechazar solicitudes de reembolso.",
    ],
    bullets: [
      "Pedido no entregado",
      "Cobro duplicado",
      "Error grave comprobado",
      "Dirección incorrecta proporcionada por el cliente",
      "Ausencia del cliente en la entrega",
      "Errores menores ajenos a la plataforma",
      "Inconformidades subjetivas sin evidencia",
    ],
  },
  {
    title: "10. Entrega",
    paragraphs: [
      "El cliente deberá estar disponible para recibir el pedido.",
      "En caso de no localizar al cliente, el repartidor podrá retirarse y el pedido podrá marcarse como entregado o cancelado sin reembolso completo.",
      "El cliente es responsable de proporcionar referencias claras y accesibles.",
    ],
  },
  {
    title: "11. Conducta",
    paragraphs: [
      "Todos los usuarios deberán mantener conducta respetuosa con repartidores, negocios afiliados y personal de soporte.",
      "Cualquier conducta grave podrá ocasionar suspensión permanente.",
    ],
    bullets: [
      "Amenazas",
      "Insultos",
      "Acoso",
      "Discriminación",
      "Comportamiento agresivo",
      "Fraude",
      "Comprobantes falsos",
    ],
  },
  {
    title: "12. Responsabilidad de los productos",
    paragraphs: [
      "La calidad, preparación, ingredientes, contenido y condiciones de los productos son responsabilidad directa de cada negocio afiliado.",
      "Gogi Eats funciona únicamente como intermediario tecnológico.",
    ],
  },
  {
    title: "13. Fallas del servicio",
    paragraphs: [
      "Gogi Eats podrá presentar interrupciones temporales debido a mantenimiento, fallas técnicas, problemas de internet o causas externas.",
      "La plataforma no garantiza funcionamiento ininterrumpido las 24 horas.",
    ],
  },
  {
    title: "14. Privacidad y datos",
    paragraphs: [
      "El cliente autoriza el uso de sus datos para procesamiento de pedidos, contacto operativo, soporte, validación de identidad y mejora del servicio.",
      "Gogi Eats se compromete a proteger la información conforme a las políticas internas y legislación aplicable.",
    ],
  },
  {
    title: "15. Propiedad intelectual",
    paragraphs: [
      "Todo el contenido relacionado con la marca, logotipos, diseño, aplicación, sistema, imágenes y software pertenece exclusivamente a Gogi Eats.",
      "Queda prohibido copiar, distribuir o utilizar contenido sin autorización.",
    ],
  },
  {
    title: "16. Modificaciones",
    paragraphs: [
      "Gogi Eats podrá modificar el presente reglamento en cualquier momento para mejorar la operación y funcionamiento de la plataforma.",
      "Las modificaciones entrarán en vigor desde su publicación oficial dentro de la plataforma.",
    ],
  },
  {
    title: "17. Terminación de cuenta",
    paragraphs: [
      "Gogi Eats podrá suspender o cancelar cuentas por fraude, actividad sospechosa, incumplimiento del reglamento, mal uso de la plataforma o afectaciones a la operación.",
    ],
  },
  {
    title: "18. Aceptación total",
    paragraphs: [
      "Al utilizar la plataforma, el cliente declara haber leído completamente este reglamento, comprender sus alcances, aceptar todas las condiciones establecidas y utilizar la plataforma bajo su propia responsabilidad.",
    ],
  },
];

export default function CustomerRegulationsPage() {
  return (
    <main className="min-h-screen bg-[#f8f5f0]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Reglamentos públicos"
          title="Contrato y Reglamento General para Clientes de Gogi Eats"
          description="Consulta el documento completo aplicable para las personas que usan la plataforma como clientes."
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
            para todas las personas que utilicen la plataforma Gogi Eats como
            clientes.
          </p>
          <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
            Al registrarse, acceder o utilizar la plataforma, el usuario declara
            haber leído, comprendido y aceptado en su totalidad el presente
            reglamento.
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
                ¿Quieres seguir explorando Gogi Eats?
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Puedes volver al inicio y continuar navegando por la plataforma.
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
