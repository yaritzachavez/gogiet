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
    <section className="px-4 py-8 sm:py-16">
      <div className="mx-auto max-w-7xl rounded-[28px] border border-slate-200 bg-slate-950 px-4 py-6 text-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:rounded-[36px] sm:px-8 sm:py-12">
        <HomeSectionHeader
          eyebrow="Cómo funciona"
          title="Un proceso claro para pedir rápido y sin fricción"
          description="Cuatro pasos sencillos para conectar a los negocios locales con clientes que quieren una experiencia más práctica y cercana."
        />

        <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
          {STEPS.map((step) => {
            const Icon = step.icon;

            return (
              <article
                key={step.number}
                className="rounded-[22px] border border-white/10 bg-white/5 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.16)] backdrop-blur sm:rounded-[28px] sm:p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-orange-300 sm:text-sm sm:tracking-[0.24em]">
                    {step.number}
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-orange-500 text-white shadow-lg shadow-orange-500/20 sm:h-12 sm:w-12 sm:rounded-2xl">
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                </div>

                <h3 className="mt-4 text-lg font-black sm:mt-5 sm:text-xl">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-300 sm:mt-3 sm:leading-7">
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
