"use client";

import clsx from "clsx";
import Image from "next/image";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useParallax } from "@/hooks/useParallax";

interface HeroProps {
  title?: string;
  subtitle?: string;
  badgeText?: string;
  glass?: boolean;
  desktopSrc?: string;
  mobileSrc?: string;
  className?: string;
  enableParallax?: boolean;
}

export function Hero({
  title = "Tu comida favorita, al instante",
  subtitle = "Descubre negocios locales y recibe tu pedido en minutos.",
  badgeText = "Apoyando aliados locales",
  glass = false,
  desktopSrc = "/hero-bosque.jpg",
  mobileSrc = "/hero-bosque-mobile.jpg",
  className,
  enableParallax = true,
}: HeroProps) {
  const parallaxStyle = useParallax({ enabled: enableParallax });

  const content = (
    <div className="relative z-10 mx-auto max-w-xl px-5 pt-24 pb-12 text-white">
      {badgeText ? (
        <span className="inline-flex rounded-full border border-white/30 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-white/80 backdrop-blur">
          {badgeText}
        </span>
      ) : null}
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-white/85">{subtitle}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/shop"
          className="rounded-full bg-[#0F172A] px-5 py-3 text-white transition hover:opacity-90"
        >
          Ordenar ahora
        </Link>
        <Link
          href="/tiendas"
          className="rounded-full border border-white/40 bg-white/10 px-5 py-3 text-white/90 backdrop-blur transition hover:bg-white/15"
        >
          Ver tiendas →
        </Link>
      </div>
    </div>
  );

  return (
    <section
      className={clsx(
        "relative min-h-[88vh] overflow-hidden text-white",
        className,
      )}
    >
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 hidden md:block"
          aria-hidden="true"
          style={parallaxStyle}
        >
          <Image
            src={desktopSrc}
            alt=""
            fill
            priority
            className="object-cover object-center"
          />
        </div>
        <div className="absolute inset-0 md:hidden" aria-hidden="true">
          <Image
            src={mobileSrc}
            alt=""
            fill
            priority
            className="object-cover object-[50%_40%] scale-105"
          />
        </div>
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.35)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/20 to-transparent" />
        <div className="absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 50% at 50% 40%, transparent, rgba(0,0,0,0.45))",
          }}
        />
      </div>
      <div className="relative z-10 flex min-h-[88vh] items-end">
        {glass ? (
          <div className="w-full px-5 pb-10">
            <div className="rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur-md">
              {content}
            </div>
          </div>
        ) : (
          content
        )}
      </div>
    </section>
  );
}

/**
 * Example usage:
 * <Hero glass badgeText="Cliente feliz en Tonalá" desktopSrc="/hero-bosque.jpg" />
 */
export default Hero;
