import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(32,32,32,0.96)_0%,rgba(18,18,18,0.96)_100%)] px-4 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:gap-4 sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between lg:px-7 lg:py-7",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-300 sm:text-xs sm:tracking-[0.22em]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="balanced-text mt-1.5 text-[clamp(1.55rem,5vw,2.75rem)] font-black tracking-tight text-[#f5f5f5] sm:mt-2">
          {title}
        </h1>
        {description ? (
          <p className="balanced-text mt-2 max-w-3xl text-xs font-medium leading-5 text-[#b3b3b3] sm:mt-3 sm:text-base sm:leading-6">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="min-w-0 shrink-0 max-sm:grid max-sm:w-full max-sm:gap-3">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
