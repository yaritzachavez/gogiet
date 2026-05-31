import {
  ArrowRight,
  Building2,
  FileText,
  Instagram,
  Mail,
  MessageCircle,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

import { Button } from "@/components/ui/button";

const navigationLinks = [
  { label: "Inicio", href: "/" },
  { label: "Restaurantes", href: "/shop" },
  { label: "Tiendas", href: "/shop" },
  { label: "Repartidores", href: "/reglamentos/repartidores" },
];

const legalLinks = [
  { label: "Términos", href: "/terminos" },
  { label: "Privacidad", href: "/privacidad" },
  { label: "Reglamentos", href: "/reglamentos" },
];

const contactLinks = [
  {
    label: "soporte@gogieats.shop",
    href: "mailto:soporte@gogieats.shop",
    icon: Mail,
  },
  {
    label: "WhatsApp",
    href: "https://wa.me/523312726618",
    icon: MessageCircle,
  },
  {
    label: "Instagram",
    href: "https://instagram.com/gogieats2305",
    icon: Instagram,
  },
];

export function PremiumFooter() {
  return (
    <footer className="relative overflow-hidden bg-[linear-gradient(180deg,#111111_0%,#0b0b0b_56%,#090909_100%)] px-4 pb-6 pt-8 sm:pt-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,107,0,0.08),transparent_24%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center">
        <div className="select-none text-center text-[4rem] font-black uppercase tracking-[0.34em] text-white/[0.035] blur-[1px] sm:text-[6rem] lg:text-[7.5rem]">
          GOGI EATS
        </div>
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-5">
        <section className="relative overflow-hidden rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(24,24,24,0.94)_0%,rgba(12,12,12,0.96)_100%)] px-6 py-7 shadow-[0_24px_56px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:px-8 sm:py-8 lg:px-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/35 to-transparent" />
          <div className="absolute -right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-orange-500/16 blur-3xl" />
          <div className="absolute left-8 top-6 h-16 w-16 rounded-full bg-white/8 blur-2xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-300">
                Gogi Eats
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#f5f5f5] sm:text-[2.2rem]">
                ¿Listo para apoyar a los aliados locales?
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#b3b3b3] sm:text-base">
                Descubre una plataforma hecha para conectar negocios
                independientes, entregas cercanas y una experiencia moderna con
                identidad local.
              </p>
            </div>

            <div className="relative shrink-0 self-start lg:self-center">
              <div className="absolute inset-2 rounded-full bg-orange-500/16 blur-2xl" />
              <Button
                asChild
                size="lg"
                className="relative rounded-full px-8 shadow-[0_16px_34px_rgba(234,88,12,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(234,88,12,0.22)]"
              >
                <Link href="/auth?mode=register">
                  Comenzar ahora
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,20,0.94)_0%,rgba(10,10,10,0.98)_100%)] px-6 py-6 shadow-[0_22px_50px_rgba(0,0,0,0.30)] backdrop-blur-xl sm:px-8 sm:py-7 lg:px-10">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-[1.2fr_0.9fr_0.9fr_1fr]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 px-0 py-2">
                <div className="relative h-12 w-[8rem]">
                  <Image
                    src="/7.png"
                    alt="Gogi Eats"
                    fill
                    className="object-contain drop-shadow-[0_12px_24px_rgba(234,88,12,0.18)]"
                  />
                </div>
                <div>
                  <p className="text-sm font-black tracking-tight text-[#f5f5f5]">
                    Gogi Eats
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300">
                    Delivery local
                  </p>
                </div>
              </div>

              <p className="max-w-xs text-sm leading-7 text-[#b3b3b3]">
                Plataforma local para descubrir comida, tiendas y aliados
                independientes con una experiencia simple, cálida y confiable.
              </p>

              <p className="text-sm font-semibold text-[#8f8f8f]">
                Hecho en México 🇲🇽
              </p>
            </div>

            <FooterColumn title="Navegación">
              {navigationLinks.map((link) => (
                <FooterLink key={`${link.label}-${link.href}`} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </FooterColumn>

            <FooterColumn title="Legal">
              {legalLinks.map((link) => (
                <FooterLink key={`${link.label}-${link.href}`} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </FooterColumn>

            <FooterColumn title="Contacto">
              {contactLinks.map((link) => {
                const Icon = link.icon;

                return (
                  <FooterLink
                    key={link.href}
                    href={link.href}
                    external={
                      link.href.startsWith("http") ||
                      link.href.startsWith("mailto:")
                    }
                  >
                    <Icon className="size-4 text-orange-500" />
                    <span>{link.label}</span>
                  </FooterLink>
                );
              })}
            </FooterColumn>
          </div>

          <div className="mt-6 border-t border-white/8 pt-4">
            <div className="flex flex-col gap-3 text-xs text-[#8f8f8f] sm:flex-row sm:items-center sm:justify-between">
              <p>© 2026 Gogi Eats. Todos los derechos reservados.</p>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-[11px] font-semibold text-orange-300 shadow-[0_8px_20px_rgba(255,107,0,0.08)]">
                <ShieldCheck className="size-3.5" />
                Plataforma local para aliados independientes.
              </div>
            </div>
          </div>
        </section>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const iconMap: Record<string, ComponentType<{ className?: string }>> = {
    Navegación: Store,
    Legal: FileText,
    Contacto: Building2,
  };

  const Icon = iconMap[title] ?? Truck;

  return (
    <div className="space-y-3">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-orange-400" />
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#8f8f8f]">
          {title}
        </p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="inline-flex items-center gap-2 text-sm text-[#b3b3b3] transition-all duration-300 hover:translate-x-0.5 hover:text-[#ff7f26]"
    >
      {children}
    </Link>
  );
}
