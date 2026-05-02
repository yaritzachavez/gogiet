interface SummaryCardProps {
  label: string
  value: number
  accent?: "orange" | "red"
}

export default function SummaryCard({ label, value, accent = "red" }: SummaryCardProps) {
  const accentClass = accent === "orange" ? "text-orange-500" : "text-red-500"
  const bgClass = accent === "orange" ? "bg-orange-50/50 dark:bg-orange-500/10" : "bg-red-50/50 dark:bg-red-500/10"

  return (
    <div className={`${bgClass} rounded-xl border border-red-100/60 p-4 dark:border-white/10 sm:p-5`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 sm:text-sm">
        {label}
      </p>
      <p className={`${accentClass} mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl`}>{value}</p>
    </div>
  )
}
