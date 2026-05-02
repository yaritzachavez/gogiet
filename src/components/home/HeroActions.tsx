"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, MoveRight } from "lucide-react";
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
    <div className="mt-8 flex flex-col gap-4 sm:flex-row">
      <Button
        onClick={handleOrder}
        className="h-14 rounded-full bg-orange-600 px-9 text-base font-bold text-white shadow-xl shadow-orange-500/25 transition hover:bg-orange-700"
      >
        <ShoppingBag className="mr-2 h-5 w-5" />
        Ordenar ahora
      </Button>
      <Button
        asChild
        variant="outline"
        className="h-14 rounded-full border-2 border-orange-600 bg-white/70 px-9 text-base font-bold text-orange-600 transition hover:bg-orange-50"
      >
        <Link href="/shop" className="flex items-center gap-2">
          Ver tiendas
          <MoveRight className="h-5 w-5" />
        </Link>
      </Button>
    </div>
  );
}

export default HeroActions;
