export type CategoryKey =
  | "cafeteria"
  | "taqueria"
  | "panaderia"
  | "heladeria"
  | "pasteleria"
  | "restaurante"
  | "abarrotes"
  | "farmacia"
  | "electronica";

export type CategoryTheme = {
  name: string;
  emoji: string;
  palette: {
    background: string;
    text: string;
    secondaryText: string;
    accent: string;
    accentAlt: string;
  };
  badges: string[];
  microcopy: [string, string];
  heroGradient: string;
  discountColor: string;
};

export const CATEGORY_THEMES: Record<CategoryKey, CategoryTheme> = {
  cafeteria: {
    name: "Cafeterías",
    emoji: "☕",
    palette: {
      background: "#F8F5F0",
      text: "#3E2F28",
      secondaryText: "#57534E",
      accent: "#C9A46A",
      accentAlt: "#6D8B74",
    },
    badges: ["Tostado artesanal", "Grano local"],
    microcopy: ["Aroma que abraza", "Café con historia"],
    heroGradient: "from-[#f8f5f0] via-[#f3ece4] to-[#efe9e2]",
    discountColor: "#C97A56",
  },
  taqueria: {
    name: "Taquerías",
    emoji: "🌮",
    palette: {
      background: "#FFF8EA",
      text: "#3E2F28",
      secondaryText: "#57534E",
      accent: "#D36363",
      accentAlt: "#86A789",
    },
    badges: ["Del comal", "Salsa casera"],
    microcopy: ["Sazón que enamora", "Del comal a tu antojo"],
    heroGradient: "from-[#fff8ea] via-[#fdeed8] to-[#fbe3c2]",
    discountColor: "#D36363",
  },
  panaderia: {
    name: "Panaderías",
    emoji: "🥐",
    palette: {
      background: "#F7F3EF",
      text: "#3E2F28",
      secondaryText: "#57534E",
      accent: "#C9A46A",
      accentAlt: "#DCCEBE",
    },
    badges: ["Recién horneado", "Masa madre"],
    microcopy: ["Huele a hogar", "Pan calientito"],
    heroGradient: "from-[#f7f3ef] via-[#f4ede4] to-[#f1e6dc]",
    discountColor: "#C48A59",
  },
  heladeria: {
    name: "Heladerías",
    emoji: "🍨",
    palette: {
      background: "#FAF7F5",
      text: "#3E2F28",
      secondaryText: "#57534E",
      accent: "#A7DCC7",
      accentAlt: "#F7B6C1",
    },
    badges: ["Helado artesanal", "Ingredientes locales"],
    microcopy: ["Dulce pausa", "Felicidad fría"],
    heroGradient: "from-[#faf7f5] via-[#f7f2ef] to-[#f5e9e4]",
    discountColor: "#F7B6C1",
  },
  pasteleria: {
    name: "Pastelerías",
    emoji: "🎂",
    palette: {
      background: "#FBF6F4",
      text: "#3E2F28",
      secondaryText: "#57534E",
      accent: "#F6C7D1",
      accentAlt: "#C9A46A",
    },
    badges: ["Hecho con amor", "Para celebrar"],
    microcopy: ["Cada rebanada, un momento", "Dulzura que consiente"],
    heroGradient: "from-[#fbf6f4] via-[#f8eeeb] to-[#f6e4df]",
    discountColor: "#F28482",
  },
  restaurante: {
    name: "Restaurantes",
    emoji: "🍽️",
    palette: {
      background: "#F5EFE8",
      text: "#3E2F28",
      secondaryText: "#57534E",
      accent: "#A97B58",
      accentAlt: "#6D8B74",
    },
    badges: ["Favorito local", "Chef recomendado"],
    microcopy: ["Sabores que te hacen volver", "Cocina con alma"],
    heroGradient: "from-[#f5efe8] via-[#f1e7de] to-[#edde d3]".replace(" ", ""),
    discountColor: "#A97B58",
  },
  abarrotes: {
    name: "Tiendas de Abarrotes",
    emoji: "🧺",
    palette: {
      background: "#F4F2EE",
      text: "#3E2F28",
      secondaryText: "#57534E",
      accent: "#6D8B74",
      accentAlt: "#BCA889",
    },
    badges: ["Del campo a tu mesa", "Eco-friendly"],
    microcopy: ["Compra con propósito", "Producto artesanal"],
    heroGradient: "from-[#f4f2ee] via-[#efeae3] to-[#e8dfd4]",
    discountColor: "#6D8B74",
  },
  farmacia: {
    name: "Farmacias",
    emoji: "💊",
    palette: {
      background: "#F7FAF7",
      text: "#3E2F28",
      secondaryText: "#57534E",
      accent: "#6D8B74",
      accentAlt: "#CFE3EE",
    },
    badges: ["Entrega hoy", "De confianza"],
    microcopy: ["Cuidamos de ti", "Confianza que sana"],
    heroGradient: "from-[#f7faf7] via-[#eef5f2] to-[#e5edeb]",
    discountColor: "#6D8B74",
  },
  electronica: {
    name: "Electrónica",
    emoji: "🔌",
    palette: {
      background: "#F3F3F3",
      text: "#2F2F2F",
      secondaryText: "#424242",
      accent: "#C89B6D",
      accentAlt: "#2F2F2F",
    },
    badges: ["Garantía local", "Soporte cercano"],
    microcopy: ["Tecnología con corazón", "Conecta con lo nuevo"],
    heroGradient: "from-[#f3f3f3] via-[#eeeeee] to-[#e7e7e7]",
    discountColor: "#C89B6D",
  },
};

export const getCategoryTheme = (category: CategoryKey) =>
  CATEGORY_THEMES[category];
