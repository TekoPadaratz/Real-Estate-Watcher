const featureDictionary: Array<{ label: string; aliases: string[] }> = [
  { label: "pool", aliases: ["piscina"] },
  { label: "gourmet_area", aliases: ["área gourmet", "area gourmet", "espaco gourmet"] },
  { label: "closet", aliases: ["closet"] },
  { label: "office", aliases: ["escritório", "escritorio", "home office", "sala de estudos"] },
  { label: "planned_kitchen", aliases: ["cozinha planejada", "planejados", "móveis planejados", "moveis planejados"] },
  { label: "condominium", aliases: ["condomínio", "condominio", "condomínio fechado", "condominio fechado"] },
  { label: "solar_heating", aliases: ["aquecimento solar", "energia solar"] },
  { label: "air_conditioning", aliases: ["ar condicionado"] },
  { label: "barbecue", aliases: ["churrasqueira"] },
  { label: "lavabo", aliases: ["lavabo"] },
  { label: "sacada", aliases: ["sacada", "varanda"] }
];

export function normalizeForSearch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCanonicalFeatures(values: Array<string | null | undefined>): string[] {
  const text = normalizeForSearch(values.filter(Boolean).join(" "));
  const found = new Set<string>();

  for (const feature of featureDictionary) {
    if (feature.aliases.some((alias) => text.includes(normalizeForSearch(alias)))) {
      found.add(feature.label);
    }
  }

  return [...found];
}
