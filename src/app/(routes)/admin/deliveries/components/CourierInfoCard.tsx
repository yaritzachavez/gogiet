"use client";

import { CourierRecord } from "@/types/Couriers"
import { CourierStatusBadge } from "./CourierStatusBadge";

interface CourierInfoCardProps {
  courier: CourierRecord;
}

export function CourierInfoCard({ courier }: CourierInfoCardProps) {
  return (
    <section className="grid gap-4 rounded-3xl border border-red-200/60 bg-white/95 p-6 shadow-lg dark:border-white/10 dark:bg-white/10 md:grid-cols-[1.3fr,1fr]">
      <div className="space-y-3 rounded-xl bg-red-50/60 p-5 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
        <h2 className="text-base font-semibold text-red-600">Contacto</h2>
        <dl className="space-y-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Teléfono
            </dt>
            <dd>{courier.telefono}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Correo
            </dt>
            <dd>{courier.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Incorporación
            </dt>
            <dd>
              {new Date(courier.inicioEnGogiEats).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href={`tel:${courier.telefono.replace(/\s+/g, "")}`}
            className="inline-flex items-center justify-center rounded-lg border border-red-200/60 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:border-white/20 dark:text-red-200 dark:hover:bg-white/10"
          >
            Llamar repartidor
          </a>
          <a
            href={`mailto:${courier.email}`}
            className="inline-flex items-center justify-center rounded-lg border border-red-200/60 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-red-100 dark:border-white/20 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            Enviar mensaje
          </a>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-red-200/60 bg-white/90 p-5 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="text-base font-semibold text-red-600">
          Vehículo & desempeño
        </h2>
        <dl className="grid grid-cols-1 gap-3 text-zinc-700 dark:text-zinc-200">
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Vehículo
            </dt>
            <dd>{courier.vehiculo}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Placas
            </dt>
            <dd>{courier.placas}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Calificación
            </dt>
            <dd>{courier.calificacion.toFixed(1)} / 5</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              T. promedio de entrega
            </dt>
            <dd>{courier.promedioEntrega}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Estado
            </dt>
            <dd>
              <CourierStatusBadge status={courier.estado} />
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
