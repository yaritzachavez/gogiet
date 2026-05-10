"use client";

import { AppImage } from "@/components/ui/app-image";

type UserAvatarProps = {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
  textClassName?: string;
};

function getInitials(name: string | null | undefined) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "RG";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export function UserAvatar({
  name,
  src,
  size = 48,
  className = "",
  textClassName = "",
}: UserAvatarProps) {
  const normalizedSrc = src?.trim() || null;
  const initials = getInitials(name);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      {normalizedSrc ? (
        <AppImage
          src={normalizedSrc}
          alt={name ? `Foto de ${name}` : "Foto de perfil"}
          width={size}
          height={size}
          aspectClassName="aspect-square"
          className="h-full w-full rounded-full"
          imageClassName="rounded-full object-cover"
          sizes={`${size}px`}
          fallbackNode={
            <span
              className={`font-extrabold uppercase tracking-wide ${textClassName}`.trim()}
              style={{ fontSize: Math.max(12, Math.round(size * 0.34)) }}
            >
              {initials}
            </span>
          }
        />
      ) : (
        <span
          className={`font-extrabold uppercase tracking-wide ${textClassName}`.trim()}
          style={{ fontSize: Math.max(12, Math.round(size * 0.34)) }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
