interface StatusBadgeProps {
  status: number
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const isActive = status === 1

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold sm:px-3 ${
        isActive
          ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {isActive ? "Activo" : "Inactivo"}
    </span>
  )
}
