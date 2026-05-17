"use client";

import { Clock3, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";
import { EmptyState } from "@/components/ui/empty-state";

type ActivityItem = {
  id: string;
  type: string;
  message: string;
  businessName: string | null;
  createdAt: string | null;
};

type ActivityResponse = {
  success: boolean;
  activity?: ActivityItem[];
  error?: string;
  details?: string;
};

function relativeTime(value: string | null) {
  if (!value) {
    return "Hace un momento";
  }

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "Hace un momento";
  }

  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "Ahora mismo";
  }

  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `Hace ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return `Hace ${days} día${days === 1 ? "" : "s"}`;
}

export function RecentActivity() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadActivity() {
      try {
        const response = await fetch("/api/public/recent-activity", {
          cache: "no-store",
        });
        const payload: ActivityResponse = await response.json();

        if (!active) {
          return;
        }

        if (!payload.success) {
          setError(
            payload.details ??
              payload.error ??
              "No se pudo cargar la actividad reciente.",
          );
        } else {
          setError(null);
        }

        setActivity(payload.activity ?? []);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudo cargar la actividad reciente.",
        );
        setActivity([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadActivity();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0b0b0b_0%,#101010_100%)] px-4 py-8 sm:py-18">
      <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center">
        <div className="h-40 w-[min(72rem,92vw)] rounded-full bg-orange-500/6 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.86)_0%,rgba(12,12,12,0.9)_100%)] px-4 py-6 shadow-[0_25px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:rounded-[36px] sm:px-8 sm:py-10">
        <HomeSectionHeader
          eyebrow="Actividad reciente"
          title="La plataforma se siente en movimiento"
          description="Una vista ligera del ritmo de pedidos y publicaciones para transmitir confianza sin mostrar datos personales."
        />

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`activity-skeleton-${index + 1}`}
                className="rounded-[22px] border border-white/8 bg-white/4 p-4 sm:rounded-[26px] sm:p-5"
              >
                <div className="h-3.5 w-20 animate-pulse rounded-full bg-orange-500/18" />
                <div className="mt-3 h-4.5 w-4/5 animate-pulse rounded-full bg-white/8" />
                <div className="mt-2.5 h-3.5 w-1/3 animate-pulse rounded-full bg-white/6" />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && activity.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Aún no hay actividad visible"
            description={
              error ??
              "Cuando comiencen a registrarse pedidos y productos, aquí aparecerá movimiento real del ecosistema local."
            }
          />
        ) : null}

        {!loading && activity.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
            {activity.map((item) => (
              <article
                key={item.id}
                className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(32,32,32,0.96),rgba(22,22,22,0.96))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.24)] sm:rounded-[26px] sm:p-5"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/6 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-300 shadow-sm sm:px-3 sm:py-2 sm:text-xs sm:tracking-[0.18em]">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                  Actividad
                </div>
                <p className="mt-3 text-base font-semibold leading-6 text-[#f5f5f5] sm:mt-4 sm:text-lg sm:leading-8">
                  {item.message}
                </p>
                <p className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-[#8f8f8f] sm:mt-4 sm:text-sm">
                  <Clock3 className="h-3.5 w-3.5 text-orange-400 sm:h-4 sm:w-4" />
                  {relativeTime(item.createdAt)}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
