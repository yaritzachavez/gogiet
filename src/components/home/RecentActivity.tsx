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
    <section className="px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl rounded-[36px] border border-orange-100 bg-white px-6 py-8 shadow-[0_25px_60px_rgba(15,23,42,0.08)] sm:px-8 sm:py-10">
        <HomeSectionHeader
          eyebrow="Actividad reciente"
          title="La plataforma se siente en movimiento"
          description="Una vista ligera del ritmo de pedidos y publicaciones para transmitir confianza sin mostrar datos personales."
        />

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`activity-skeleton-${index + 1}`}
                className="rounded-[26px] border border-slate-200 bg-slate-50/70 p-5"
              >
                <div className="h-4 w-20 animate-pulse rounded-full bg-orange-100" />
                <div className="mt-4 h-5 w-4/5 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-3 h-4 w-1/3 animate-pulse rounded-full bg-slate-100" />
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activity.map((item) => (
              <article
                key={item.id}
                className="rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,_rgba(255,247,237,0.55),_rgba(255,255,255,1))] p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)]"
              >
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-600 shadow-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                  Actividad
                </div>
                <p className="mt-4 text-lg font-semibold leading-8 text-slate-900">
                  {item.message}
                </p>
                <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Clock3 className="h-4 w-4 text-orange-500" />
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
