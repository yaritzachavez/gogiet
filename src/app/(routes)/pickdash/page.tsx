"use client";

import {
  type LucideIcon,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchWithSession } from "@/lib/client-auth";
import { canAccessPanel, normalizePanelRoles } from "@/lib/panel-access";

type PanelRole = "delivery" | "seller" | "business" | "admin";

interface AccessFlags {
  admin?: boolean;
  businessOwner?: boolean;
  businessManager?: boolean;
  customer?: boolean;
  delivery?: boolean;
}

interface AccessCenterResponse {
  success?: boolean;
  access?: Array<{ key: string; title: string; href: string }>;
  accessFlags?: AccessFlags;
}

type RoleCard = {
  panel: PanelRole;
  title: string;
  description: string;
  href: string;
  icon?: LucideIcon;
  accent?: string;
  chipLabel?: string;
  iconShell?: string;
  textClass: string;
  mutedTextClass: string;
  chipClass: string;
  lineClass: string;
  footerClass: string;
  openBadgeClass: string;
};

const CARDS: RoleCard[] = [
  {
    panel: "delivery",
    title: "Zona de Delivery",
    description: "Logística y seguimiento de pedidos",
    href: "/delivery",
    icon: Truck,
    accent: "bg-[linear-gradient(145deg,#6e7f52_0%,#f6ebdd_100%)]",
    chipLabel: "Repartidores",
    iconShell:
      "border-[rgba(255,255,253,0.35)] bg-[rgba(255,255,253,0.22)] text-[#fffffd] shadow-[0_20px_50px_-20px_rgba(110,127,82,0.75)]",
    textClass: "text-[#fffffd]",
    mutedTextClass: "text-[#fffffd]/85",
    chipClass:
      "border border-[rgba(255,255,253,0.35)] bg-[rgba(255,255,253,0.22)] text-[#fffffd]",
    lineClass: "bg-[#fffffd]/80",
    footerClass: "text-[#fffffd]/95",
    openBadgeClass: "border-[rgba(255,255,253,0.55)] text-[#fffffd]",
  },
  {
    panel: "business",
    title: "Panel de negocio",
    description: "Operación integral del negocio",
    href: "/business",
    icon: Store,
    accent: "bg-[linear-gradient(145deg,#f6ebdd_0%,#6e7f52_100%)]",
    chipLabel: "Administrador del negocio",
    iconShell:
      "border-[rgba(255,255,253,0.35)] bg-[rgba(255,255,253,0.22)] text-[#6e7f52] shadow-[0_20px_50px_-20px_rgba(110,127,82,0.65)]",
    textClass: "text-[#222222]",
    mutedTextClass: "text-[#222222]/75",
    chipClass:
      "border border-[rgba(255,255,253,0.35)] bg-[rgba(255,255,253,0.22)] text-[#222222]",
    lineClass: "bg-[#6e7f52]/70",
    footerClass: "text-[#222222]/90",
    openBadgeClass: "border-[#222222]/25 text-[#222222]",
  },
  {
    panel: "seller",
    title: "Panel de Vendedor",
    description: "Gestión de catálogo y promociones",
    href: "/pickdash/seller",
    icon: ShoppingCart,
    accent: "bg-[linear-gradient(145deg,#e98a4a_0%,#f6ebdd_100%)]",
    chipLabel: "Vendedores",
    iconShell:
      "border-[rgba(255,255,253,0.35)] bg-[rgba(255,255,253,0.22)] text-[#e98a4a] shadow-[0_20px_50px_-20px_rgba(233,138,74,0.75)]",
    textClass: "text-[#222222]",
    mutedTextClass: "text-[#222222]/75",
    chipClass:
      "border border-[rgba(255,255,253,0.35)] bg-[rgba(255,255,253,0.22)] text-[#222222]",
    lineClass: "bg-[#e98a4a]/70",
    footerClass: "text-[#222222]/90",
    openBadgeClass: "border-[#222222]/25 text-[#222222]",
  },
  {
    panel: "admin",
    title: "Panel Admin",
    description: "Supervisión de usuarios y ajustes",
    href: "/admin",
    accent: "bg-[linear-gradient(145deg,#e98a4a_0%,#6e7f52_100%)]",
    chipLabel: "Administradores de la web",
    icon: ShieldCheck,
    iconShell:
      "border-[rgba(255,255,253,0.35)] bg-[rgba(255,255,253,0.22)] text-[#fffffd] shadow-[0_20px_50px_-20px_rgba(233,138,74,0.7)]",
    textClass: "text-[#fffffd]",
    mutedTextClass: "text-[#fffffd]/85",
    chipClass:
      "border border-[rgba(255,255,253,0.35)] bg-[rgba(255,255,253,0.22)] text-[#fffffd]",
    lineClass: "bg-[#fffffd]/80",
    footerClass: "text-[#fffffd]/95",
    openBadgeClass: "border-[rgba(255,255,253,0.55)] text-[#fffffd]",
  },
];

export default function RoleMenu() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [accessItems, setAccessItems] = useState<
    Array<{ key: string; title: string; href: string }>
  >([]);
  const [_accessLoading, setAccessLoading] = useState(true);

  const roles = useMemo(() => normalizePanelRoles(user?.roles), [user?.roles]);

  useEffect(() => {
    if (!user) {
      setAccessLoading(false);
      return;
    }

    async function fetchAccessCenter() {
      try {
        const response = await fetchWithSession("/api/auth/access-center");

        const responseText = await response.text();
        let payload: AccessCenterResponse = {};

        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch {
          payload = {};
        }

        if (!response.ok || payload.success === false) {
          setAccessItems([]);
          return;
        }

        setAccessItems(payload.access ?? []);

        if (
          payload.accessFlags?.customer &&
          !payload.accessFlags?.admin &&
          !payload.accessFlags?.businessOwner &&
          !payload.accessFlags?.businessManager &&
          !payload.accessFlags?.delivery
        ) {
          router.push("/");
        }
      } catch (error) {
        console.error("Error:", error);
        setAccessItems([]);
      } finally {
        setAccessLoading(false);
      }
    }

    fetchAccessCenter();
  }, [router, user]); // <--- AQUÍ SE CIERRA EL USEEFFECT

  const visibleCards = useMemo(() => {
    if (accessItems.length > 0) {
      const allowedHrefs = new Set(accessItems.map((item) => item.href));
      return CARDS.filter(
        (card) =>
          allowedHrefs.has(card.href) && canAccessPanel(roles, card.panel),
      );
    }
    return CARDS.filter((card) => canAccessPanel(roles, card.panel));
  }, [accessItems, roles]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-content-center bg-neutral-950 text-white">
        <p className="px-8 py-6 text-center text-lg bg-white/5 border border-white/20 rounded-2xl shadow-xl">
          Validando sesión...
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-content-center bg-neutral-950 text-white">
        <p className="px-8 py-6 text-lg text-center bg-white/5 border border-white/20 rounded-2xl shadow-xl">
          Inicia sesión para continuar.
        </p>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-center bg-cover bg-fixed"
      style={{ backgroundImage: "url('/fondo.png')" }}
    >
      <div className="min-h-screen bg-[linear-gradient(180deg,rgba(0,0,0,0.86)_0%,rgba(0,0,0,0.74)_45%,rgba(0,0,0,0.92)_100%)]">
        <section className="flex flex-col justify-center gap-8 px-4 py-10 mx-auto min-h-screen max-w-7xl sm:gap-10 sm:px-6 lg:px-10">
          {/* Header y Grid de Cards... */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {visibleCards.map((card) => (
              <Card key={card.panel} {...card} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
} // <--- ESTA LLAVE CIERRA EL COMPONENTE RoleMenu

function Card({
  title,
  description,
  href,
  icon: Icon,
  accent,
  chipLabel = "Acceso rápido",
  iconShell,
  textClass,
  mutedTextClass,
  chipClass,
  lineClass,
  footerClass,
  openBadgeClass,
}: RoleCard) {
  return (
    <Link
      href={href}
      className="group relative block h-[360px] overflow-hidden rounded-[28px] border border-white/30 bg-white/5 shadow-2xl transition-transform duration-300 ease-out hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 sm:h-[380px] lg:h-[420px]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,253,0.24),transparent_42%)]" />
      {accent ? (
        <div className={`pointer-events-none absolute inset-0 ${accent}`} />
      ) : null}
      <div className="pointer-events-none absolute inset-x-10 top-10 h-24 rounded-full bg-[#fffffd]/12 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 top-20 h-40 w-40 rounded-full border border-[#fffffd]/20 bg-[#fffffd]/10" />
      <div className="pointer-events-none absolute -left-8 bottom-24 h-24 w-24 rounded-full border border-[#fffffd]/20 bg-[#fffffd]/10" />
      <div
        className={`relative flex h-full flex-col justify-between gap-5 p-5 sm:p-6 ${textClass}`}
      >
        <div className="flex flex-col items-center space-y-4 text-center">
          <span
            className={`inline-flex max-w-full items-center justify-center gap-2 rounded-full px-3 py-1 text-center text-[9px] font-semibold uppercase leading-5 tracking-[0.16em] backdrop-blur-sm xl:text-[10px] ${chipClass}`}
          >
            {chipLabel}
          </span>

          {Icon ? (
            <div className="flex justify-center pt-1">
              <div
                className={`inline-flex h-20 w-20 items-center justify-center rounded-[26px] border backdrop-blur-sm ${iconShell ?? "border-white/30 bg-white/10 text-white"}`}
              >
                <Icon className="h-9 w-9" strokeWidth={2.1} />
              </div>
            </div>
          ) : null}

          <div className="space-y-2 text-center">
            <h2 className="text-xl font-black leading-tight sm:text-2xl lg:text-xl xl:text-[1.75rem]">
              {title}
            </h2>
            <p
              className={`mx-auto max-w-[16rem] text-sm leading-6 sm:text-base ${mutedTextClass}`}
            >
              {description}
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <span className={`h-1.5 w-10 rounded-full ${lineClass}`} />
              <span
                className={`h-1.5 w-3 rounded-full ${lineClass} opacity-45`}
              />
            </div>
          </div>
        </div>
        <div
          className={`flex w-full items-center justify-between text-sm font-semibold ${footerClass}`}
        >
          <span className="inline-flex items-center gap-2">
            Entrar
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${openBadgeClass}`}
          >
            Abrir
          </span>
        </div>
      </div>
    </Link>
  );
}
