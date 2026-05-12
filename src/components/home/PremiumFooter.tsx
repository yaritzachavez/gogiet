import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
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
    <footer className="relative overflow-hidden border-t border-[#f0dfd2] bg-gradient-to-b from-[#fff7f2] to-[#f7f7f7] px-4 pb-8 pt-10">
      <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
        <div className="select-none text-center text-[4.5rem] font-black uppercase tracking-[0.4em] text-slate-950/[0.03] blur-[1px] sm:text-[7rem] lg:text-[9rem]">
          GOGI EATS
        </div>
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8">
        <section className="relative overflow-hidden rounded-[32px] border border-white/20 bg-white/60 px-6 py-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
          <div className="absolute -right-10 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="absolute left-8 top-6 h-16 w-16 rounded-full bg-white/70 blur-2xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-500">
                Gogi Eats
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                ¿Listo para apoyar a los aliados locales?
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                Descubre una plataforma hecha para conectar negocios
                independientes, entregas cercanas y una experiencia moderna con
                identidad local.
              </p>
            </div>

            <div className="relative shrink-0">
              <div className="absolute inset-3 rounded-full bg-orange-500/25 blur-2xl" />
              <Button
                asChild
                size="lg"
                className="relative rounded-full px-8 shadow-[0_20px_40px_rgba(234,88,12,0.28)] transition-all duration-300 hover:-translate-y-0.5"
              >
                <Link href="/auth?mode=register">
                  Comenzar ahora
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[32px] border border-white/20 bg-white/60 px-6 py-8 shadow-[0_20px_60px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-orange-100 bg-white/80 px-4 py-2 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-sm font-black text-white shadow-[0_12px_24px_rgba(234,88,12,0.25)]">
                  G
                </div>
                <div>
                  <p className="text-sm font-black tracking-tight text-slate-950">
                    Gogi Eats
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-500">
                    Delivery local
                  </p>
                </div>
              </div>

              <p className="max-w-xs text-sm leading-7 text-slate-600">
                Plataforma local para descubrir comida, tiendas y aliados
                independientes con una experiencia simple, cálida y confiable.
              </p>

              <p className="text-sm font-semibold text-slate-500">
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
                    external={link.href.startsWith("http") || link.href.startsWith("mailto:")}
                  >
                    <Icon className="size-4 text-orange-500" />
                    <span>{link.label}</span>
                  </FooterLink>
                );
              })}
            </FooterColumn>
          </div>

          <div className="mt-8 border-t border-[#eee1d6] pt-5">
            <div className="flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <p>© 2026 Gogi Eats. Todos los derechos reservados.</p>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-100 bg-orange-50/80 px-3 py-1.5 text-[11px] font-semibold text-orange-700">
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
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-orange-500" />
        <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">
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
      className="inline-flex items-center gap-2 text-sm text-slate-600 transition duration-200 hover:translate-x-0.5 hover:text-orange-600"
    >
      {children}
    </Link>
  );
}
