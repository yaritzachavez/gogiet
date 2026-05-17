"use client";

import { MessageSquareQuote, Quote, Star } from "lucide-react";
import { useEffect, useState } from "react";

import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";
import { EmptyState } from "@/components/ui/empty-state";

type Testimonial = {
  id: number;
  initials: string;
  name: string;
  text: string;
  title: string | null;
  rating: number;
  businessName: string | null;
  createdAt: string;
};

type TestimonialsResponse = {
  success: boolean;
  testimonials?: Testimonial[];
  error?: string;
  details?: string;
};

function TestimonialsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`testimonial-skeleton-${index + 1}`}
          className="rounded-[24px] border border-white/8 bg-[#1a1a1a] p-4 shadow-[0_22px_50px_rgba(0,0,0,0.28)] sm:rounded-[30px] sm:p-6"
        >
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="h-11 w-11 animate-pulse rounded-[18px] bg-orange-500/18 sm:h-14 sm:w-14 sm:rounded-2xl" />
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded-full bg-white/8 sm:h-5 sm:w-32" />
                <div className="h-3.5 w-20 animate-pulse rounded-full bg-orange-500/18 sm:h-4 sm:w-24" />
              </div>
            </div>
            <div className="h-7 w-7 animate-pulse rounded-full bg-white/8 sm:h-8 sm:w-8" />
          </div>
          <div className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
            <div className="h-3.5 w-full animate-pulse rounded-full bg-white/6 sm:h-4" />
            <div className="h-3.5 w-11/12 animate-pulse rounded-full bg-white/6 sm:h-4" />
            <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-white/6 sm:h-4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Testimonials() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadTestimonials() {
      try {
        const response = await fetch("/api/public/testimonials", {
          cache: "no-store",
        });
        const payload: TestimonialsResponse = await response.json();

        if (!active) {
          return;
        }

        if (!response.ok || !payload.success) {
          setError(
            payload.details ??
              payload.error ??
              "No se pudieron cargar las reseñas reales.",
          );
          setTestimonials([]);
          return;
        }

        setTestimonials(payload.testimonials ?? []);
        setError(null);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudieron cargar las reseñas reales.",
        );
        setTestimonials([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTestimonials();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0b0b0b_0%,#050505_100%)] px-4 py-8 sm:py-18">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        <div className="h-32 w-[min(64rem,88vw)] rounded-full bg-orange-500/[0.05] blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl">
        <HomeSectionHeader
          eyebrow="Testimonios"
          title="La experiencia se siente local, rápida y confiable"
          description="Reseñas reales compartidas por personas que ya probaron la experiencia de pedir con Gogi Eats."
        />

        {loading ? <TestimonialsSkeleton /> : null}

        {!loading && error ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="No pudimos cargar las reseñas por ahora"
            description={error}
          />
        ) : null}

        {!loading && !error && testimonials.length === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="Todavía no hay reseñas públicas"
            description="Cuando los primeros clientes compartan su experiencia real, aquí aparecerán automáticamente."
          />
        ) : null}

        {!loading && !error && testimonials.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
            {testimonials.map((testimonial) => (
              <article
                key={testimonial.id}
                className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(32,32,32,0.98)_0%,rgba(22,22,22,0.96)_100%)] p-4 shadow-[0_22px_50px_rgba(0,0,0,0.3)] sm:rounded-[30px] sm:p-6"
              >
                <div className="flex items-start justify-between gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-orange-500 text-sm font-black text-white shadow-lg shadow-orange-500/20 sm:h-14 sm:w-14 sm:rounded-2xl sm:text-lg">
                      {testimonial.initials}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-[#f5f5f5] sm:text-lg">
                        {testimonial.name}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-1 text-orange-500 sm:mt-2">
                        {Array.from({ length: testimonial.rating }).map(
                          (_, index) => (
                            <Star
                              key={`${testimonial.id}-star-${index + 1}`}
                              className="h-3.5 w-3.5 fill-current sm:h-4 sm:w-4"
                            />
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                  <Quote className="h-6 w-6 text-orange-500/35 sm:h-8 sm:w-8" />
                </div>

                {testimonial.title ? (
                  <p className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-orange-300 sm:mt-5 sm:text-sm sm:tracking-[0.14em]">
                    {testimonial.title}
                  </p>
                ) : null}

                <p className="mt-3 text-sm leading-6 text-[#b3b3b3] sm:mt-4 sm:text-base sm:leading-8">
                  {testimonial.text}
                </p>

                {testimonial.businessName ? (
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8f8f8f] sm:mt-4 sm:text-xs sm:tracking-[0.14em]">
                    Experiencia en {testimonial.businessName}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
