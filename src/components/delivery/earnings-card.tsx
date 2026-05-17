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
    <Card className="overflow-hidden rounded-[26px] border border-[#e4d5c5] bg-[#fffaf3] text-[#2b221a] shadow-xl shadow-[#d8c1a6]/15">
      <CardHeader className="border-b border-[#ead7c3] bg-[linear-gradient(135deg,#fff7ed_0%,#f8efe4_55%,#f4e7d7_100%)] pb-6 text-[#2f2419]">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-5 w-5" />
          Ganancias
        </CardTitle>
        <CardDescription className="text-sm text-[#6f5d4c]">
          Seguimiento rápido de tus ingresos diarios, propinas y avance semanal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#e8d8c6] bg-[#fffdf9] p-4 shadow-inner">
            <p className="text-xs uppercase tracking-[0.3em] text-[#8d755b]">
              Hoy
            </p>
            <p className="mt-2 flex items-baseline gap-2 text-3xl font-semibold text-[#b36a2b]">
              {formatCurrency(earnings.today, earnings.currency)}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-[#9a6d42]">
              <TrendingUp className="h-3 w-3" />
              {comparisonLabel}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e8d8c6] bg-[#fffdf9] p-4 shadow-lg backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-[#8d755b]">
              Propinas
            </p>
            <p className="mt-2 flex items-baseline gap-2 text-2xl font-semibold text-[#2f2419]">
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
          <div className="h-2 overflow-hidden rounded-full border border-[#e8d8c6] bg-[#f5ebde] shadow-inner">
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
          className="w-full rounded-full border border-[#d17d3b]/40 bg-[linear-gradient(135deg,#d36a1f_0%,#f08d3c_100%)] text-sm font-semibold text-white shadow-lg shadow-[#d97a37]/20 hover:opacity-95"
        >
          {isHistoryLoading ? "Cargando historial..." : "Ver historial"}
        </Button>
      </CardContent>
    </Card>
  );
}
