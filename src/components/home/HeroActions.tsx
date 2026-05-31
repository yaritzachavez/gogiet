"use client";

import { MoveRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export function HeroActions() {
  const router = useRouter();
  const { user } = useAuth();

  const handleOrder = () => {
    if (user) {
      router.push("/shop");
      return;
    }
    router.push("/auth?mode=login");
  };

  return (
    <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:gap-4">
      <Button
        onClick={handleOrder}
        className="h-11 rounded-full border border-[#f0a26d] !bg-[#e98a4a] px-5 text-sm font-bold text-white shadow-[0_0_30px_rgba(233,138,74,0.45)] transition-all duration-300 hover:!bg-[#d97836] sm:h-14 sm:px-9 sm:text-base"
      >
        <ShoppingBag className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
        Ordenar ahora
      </Button>
      <Button
        asChild
        variant="outline"
        className="h-11 rounded-full border border-[#85966a] !bg-[#6e7f52] px-5 text-sm font-bold text-white shadow-[0_0_25px_rgba(110,127,82,0.28)] transition-all duration-300 hover:!bg-[#5d6d44] hover:text-white sm:h-14 sm:px-9 sm:text-base"
      >
        <Link href="/shop" className="flex items-center gap-2">
          Ver tiendas
          <MoveRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
      </Button>
    </div>
  );
}

export default HeroActions;
