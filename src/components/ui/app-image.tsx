"use client";

import { ImageIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { optimizeCloudinaryImage } from "@/lib/cloudinary-url";
import { cn } from "@/lib/utils";

type AppImageProps = {
  src?: string | null;
  alt: string;
  width?: number;
  height?: number;
  aspectClassName?: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  fallbackIconClassName?: string;
  fallbackLabel?: string;
  fallbackNode?: ReactNode;
  optimize?: boolean;
  crop?: "fill" | "fit" | "scale" | "thumb";
};

function shouldBypassNextImage(source: string) {
  return (
    source.startsWith("blob:") ||
    source.startsWith("data:") ||
    source.startsWith("file:")
  );
}

export function AppImage({
  src,
  alt,
  width = 800,
  height = 600,
  aspectClassName = "aspect-[4/3]",
  className,
  imageClassName,
  sizes = "(max-width: 768px) 100vw, 33vw",
  priority = false,
  fallbackIconClassName,
  fallbackLabel = "Sin imagen disponible",
  fallbackNode,
  optimize = true,
  crop = "fill",
}: AppImageProps) {
  const normalizedSrc = String(src ?? "").trim();
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const optimizedSrc = useMemo(() => {
    if (!normalizedSrc) {
      return "";
    }

    if (!optimize) {
      return normalizedSrc;
    }

    return (
      optimizeCloudinaryImage(normalizedSrc, {
        width,
        height,
        crop,
      }) ?? normalizedSrc
    );
  }, [crop, height, normalizedSrc, optimize, width]);

  const shouldRenderImage = Boolean(optimizedSrc) && !hasError;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[inherit] bg-gradient-to-br from-slate-100 via-white to-slate-200",
        aspectClassName,
        className,
      )}
    >
      {shouldRenderImage ? (
        <>
          {!isLoaded ? (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200" />
          ) : null}
          <Image
            src={optimizedSrc}
            alt={alt}
            fill
            priority={priority}
            sizes={sizes}
            unoptimized={shouldBypassNextImage(optimizedSrc)}
            className={cn(
              "object-cover transition duration-500",
              isLoaded ? "opacity-100" : "opacity-0",
              imageClassName,
            )}
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setHasError(true);
              setIsLoaded(false);
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-white to-orange-50 px-4 text-center">
          {fallbackNode ?? (
            <>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/90 text-orange-500 shadow-sm">
                <ImageIcon
                  className={cn("h-6 w-6", fallbackIconClassName)}
                />
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                {fallbackLabel}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
