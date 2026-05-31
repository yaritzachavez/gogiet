import { AlarmClock, CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { DeliverySchedule } from "./types";

interface ScheduleCardProps {
  schedule: DeliverySchedule;
}

export function ScheduleCard({ schedule }: ScheduleCardProps) {
  return (
    <Card className="overflow-hidden rounded-[26px] border border-[#E8DCCB] bg-[#FFF9F2] text-[#3B2D25] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <CardHeader className="border-b border-[#E8DCCB] bg-[#F8F1E7] pb-6 text-[#3B2D25]">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-5 w-5" />
          Horario
        </CardTitle>
        <CardDescription className="text-sm text-[#6F5D4C]">
          Mantén el control de tu turno y de los puntos de check-in programados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-900/60">
            Turno
          </p>
          <p className="text-sm font-semibold text-orange-900">
            {schedule.shiftLabel}
          </p>
          <Badge
            variant="outline"
            className="rounded-full border border-orange-200/70 bg-orange-50/60 text-xs text-orange-700"
          >
            {schedule.shiftWindow}
          </Badge>
        </div>

        <div className="grid gap-4 rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.025)] md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-900/60">
              Inicio
            </p>
            <p className="mt-1 text-sm font-semibold text-orange-900">
              {schedule.startTime ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-900/60">
              Fin
            </p>
            <p className="mt-1 text-sm font-semibold text-orange-900">
              {schedule.endTime ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-900/60">
              Horas trabajadas
            </p>
            <p className="mt-1 text-sm font-semibold text-orange-900">
              {schedule.hoursWorked ?? "—"}
            </p>
          </div>
        </div>

        {schedule.breakWindow ? (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-orange-900/60">
              Pausa sugerida
            </p>
            <p className="text-sm text-orange-800/80">{schedule.breakWindow}</p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-[#E8DCCB] bg-[#FFFDF9] p-4 shadow-[0_8px_22px_rgba(0,0,0,0.03)]">
          <div className="flex items-start gap-3">
            <AlarmClock className="mt-0.5 h-4 w-4 text-orange-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-orange-900/60">
                Próximo check-in
              </p>
              <p className="mt-2 text-sm font-semibold text-orange-900">
                {schedule.nextCheckIn}
              </p>
              <p className="mt-1 text-xs text-orange-800/70">
                Cobertura actual: {schedule.coverageZone}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
