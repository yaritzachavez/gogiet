import { Quote, Star } from "lucide-react";

import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";

const TESTIMONIALS = [
  {
    initials: "CM",
    name: "Cliente de Mazamitla",
    text: "Muy práctico para pedir sin salir de casa y descubrir negocios que antes no veía tan fácil.",
  },
  {
    initials: "AL",
    name: "Vecina de la zona",
    text: "Me gusta porque apoya negocios locales y hace que la experiencia se sienta cercana, no fría.",
  },
  {
    initials: "RG",
    name: "Cliente frecuente",
    text: "Ideal para pedir en Mazamitla y zonas cercanas cuando quieres algo rico sin perder tiempo.",
  },
];

export function Testimonials() {
  return (
    <section className="bg-[linear-gradient(180deg,_rgba(255,255,255,1),_rgba(255,247,237,0.75))] px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <HomeSectionHeader
          eyebrow="Testimonios"
          title="La experiencia se siente local, rápida y confiable"
          description="Comentarios cortos que refuerzan el valor de una plataforma hecha para apoyar a Mazamitla y sus negocios cercanos."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <article
              key={testimonial.initials}
              className="rounded-[30px] border border-orange-100 bg-white p-6 shadow-[0_22px_50px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-lg font-black text-white shadow-lg shadow-orange-500/20">
                    {testimonial.initials}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-950">
                      {testimonial.name}
                    </h3>
                    <div className="mt-2 flex items-center gap-1 text-orange-500">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={`${testimonial.initials}-star-${index + 1}`}
                          className="h-4 w-4 fill-current"
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <Quote className="h-8 w-8 text-orange-200" />
              </div>

              <p className="mt-5 text-base leading-8 text-slate-600">
                {testimonial.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
