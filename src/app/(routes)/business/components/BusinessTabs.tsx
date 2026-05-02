"use client";

interface Business {
  id: number;
  nombre?: string;
  name?: string;
  ciudad?: string | null;
  city?: string | null;
}

interface BusinessTabsProps {
  businesses: Business[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}

export default function BusinessTabs({
  businesses,
  selectedId,
  onSelect,
}: BusinessTabsProps) {
  if (businesses.length === 0) {
    return <div className="text-white/70 text-sm">Cargando negocios...</div>;
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:gap-2 gap-2 sm:gap-3">
        {businesses.map((business) => {
          const isSelected = selectedId === business.id;
          const displayName = business.nombre || business.name || "Sin nombre";
          const displayCity = business.ciudad || business.city || "";

          return (
            <button
              type="button"
              key={business.id}
              onClick={() => onSelect?.(business.id)}
              className={`
                rounded-lg transition-all duration-200 text-left
                px-3 py-2.5 text-sm font-medium
                sm:px-4 sm:py-3
                lg:px-4 lg:py-2.5 lg:whitespace-nowrap
                ${
                  isSelected
                    ? "bg-white text-[#264c36] shadow-md hover:shadow-lg"
                    : "bg-white/20 text-white hover:bg-white/30 active:bg-white/40"
                }
              `}
            >
              <p className="font-semibold truncate">{displayName}</p>
              {displayCity && (
                <p className="text-xs opacity-75 truncate hidden sm:block">
                  {displayCity}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
