"use client";

import { useEffect, useState } from "react";

type StatConfig = {
  key: string;
  icon: string;
  label: string;
  suffix?: string;
  target: number;
};

const STATS: StatConfig[] = [
  {
    key: "restaurants",
    icon: "🍴",
    label: "negocios locales y creciendo",
    suffix: "+",
    target: 36,
  },
  {
    key: "orders",
    icon: "⏱️",
    label: "pedidos preparados con cariño hoy",
    target: 124,
  },
  {
    key: "reviews",
    icon: "💬",
    label: "reseñas de clientes locales",
    suffix: "+",
    target: 482,
  },
  {
    key: "rating",
    icon: "⭐",
    label: "valoración promedio",
    target: 4.9,
  },
];

const formatValue = (value: number, key: string) => {
  if (key === "rating") {
    return value.toFixed(1);
  }
  return Math.round(value).toLocaleString("es-MX");
};

export function HeroStats() {
  const [values, setValues] = useState(() => STATS.map(() => 0));

  useEffect(() => {
    const durations = STATS.map((stat) => (stat.key === "rating" ? 800 : 1400));
    const increments = STATS.map((stat, index) => {
      const steps = Math.max(20, durations[index] / 35);
      return stat.target / steps;
    });

    const interval = window.setInterval(() => {
      setValues((prev) =>
        prev.map((current, idx) => {
          const next = current + increments[idx];
          const target = STATS[idx].target;
          if (next >= target) {
            return target;
          }
          return next;
        }),
      );
    }, 50);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-6 text-center text-[#3E2F28]">
      {STATS.map((stat, index) => (
        <div
          key={stat.key}
          className="w-full min-w-[150px] flex-1 rounded-[24px] border border-white/30 bg-white/10 px-5 py-4 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.35)] sm:w-auto"
        >
          <div className="text-3xl">{stat.icon}</div>
          <p className="mt-2 text-2xl font-semibold">
            {formatValue(values[index], stat.key)}
            {values[index] >= stat.target && stat.suffix ? stat.suffix : ""}
          </p>
          <p className="text-sm text-white/80">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

export default HeroStats;
