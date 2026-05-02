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
    <Card className="overflow-hidden rounded-[26px] border border-white/20 bg-white/10 text-[#1f2d27] shadow-xl backdrop-blur-lg">
      <CardHeader className="border-b border-white/10 bg-gradient-to-r from-orange-400/30 via-orange-600/25 to-orange-900/25 pb-6 text-white">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-5 w-5" />
          Ganancias
        </CardTitle>
        <CardDescription className="text-sm text-white/80">
          Seguimiento rápido de tus ingresos diarios, propinas y avance semanal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-orange-200/60 bg-white/70 p-4 shadow-inner">
            <p className="text-xs uppercase tracking-[0.3em] text-orange-900/60">
              Hoy
            </p>
            <p className="mt-2 flex items-baseline gap-2 text-3xl font-semibold text-orange-700">
              {formatCurrency(earnings.today, earnings.currency)}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-orange-700">
              <TrendingUp className="h-3 w-3" />
              {comparisonLabel}
            </p>
          </div>

          <div className="rounded-2xl border border-white/30 bg-white/70 p-4 shadow-lg backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-orange-900/60">
              Propinas
            </p>
            <p className="mt-2 flex items-baseline gap-2 text-2xl font-semibold text-orange-900">
              {formatCurrency(earnings.tips, earnings.currency)}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-orange-800/70">
              <PiggyBank className="h-3 w-3 text-amber-500" />
              Acumulado semana
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-orange-800/70">
            <span>Semana actual</span>
            <span>
              {formatCurrency(earnings.weekToDate, earnings.currency)} /{" "}
              {formatCurrency(earnings.goal, earnings.currency)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full border border-white/30 bg-white/40 shadow-inner">
            <div
              className="h-full rounded-full bg-orange-500/90 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-orange-800/70">
            Objetivo semanal alcanzado al {progress}%.
          </p>
        </div>

        <Button
          type="button"
          onClick={onViewHistory}
          disabled={isHistoryLoading}
          className="w-full rounded-full border border-orange-500/60 bg-orange-500/80 text-sm font-semibold text-white shadow-lg backdrop-blur hover:bg-orange-500"
        >
          {isHistoryLoading ? "Cargando historial..." : "Ver historial"}
        </Button>
      </CardContent>
    </Card>
  );
}
