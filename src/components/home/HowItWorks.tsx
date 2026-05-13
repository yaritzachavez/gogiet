import { Bike, ShoppingBag, Store, WalletCards } from "lucide-react";

import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";

const STEPS = [
  {
    number: "01",
    title: "Elige tu negocio favorito",
    description:
      "Explora opciones locales, revisa sus productos y descubre sabores de Mazamitla en un solo lugar.",
    icon: Store,
  },
  {
    number: "02",
    title: "Agrega productos al carrito",
    description:
      "Selecciona antojos, bebidas o básicos del día con una experiencia simple y visual.",
    icon: ShoppingBag,
  },
  {
    number: "03",
    title: "Confirma tu pedido",
    description:
      "Revisa el total, la entrega y los detalles antes de enviar tu orden con tranquilidad.",
    icon: WalletCards,
  },
  {
    number: "04",
    title: "Recibe en tu domicilio",
    description:
      "Tu pedido sale con atención local y llega con seguimiento claro hasta tu puerta.",
    icon: Bike,
  },
];

export function HowItWorks() {
  return (
    <section className="px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200 bg-slate-950 px-6 py-10 text-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:px-8 sm:py-12">
        <HomeSectionHeader
          eyebrow="Cómo funciona"
          title="Un proceso claro para pedir rápido y sin fricción"
          description="Cuatro pasos sencillos para conectar a los negocios locales con clientes que quieren una experiencia más práctica y cercana."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step) => {
            const Icon = step.icon;

            return (
              <article
                key={step.number}
                className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.16)] backdrop-blur"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black uppercase tracking-[0.24em] text-orange-300">
                    {step.number}
                  </span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                    <Icon className="h-6 w-6" />
                  </div>
                </div>

                <h3 className="mt-5 text-xl font-black">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {step.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
