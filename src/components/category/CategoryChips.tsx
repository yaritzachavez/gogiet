"use client";

import { useRef } from "react";

interface CategoryChipsProps {
  active?: string;
  onChange?: (key: string) => void;
}

const CATEGORIES = [
  { key: "all", label: "Todos", icon: "✨" },
  { key: "cafeteria", label: "Cafetería", icon: "☕" },
  { key: "taqueria", label: "Taquería", icon: "🌮" },
  { key: "panaderia", label: "Panadería", icon: "🥖" },
  { key: "heladeria", label: "Heladería", icon: "🍨" },
  { key: "pasteleria", label: "Pastelería", icon: "🎂" },
  { key: "restaurante", label: "Restaurante", icon: "🍽️" },
  { key: "abarrotes", label: "Abarrotes", icon: "🧺" },
  { key: "farmacia", label: "Farmacia", icon: "💊" },
  { key: "electronica", label: "Electrónica", icon: "🔌" },
];

export function CategoryChips({
  active = "all",
  onChange,
}: CategoryChipsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollBy = (offset: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  return (
    <div className="relative">
      <div className="rounded-2xl border border-slate-100 bg-white/70 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.03)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/70">
        <button
          type="button"
          className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/60 bg-white/90 p-2 text-slate-600 shadow hover:bg-white md:block"
          aria-label="Scroll izquierdo"
          onClick={() => scrollBy(-200)}
        >
          ‹
        </button>
        <button
          type="button"
          className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/60 bg-white/90 p-2 text-slate-600 shadow hover:bg-white md:block"
          aria-label="Scroll derecho"
          onClick={() => scrollBy(200)}
        >
          ›
        </button>
        <div className="relative px-4">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent dark:from-slate-900" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent dark:from-slate-900" />
          <div
            ref={scrollRef}
            className="overflow-x-auto scroll-smooth snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex gap-3 px-2 py-2">
              {CATEGORIES.map((category) => {
                const isActive = active === category.key;
                return (
                  <button
                    key={category.key}
                    type="button"
                    className={`snap-start rounded-[16px] px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D8B74]/40 active:scale-[0.97] ${
                      isActive
                        ? "bg-gradient-to-b from-[#9BBF83] to-[#6D8B74] text-white shadow-[0_8px_18px_rgba(109,139,116,0.35)]"
                        : "border border-[#E2D9D0] bg-white/80 text-slate-700 shadow-sm backdrop-blur hover:-translate-y-[2px] hover:bg-white"
                    }`}
                    aria-pressed={isActive}
                    onClick={() => onChange?.(category.key)}
                  >
                    <span className="mr-1">{category.icon}</span>
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CategoryChips;
