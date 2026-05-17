import Image from "next/image";
import { FeaturedBusinesses } from "@/components/home/FeaturedBusinesses";
import { HeroActions } from "@/components/home/HeroActions";
import { HowItWorks } from "@/components/home/HowItWorks";
import { PopularProducts } from "@/components/home/PopularProducts";
import { PremiumFooter } from "@/components/home/PremiumFooter";
import { RecentActivity } from "@/components/home/RecentActivity";
import { ReviewRotator } from "@/components/home/ReviewRotator";
import { Testimonials } from "@/components/home/Testimonials";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0b0b]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,107,0,0.10),transparent_26%),linear-gradient(180deg,#0b0b0b_0%,#111111_38%,#151515_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[32rem] h-[32rem] bg-[radial-gradient(circle,rgba(255,255,255,0.035),transparent_62%)] blur-3xl" />
      <main className="relative z-10 pb-16">
        {/* HERO SECTION */}
        <section className="relative min-h-[calc(100dvh-4.5rem)] overflow-hidden">
          <Image
            src="/fondo.png"
            alt=""
            fill
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-black/76" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/74 to-black/48" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_28%,rgba(255,107,0,0.18),transparent_28%)]" />

          <div className="section-shell relative grid min-h-[calc(100dvh-4.5rem)] items-center gap-6 py-8 sm:gap-10 sm:py-16 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="max-w-3xl">
              <Badge className="mb-5 rounded-full border border-orange-500/30 bg-black/40 px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-orange-300 shadow-sm sm:mb-8 sm:px-6 sm:py-3 sm:text-sm sm:tracking-[0.15em]">
                Apoyando aliados locales
              </Badge>

              <h1 className="balanced-text max-w-3xl text-[clamp(2.25rem,7vw,4.8rem)] font-black leading-[1.02] tracking-normal text-white">
                Tu comida favorita,{" "}
                <span className="text-orange-600">al instante</span>
              </h1>

              <p className="balanced-text mt-4 max-w-xl text-sm leading-6 text-white/80 sm:mt-6 sm:text-lg sm:leading-8 md:text-2xl md:leading-9">
                Desde Mazamitla para sus alrededores: sabores hechos en casa,
                negocios con identidad local y entregas que se sienten cercanas
                desde el primer clic.
              </p>

              <HeroActions />
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-[1.75rem] bg-orange-500/12 blur-2xl sm:-inset-5 sm:rounded-[2rem]" />
              <div className="relative aspect-[1.2/1] overflow-hidden rounded-[1.75rem] border border-white/14 bg-black/32 shadow-[0_24px_55px_rgba(0,0,0,0.4)] ring-1 ring-white/10 sm:aspect-[1.55/1] sm:rounded-[2rem] sm:shadow-[0_28px_70px_rgba(0,0,0,0.46)]">
                <Image
                  src="/repartidor.png"
                  alt="Repartidor de Gogi Eats en bicicleta"
                  fill
                  className="object-cover object-center"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        <FeaturedBusinesses />

        {/* WHY CHOOSE US */}
        <section className="relative overflow-hidden bg-[linear-gradient(180deg,#111111_0%,#151515_100%)] px-4 py-8 sm:py-14">
          <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
            <div className="h-32 w-[min(66rem,90vw)] rounded-full bg-orange-500/8 blur-3xl" />
          </div>
          <div className="section-shell relative rounded-[26px] border border-orange-500/12 bg-[linear-gradient(180deg,rgba(21,21,21,0.98)_0%,rgba(11,11,11,0.98)_100%)] px-4 py-6 shadow-[0_28px_64px_rgba(0,0,0,0.42)] sm:rounded-[36px] sm:px-8 sm:py-12">
            <div className="mb-6 text-center sm:mb-10">
              <h2 className="font-serif text-2xl text-[#f5f5f5] sm:text-4xl">
                ¿Por qué elegir Gogi Eats?
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#b3b3b3] sm:mt-3 sm:text-lg sm:leading-7">
                La experiencia gourmet-local que conecta cocinas rurales con
                quienes las disfrutan
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3 md:gap-5">
              {/* Card 1 */}
              <Card className="rounded-[22px] border border-white/8 !bg-[linear-gradient(180deg,rgba(31,31,31,0.96)_0%,rgba(20,20,20,0.98)_100%)] py-0 shadow-[0_18px_38px_rgba(0,0,0,0.26)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-400/25 hover:shadow-[0_22px_46px_rgba(255,107,0,0.12)] sm:rounded-[28px]">
                <CardContent className="flex h-full flex-col items-center p-4 text-center sm:p-7">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/20 bg-orange-500/10 text-lg text-[#ff6b00] shadow-[0_10px_24px_rgba(255,107,0,0.10)] sm:mb-4 sm:h-16 sm:w-16 sm:text-2xl">
                    ⚡
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-[#f5f5f5] sm:text-xl">
                    Súper rápido
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#b3b3b3] sm:mt-3 sm:text-base sm:leading-8">
                    Aliados confirmando pedidos en minutos y rutas optimizadas
                    para tu zona.
                  </p>
                </CardContent>
              </Card>

              {/* Card 2 */}
              <Card className="rounded-[22px] border border-white/8 !bg-[linear-gradient(180deg,rgba(31,31,31,0.96)_0%,rgba(20,20,20,0.98)_100%)] py-0 shadow-[0_18px_38px_rgba(0,0,0,0.26)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-400/25 hover:shadow-[0_22px_46px_rgba(255,107,0,0.12)] sm:rounded-[28px]">
                <CardContent className="flex h-full flex-col items-center p-4 text-center sm:p-7">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/20 bg-orange-500/10 text-lg text-[#ff6b00] shadow-[0_10px_24px_rgba(255,107,0,0.10)] sm:mb-4 sm:h-16 sm:w-16 sm:text-2xl">
                    🍕
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-[#f5f5f5] sm:text-xl">
                    Variedad local
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#b3b3b3] sm:mt-3 sm:text-base sm:leading-8">
                    Cafeterías, panaderías y taquerías familiares reunidas en un
                    mismo lugar.
                  </p>
                </CardContent>
              </Card>

              {/* Card 3 */}
              <Card className="rounded-[22px] border border-white/8 !bg-[linear-gradient(180deg,rgba(31,31,31,0.96)_0%,rgba(20,20,20,0.98)_100%)] py-0 shadow-[0_18px_38px_rgba(0,0,0,0.26)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-400/25 hover:shadow-[0_22px_46px_rgba(255,107,0,0.12)] sm:rounded-[28px]">
                <CardContent className="flex h-full flex-col items-center p-4 text-center sm:p-7">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/20 bg-orange-500/10 text-lg text-[#ff6b00] shadow-[0_10px_24px_rgba(255,107,0,0.10)] sm:mb-4 sm:h-16 sm:w-16 sm:text-2xl">
                    💳
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-[#f5f5f5] sm:text-xl">
                    Pago seguro
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#b3b3b3] sm:mt-3 sm:text-base sm:leading-8">
                    Métodos de pago confiables y soporte cercano para aliados y
                    comensales.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <PopularProducts />
        <RecentActivity />
        <Testimonials />
        <HowItWorks />
        <section className="relative overflow-hidden bg-[linear-gradient(180deg,#101010_0%,#0b0b0b_100%)] px-4 py-8 sm:py-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
            <div className="h-28 w-[min(52rem,82vw)] rounded-full bg-orange-500/8 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-6xl">
            <ReviewRotator />
          </div>
        </section>
      </main>

      <PremiumFooter />
    </div>
  );
}
