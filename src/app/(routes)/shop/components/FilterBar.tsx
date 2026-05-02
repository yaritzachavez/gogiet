"use client";

import clsx from "clsx";

interface FilterBarProps {
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
  title?: string;
  icon?: React.ReactNode;
}

export default function FilterBar({
  items,
  selected,
  onSelect,
  title,
  icon,
}: FilterBarProps) {
  return (
    <section className="sticky top-0 z-30 bg-[#f5f7fb]/90 backdrop-blur">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3">
        {title ? (
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {icon}
            {title}
          </div>
        ) : null}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {items.map((item) => {
            const active = selected === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => onSelect(item)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-2xl px-4 py-2 text-sm font-medium shadow-sm transition",
                  active
                    ? "bg-orange-500 text-white shadow-orange-200"
                    : "bg-white text-slate-600 shadow-slate-100 hover:bg-slate-50",
                )}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
