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
        "rounded-[24px] border border-white/10 bg-black/70 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur sm:rounded-[28px]",
        className,
      )}
    >
      {children}
    </section>
  );
}
