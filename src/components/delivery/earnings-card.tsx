import { PiggyBank, TrendingUp, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { DeliveryEarnings } from "./types";

interface EarningsCardProps {
  earnings: DeliveryEarnings;
  isHistoryLoading?: boolean;
  onViewHistory?: () => void;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatCurrency(amount: number, currency: string) {
  if (!formatterCache.has(currency)) {
    formatterCache.set(
      currency,
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    );
  }

  const formatter =
    formatterCache.get(currency) ??
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });

  return formatter.format(amount);
}

export function EarningsCard({
  earnings,
  isHistoryLoading = false,
  onViewHistory,
}: EarningsCardProps) {
  const progress = Math.min(
    100,
    Math.round(
      earnings.goal > 0
        ? (earnings.weekToDate / earnings.goal) * 100
        : (earnings.percentageToGoal ?? 0),
    ),
  );
  const comparisonToYesterday = Math.round(earnings.comparisonToYesterday ?? 0);
  const comparisonLabel =
    comparisonToYesterday >= 0
      ? `+${comparisonToYesterday}% vs ayer`
      : `${comparisonToYesterday}% vs ayer`;

  return (
    <Card
      className="gap-0 overflow-hidden rounded-[24px] border border-[#E7D8C7] !bg-[#FFF9F2] py-0 text-[#4B3425] shadow-[0_8px_30px_rgba(180,140,90,0.08)]"
      style={{ background: "#FFF9F2", gap: 0, paddingBlock: 0 }}
    >
      <CardHeader className="border-b border-[#D8C2AA]/70 bg-[#FFF9F2] pb-5 text-[#4B3425] sm:pb-6">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-5 w-5" />
          Ganancias
        </CardTitle>
        <CardDescription className="text-sm text-[#6f5d4c]">
          Seguimiento rápido de tus ingresos diarios, propinas y avance semanal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 bg-[#F6F0E7] pt-5 sm:pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] p-4 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#8d755b]">
              Hoy
            </p>
            <p className="mt-2 break-words text-[clamp(1.8rem,1.3rem+2vw,3rem)] font-semibold text-[#b36a2b]">
              {formatCurrency(earnings.today, earnings.currency)}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-[#9a6d42]">
              <TrendingUp className="h-3 w-3" />
              {comparisonLabel}
            </p>
          </div>

          <div className="rounded-2xl border border-[#E7D8C7] bg-[#FFF9F2] p-4 shadow-[0_8px_30px_rgba(180,140,90,0.08)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#8d755b]">
              Propinas
            </p>
            <p className="mt-2 break-words text-[clamp(1.45rem,1.1rem+1.4vw,2.1rem)] font-semibold text-[#2f2419]">
              {formatCurrency(earnings.tips, earnings.currency)}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-[#6f5d4c]">
              <PiggyBank className="h-3 w-3 text-[#d08b48]" />
              Acumulado semana
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[#6f5d4c]">
            <span>Semana actual</span>
            <span>
              {earnings.goal > 0
                ? `${formatCurrency(earnings.weekToDate, earnings.currency)} / ${formatCurrency(earnings.goal, earnings.currency)}`
                : `${formatCurrency(earnings.weekToDate, earnings.currency)} · sin meta configurada`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full border border-[#D8C2AA]/70 bg-[#FFF9F2]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#d36a1f_0%,#f0a35a_100%)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-[#6f5d4c]">
            {earnings.goal > 0
              ? `Objetivo semanal alcanzado al ${progress}%.`
              : "Tus ganancias semanales se muestran con datos reales, sin metas falsas."}
          </p>
        </div>

        <Button
          type="button"
          onClick={onViewHistory}
          disabled={isHistoryLoading}
          className="w-full rounded-full border border-[#d17d3b]/30 bg-[linear-gradient(135deg,#d36a1f_0%,#f08d3c_100%)] text-sm font-semibold text-[#FFFDF8] shadow-[0_8px_24px_rgba(217,122,55,0.18)] hover:opacity-95"
        >
          {isHistoryLoading ? "Cargando historial..." : "Ver historial"}
        </Button>
      </CardContent>
    </Card>
  );
}
