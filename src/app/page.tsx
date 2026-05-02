import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewRotator } from "@/components/home/ReviewRotator";
import { HeroActions } from "@/components/home/HeroActions";
import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-white">

      <main className="relative z-10 pb-16">

        {/* HERO SECTION */}
        <section className="relative min-h-[calc(100vh-5rem)] overflow-hidden">
          <Image
            src="/fondo.png"
            alt=""
            fill
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-white/78" />
          <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/78 to-white/45" />

          <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:px-10 xl:px-4">
            <div className="max-w-3xl">
              <Badge className="mb-8 rounded-full border border-orange-100 bg-orange-50 px-6 py-3 text-sm font-extrabold uppercase tracking-[0.15em] text-orange-700 shadow-sm">
                Apoyando aliados locales
              </Badge>

              <h1 className="max-w-3xl text-5xl font-black leading-[1.05] tracking-normal text-slate-950 sm:text-6xl lg:text-7xl">
                Tu comida favorita,{" "}
                <span className="text-orange-600">al instantes</span>
              </h1>

              <p className="mt-7 max-w-2xl text-xl leading-9 text-slate-600 md:text-2xl">
                Apoyando a los primeros aliados de zonas rurales y rancherías
                cercanas, sabores hechos en casa, entregados con calidez de
                comunidad y puntualidad moderna.
              </p>

              <HeroActions />

            </div>

            <div className="relative">
              <div className="absolute -inset-5 rounded-[2rem] bg-orange-500/10 blur-2xl" />
              <div className="relative aspect-[1.55/1] overflow-hidden rounded-[2rem] border border-white/70 bg-white/40 shadow-2xl shadow-orange-900/10 ring-1 ring-orange-100">
                <Image
                  src="/repartidor.png"
                  alt="Repartidor de Gogi Eats en bicicleta"
                  fill
                  className="object-cover object-center"
                  priority
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <ReviewRotator />
            </div>
          </div>
        </section>

        {/* WHY CHOOSE US */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-6xl rounded-[36px] border border-white/15 bg-white/90 px-6 py-12 shadow-[0_25px_60px_rgba(0,0,0,0.25)] backdrop-blur">

            <div className="mb-12 text-center">
              <h2 className="font-serif text-4xl text-[#3E2F28]">
                ¿Por qué elegir Gogi Eats?
              </h2>
              <p className="mt-3 text-lg text-[#5F5148]">
                La experiencia gourmet-local que conecta cocinas rurales con quienes las disfrutan
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3 md:gap-8">

              {/* Card 1 */}
              <Card className="rounded-[28px] border-[#E2D9D0] bg-white/90 shadow-[0_20px_45px_rgba(0,0,0,0.08)]">
                <CardContent className="p-5 text-center sm:p-8">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F3ECE4] text-xl sm:mb-4 sm:h-16 sm:w-16 sm:text-2xl">
                    ⚡
                  </div>
                  <h3 className="text-lg font-semibold text-[#3E2F28] sm:text-xl">
                    Súper rápido
                  </h3>
                  <p className="mt-2 text-sm text-[#5F5148] sm:mt-3 sm:text-base">
                    Aliados confirmando pedidos en minutos y rutas optimizadas para tu zona.
                  </p>
                </CardContent>
              </Card>

              {/* Card 2 */}
              <Card className="rounded-[28px] border-[#E2D9D0] bg-white/90 shadow-[0_20px_45px_rgba(0,0,0,0.08)]">
                <CardContent className="p-5 text-center sm:p-8">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F3ECE4] text-xl sm:mb-4 sm:h-16 sm:w-16 sm:text-2xl">
                    🍕
                  </div>
                  <h3 className="text-lg font-semibold text-[#3E2F28] sm:text-xl">
                    Variedad local
                  </h3>
                  <p className="mt-2 text-sm text-[#5F5148] sm:mt-3 sm:text-base">
                    Cafeterías, panaderías y taquerías familiares reunidas en un mismo lugar.
                  </p>
                </CardContent>
              </Card>

              {/* Card 3 */}
              <Card className="rounded-[28px] border-[#E2D9D0] bg-white/90 shadow-[0_20px_45px_rgba(0,0,0,0.08)]">
                <CardContent className="p-5 text-center sm:p-8">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F3ECE4] text-xl sm:mb-4 sm:h-16 sm:w-16 sm:text-2xl">
                    💳
                  </div>
                  <h3 className="text-lg font-semibold text-[#3E2F28] sm:text-xl">
                    Pago seguro
                  </h3>
                  <p className="mt-2 text-sm text-[#5F5148] sm:mt-3 sm:text-base">
                    Métodos de pago confiables y soporte cercano para aliados y comensales.
                  </p>
                </CardContent>
              </Card>

            </div>

          </div>
        </section>

        {/* CALL TO ACTION */}
        <section className="container mx-auto px-4 py-20 text-center">
          <div className="mx-auto max-w-3xl rounded-[36px] border border-[#E2D9D0] bg-[#F8F5F0] px-6 py-12 shadow-[0_25px_55px_rgba(0,0,0,0.1)]">

            <h2 className="font-serif text-4xl text-[#3E2F28]">
              ¿Listo para apoyar a los aliados locales?
            </h2>

            <p className="mt-3 text-lg text-[#5F5148]">
              Únete a la comunidad Gogi Eats y descubre el sabor artesanal que tenemos cerca de casa.
            </p>

            <Link href="/auth?mode=register">
              <Button className="mt-8 rounded-full bg-orange-600 px-10 py-3 text-base text-white hover:bg-orange-700">
                Comenzar ahora
              </Button>
            </Link>

          </div>
        </section>

      </main>

    </div>
  );
}
