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
        "flex flex-col gap-4 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(32,32,32,0.96)_0%,rgba(18,18,18,0.96)_100%)] px-4 py-5 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between lg:px-7 lg:py-7",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="balanced-text mt-2 text-[clamp(1.9rem,4vw,2.75rem)] font-black tracking-tight text-[#f5f5f5]">
          {title}
        </h1>
        {description ? (
          <p className="balanced-text mt-3 max-w-3xl text-sm font-medium leading-6 text-[#b3b3b3] sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="min-w-0 shrink-0 max-sm:w-full">{actions}</div>
      ) : null}
    </div>
  );
}
