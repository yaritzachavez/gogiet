export type SectionTheme = {
  key: string;
  emoji: string;
  icon: string;
  gradientFrom: string;
  gradientTo: string;
  text: string;
  border: string;
  accent: string;
  accentMuted: string;
  badgeLabel: string;
  badgeEmoji: string;
  microcopy: string;
  narrative: string;
  texture?: string;
};

type SectionPresetKey =
  | "calientes"
  | "frias"
  | "postres"
  | "panaderia"
  | "taqueria"
  | "default";

const SECTION_PRESETS: Record<SectionPresetKey, SectionTheme> = {
  calientes: {
    key: "calientes",
    emoji: "☕",
    icon: "🥄",
    gradientFrom: "#F8F1E7",
    gradientTo: "#F1E0CF",
    text: "#3E2F28",
    border: "#E2D0C0",
    accent: "#C6864A",
    accentMuted: "rgba(198,134,74,0.18)",
    badgeLabel: "Caliente",
    badgeEmoji: "🔥",
    microcopy: "El aroma que despierta tus mañanas",
    narrative: "Mezclas artesanales servidas con vapor y calma.",
    texture:
      "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.45), transparent 55%)",
  },
  frias: {
    key: "frias",
    emoji: "🧊",
    icon: "🥤",
    gradientFrom: "#F9FBFC",
    gradientTo: "#F1F7F7",
    text: "#2F3E3A",
    border: "#DDE8E4",
    accent: "#6D8B74",
    accentMuted: "rgba(109,139,116,0.16)",
    badgeLabel: "Fresca",
    badgeEmoji: "❄️",
    microcopy: "Refresca el alma con un toque artesanal",
    narrative: "Infusiones heladas con frutas de temporada.",
    texture:
      "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.65), transparent 60%)",
  },
  postres: {
    key: "postres",
    emoji: "🍰",
    icon: "🍮",
    gradientFrom: "#FBF6F4",
    gradientTo: "#F4ECEA",
    text: "#3E2F28",
    border: "#EADBE0",
    accent: "#F2B9C2",
    accentMuted: "rgba(242,185,194,0.2)",
    badgeLabel: "Dulce",
    badgeEmoji: "🍫",
    microcopy: "Dulces momentos para cerrar con sonrisa",
    narrative: "Rebanadas cremosas y tartas hechas en casa.",
    texture:
      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.55), transparent 65%)",
  },
  panaderia: {
    key: "panaderia",
    emoji: "🥐",
    icon: "🥖",
    gradientFrom: "#F7F3EF",
    gradientTo: "#EFE6DC",
    text: "#3B2F2F",
    border: "#E0D2C2",
    accent: "#C9A46A",
    accentMuted: "rgba(201,164,106,0.18)",
    badgeLabel: "Recién horneado",
    badgeEmoji: "🧈",
    microcopy: "Recién horneado, hecho con amor",
    narrative: "Masas madre, mantequilla dorada y ruido de horno.",
    texture:
      "radial-gradient(circle at 10% 0%, rgba(255,255,255,0.4), transparent 60%)",
  },
  taqueria: {
    key: "taqueria",
    emoji: "🌮",
    icon: "🌶️",
    gradientFrom: "#FFF8EA",
    gradientTo: "#FFEFD5",
    text: "#3E2F28",
    border: "#F1DFC5",
    accent: "#D36363",
    accentMuted: "rgba(211,99,99,0.2)",
    badgeLabel: "Del comal",
    badgeEmoji: "🔥",
    microcopy: "Del comal directo a tu antojo",
    narrative: "Salsas caseras y tortillas recién hechas.",
    texture:
      "radial-gradient(circle at 85% 15%, rgba(255,255,255,0.5), transparent 55%)",
  },
  default: {
    key: "default",
    emoji: "🌾",
    icon: "🍽️",
    gradientFrom: "#F8F5F0",
    gradientTo: "#F3ECE4",
    text: "#3E2F28",
    border: "#E2D9D0",
    accent: "#A97B58",
    accentMuted: "rgba(169,123,88,0.18)",
    badgeLabel: "Hecho a mano",
    badgeEmoji: "✨",
    microcopy: "Sabores que abrazan",
    narrative: "Productos artesanales de la comunidad.",
    texture:
      "radial-gradient(circle at 30% 10%, rgba(255,255,255,0.45), transparent 65%)",
  },
};

const SECTION_MATCHERS: Record<
  Exclude<SectionPresetKey, "default">,
  string[]
> = {
  calientes: ["caliente", "espresso", "latte", "hot", "chai"],
  frias: ["fría", "frio", "fría", "frapp", "helada", "iced", "frías"],
  postres: ["postre", "dulce", "dessert", "cake", "pastel"],
  panaderia: ["pan", "bakery", "concha", "bollería"],
  taqueria: ["taco", "antojito", "taquería", "guisados"],
};

export function getSectionTheme(title: string): SectionTheme {
  const normalized = title.toLowerCase();

  for (const [presetKey, keywords] of Object.entries(SECTION_MATCHERS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return SECTION_PRESETS[presetKey as SectionPresetKey];
    }
  }

  return SECTION_PRESETS.default;
}

