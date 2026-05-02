"use client";

import { useEffect, useRef, useState } from "react";

type ScrollFadeOptions = {
  threshold?: number;
  rootMargin?: string;
};

/**
 * Adds a soft fade-up effect when an element comes into view.
 * Returns a ref and a boolean you can use to toggle reveal classes.
 */
export function useScrollFadeIn<T extends HTMLElement>(
  options: ScrollFadeOptions = {},
) {
  const elementRef = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = elementRef.current;
    if (!node || isVisible) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            obs.disconnect();
          }
        });
      },
      {
        threshold: options.threshold ?? 0.12,
        rootMargin: options.rootMargin ?? "0px 0px -10% 0px",
      },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [isVisible, options.threshold, options.rootMargin]);

  return { ref: elementRef, isVisible };
}

export default useScrollFadeIn;
