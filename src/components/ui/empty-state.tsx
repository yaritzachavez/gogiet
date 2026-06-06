import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98)_0%,rgba(11,11,11,0.98)_100%)] px-6 py-10 text-center shadow-[0_18px_45px_rgba(0,0,0,0.34)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex size-16 items-center justify-center rounded-3xl border border-orange-500/20 bg-orange-500/10 text-orange-300 shadow-inner shadow-black/20">
        <Icon className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-xl font-black tracking-tight text-[#f5f5f5]">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-[#b3b3b3] sm:text-base">
        {description}
      </p>
      {actionLabel && onAction ? (
        <Button type="button" size="lg" className="mt-6" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
