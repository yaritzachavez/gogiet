interface StatusBadgeProps {
  isActive: boolean;
}

export default function StatusBadge({ isActive }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold sm:px-3 ${
        isActive
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200"
          : "border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200"
      }`}
    >
      {isActive ? "Activo" : "Inactivo"}
    </span>
  );
}
