"use client";

import { useEffect, useState } from "react";

type UseParallaxConfig = {
  factor?: number;
  enabled?: boolean;
  breakpoint?: number;
};

/**
 * Provides a subtle parallax translate for background layers.
 * Returns an inline style object you can spread on an element.
 */
export function useParallax({
  factor = 0.05,
  enabled = true,
  breakpoint = 768,
}: UseParallaxConfig = {}) {
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: "translateY(0px) scale(1.05)",
  });

  useEffect(() => {
    if (!enabled) {
      return () => {};
    }

    const handleScroll = () => {
      if (window.innerWidth < breakpoint) {
        setStyle({ transform: "translateY(0px) scale(1.05)" });
        return;
      }
      const offset = window.scrollY * factor;
      setStyle({
        transform: `translateY(${offset}px) scale(1.05)`,
        transition: "transform 0.15s ease-out",
        willChange: "transform",
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enabled, factor, breakpoint]);

  return style;
}

export default useParallax;
