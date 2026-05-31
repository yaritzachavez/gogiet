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
    <Card
      className="gap-0 overflow-hidden rounded-[24px] border border-[#E7D8C7] !bg-[#FFF9F2] py-0 text-[#4B3425] shadow-[0_8px_30px_rgba(180,140,90,0.08)]"
      style={{ background: "#FFF9F2", gap: 0, paddingBlock: 0 }}
    >
      <CardHeader className="border-b border-[#D8C2AA]/70 bg-[#FFF9F2] pb-6 text-[#4B3425]">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-5 w-5" />
          Horario
        </CardTitle>
        <CardDescription className="text-sm text-[#6F5D4C]">
          Mantén el control de tu turno y de los puntos de check-in programados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 bg-[#F6F0E7] pt-6">
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

        <div className="grid gap-4 rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] p-4 shadow-[0_8px_30px_rgba(180,140,90,0.08)] md:grid-cols-3">
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

        <div className="rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] p-4 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
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
