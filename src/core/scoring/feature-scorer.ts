import type { SearchProfile } from "../config/search-profile.js";
import type { NormalizedProperty } from "../domain/normalized-property.js";

export interface FeatureScoreResult {
  score: number;
  reasons: string[];
}

export function scoreFeatures(profile: SearchProfile, property: NormalizedProperty): FeatureScoreResult {
  let score = 0;
  const reasons: string[] = [];
  const featureSet = new Set(property.features);

  for (const [feature, weight] of Object.entries(profile.feature_bonus)) {
    let matched = featureSet.has(feature);

    if (feature === "large_lot") {
      matched = (property.area_total_m2 ?? 0) >= 300;
    }

    if (feature === "built_area_over_180") {
      matched = (property.area_built_m2 ?? 0) >= 180;
    }

    if (feature === "built_area_over_250") {
      matched = (property.area_built_m2 ?? 0) >= 250;
    }

    if (matched) {
      score += weight;
      reasons.push(`feature:+${weight}:${feature}`);
    }
  }

  for (const [penalty, weight] of Object.entries(profile.feature_penalty)) {
    let apply = false;
    switch (penalty) {
      case "no_main_image":
        apply = !property.main_image_url;
        break;
      case "missing_price":
        apply = property.price_brl === null;
        break;
      case "missing_bedrooms":
        apply = property.bedrooms === null;
        break;
      case "missing_parking":
        apply = property.parking_spaces === null;
        break;
      case "incomplete_description":
        apply = (property.description?.length ?? 0) < 80;
        break;
      default:
        apply = false;
    }

    if (apply) {
      score += weight;
      reasons.push(`penalty:${weight}:${penalty}`);
    }
  }

  return { score, reasons };
}
