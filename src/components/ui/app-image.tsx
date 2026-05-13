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
  aspectRatio?: string;
  aspectClassName?: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  objectFit?: "cover" | "contain";
  fallbackIconClassName?: string;
  fallbackLabel?: string;
  fallback?: ReactNode;
  fallbackNode?: ReactNode;
  optimize?: boolean;
  crop?: "fill" | "fit" | "scale" | "thumb";
  allowObjectUrl?: boolean;
};

function shouldBypassNextImage(source: string) {
  return (
    source.startsWith("blob:") ||
    source.startsWith("data:") ||
    source.startsWith("file:")
  );
}

function isDisplayableSource(source: string, allowObjectUrl: boolean) {
  if (!source) {
    return false;
  }

  if (
    source.startsWith("blob:") ||
    source.startsWith("data:") ||
    source.startsWith("file:")
  ) {
    return allowObjectUrl;
  }

  if (source.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(source);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function AppImage({
  src,
  alt,
  width = 800,
  height = 600,
  aspectRatio,
  aspectClassName = "aspect-[4/3]",
  className,
  imageClassName,
  sizes = "(max-width: 768px) 100vw, 33vw",
  priority = false,
  objectFit = "cover",
  fallbackIconClassName,
  fallbackLabel = "Sin imagen disponible",
  fallback,
  fallbackNode,
  optimize = true,
  crop = "fill",
  allowObjectUrl = false,
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

  const shouldRenderImage =
    isDisplayableSource(optimizedSrc, allowObjectUrl) && !hasError;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[inherit] bg-gradient-to-br from-slate-100 via-white to-slate-200",
        aspectClassName,
        className,
      )}
      style={aspectRatio ? { aspectRatio } : undefined}
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
              objectFit === "contain" ? "object-contain" : "object-cover",
              "transition duration-500",
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
          {fallback ?? fallbackNode ?? (
            <>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/90 text-orange-500 shadow-sm">
                <ImageIcon className={cn("h-6 w-6", fallbackIconClassName)} />
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
