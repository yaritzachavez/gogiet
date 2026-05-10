import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  children: ReactNode;
  className?: string;
};

export function SectionCard({ children, className }: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-slate-200/90 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {children}
    </section>
  );
}
