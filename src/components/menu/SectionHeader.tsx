"use client";

import clsx from "clsx";
import { useScrollFadeIn } from "@/hooks/useScrollFadeIn";
import type { SectionTheme } from "./sectionThemes";

type SectionHeaderProps = {
  title: string;
  description?: string;
  theme: SectionTheme;
};

export function SectionHeader({
  title,
  description,
  theme,
}: SectionHeaderProps) {
  const { ref, isVisible } = useScrollFadeIn<HTMLDivElement>();

  const backgroundImage = theme.texture
    ? `${theme.texture}, linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`
    : `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`;

  return (
    <div
      ref={ref}
      className={clsx(
        "relative overflow-hidden rounded-[24px] border p-5 md:p-6 shadow-[0_12px_32px_rgba(0,0,0,0.08)] transition-all duration-700",
        isVisible ? "reveal-visible" : "reveal",
      )}
      style={{
        borderColor: theme.border,
        color: theme.text,
        backgroundImage,
      }}
    >
      <div className="flex flex-col gap-3 text-[color:inherit]">
        <div className="flex items-center gap-3">
          <span className="text-3xl md:text-4xl">{theme.emoji}</span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] opacity-70">
              Sección
            </p>
            <h2 className="font-serif text-2xl font-semibold md:text-3xl">
              {title}
            </h2>
          </div>
        </div>
        <p className="font-sans text-sm text-[rgba(62,47,40,0.8)] md:text-base">
          {description ?? theme.microcopy}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1"
            style={{
              backgroundColor: theme.accentMuted,
              border: `1px solid ${theme.border}`,
            }}
          >
            <span>{theme.badgeEmoji}</span>
            {theme.badgeLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-[color:inherit] shadow-sm">
            {theme.icon} Hecho local
          </span>
        </div>
        <span
          className="mt-2 inline-block h-[3px] w-20 rounded-full"
          style={{ backgroundColor: theme.accent }}
        />
        <p className="text-xs uppercase tracking-[0.25em] opacity-60">
          {theme.narrative}
        </p>
      </div>
    </div>
  );
}

export default SectionHeader;
