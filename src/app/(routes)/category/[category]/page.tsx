import { notFound } from "next/navigation";

import { CategoryChips } from "@/components/category/CategoryChips";
import { CategoryHero } from "@/components/category/CategoryHero";
import { ProductCard } from "@/components/category/ProductCard";
import type { CategoryKey } from "@/lib/categoryTheme";
import { CATEGORY_THEMES } from "@/lib/categoryTheme";

const MOCK_PRODUCTS: Record<
  CategoryKey,
  Array<Parameters<typeof ProductCard>[0]>
> = {
  cafeteria: [
    {
      category: "cafeteria",
      title: "Latte de la sierra",
      description: "Tostado artesanal con notas de piloncillo",
      price: 65,
      salePrice: 52,
      badge: "Grano local",
      image: "/images/cafe-1.jpg",
    },
    {
      category: "cafeteria",
      title: "Cold brew floral",
      description: "Infusión en frío con flores silvestres",
      price: 70,
      image: "/images/cafe-2.jpg",
    },
    {
      category: "cafeteria",
      title: "Panqué de elote",
      description: "Receta tradicional, servido caliente",
      price: 58,
      salePrice: 48,
      image: "/images/cafe-3.jpg",
    },
  ],
  taqueria: [
    {
      category: "taqueria",
      title: "Taco de trompo",
      description: "Marinado en naranja y especias de rancho",
      price: 25,
      salePrice: 20,
      badge: "Salsa casera",
      image: "/images/taco-1.jpg",
    },
    {
      category: "taqueria",
      title: "Taquito vegetariano",
      description: "Nopal asado con queso fresco",
      price: 22,
      image: "/images/taco-2.jpg",
    },
    {
      category: "taqueria",
      title: "Agua de horchata",
      description: "Canela y vainilla de la región",
      price: 18,
      salePrice: 15,
      image: "/images/horchata.jpg",
    },
  ],
  panaderia: [],
  heladeria: [],
  pasteleria: [],
  restaurante: [],
  abarrotes: [],
  farmacia: [],
  electronica: [],
};

type PageProps = {
  params: Promise<{ category: CategoryKey }>;
};

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  if (!CATEGORY_THEMES[category]) {
    notFound();
  }

  const products =
    MOCK_PRODUCTS[category]?.length > 0
      ? MOCK_PRODUCTS[category]
      : MOCK_PRODUCTS.cafeteria;

  const theme = CATEGORY_THEMES[category];

  return (
    <div
      className="min-h-screen bg-repeat"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(0,0,0,0.02) 1px, transparent 1px)",
        backgroundSize: "12px 12px",
        backgroundColor: theme.palette.background,
      }}
    >
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-[#3e2f28]">
        <CategoryHero category={category} />
        <CategoryChips
          active={category}
          onChange={(next) => {
            window.location.assign(`/category/${next}`);
          }}
        />

        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.title} {...product} />
          ))}
        </section>
      </main>
    </div>
  );
}
