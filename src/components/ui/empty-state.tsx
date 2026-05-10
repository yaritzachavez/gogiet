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
        "rounded-[28px] border border-slate-200/90 bg-white px-6 py-10 text-center shadow-[0_18px_45px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-orange-50 text-orange-600 shadow-inner shadow-orange-100">
        <Icon className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-xl font-black tracking-tight text-slate-950">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-500 sm:text-base">
        {description}
      </p>
      {actionLabel && onAction ? (
        <Button
          type="button"
          size="lg"
          className="mt-6"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
