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
        className="h-11 rounded-full px-5 text-sm font-bold sm:h-14 sm:px-9 sm:text-base"
      >
        <ShoppingBag className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
        Ordenar ahora
      </Button>
      <Button
        asChild
        variant="outline"
        className="h-11 rounded-full border border-white/14 bg-white/5 px-5 text-sm font-bold text-white sm:h-14 sm:px-9 sm:text-base"
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
