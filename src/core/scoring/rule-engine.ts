import type { SearchProfile } from "../config/search-profile.js";
import type { NormalizedProperty } from "../domain/normalized-property.js";
import { normalizeForSearch } from "../extraction/feature-parser.js";
import { scoreFeatures } from "./feature-scorer.js";
import { scoreKeywords } from "./keyword-scorer.js";

export interface ScoreDecision {
  total: number;
  reasons: string[];
  shouldStoreCandidate: boolean;
  shouldNotify: boolean;
  manualReview: boolean;
  hardFiltered: boolean;
}

function hardFilterReasons(profile: SearchProfile, property: NormalizedProperty): string[] {
  const reasons: string[] = [];
  const type = normalizeForSearch(property.property_type);
  const descriptionText = normalizeForSearch(`${property.title} ${property.description ?? ""}`);
  const propertyCity = normalizeForSearch(property.city ?? "");
  const propertyState = normalizeForSearch(property.state ?? "");
  const profileCity = normalizeForSearch(profile.location.city);
  const profileState = normalizeForSearch(profile.location.state);

  if (!profile.property.allowed_types.some((candidate) => type.includes(normalizeForSearch(candidate)))) {
    reasons.push("property_type_not_allowed");
  }

  if (profile.property.reject_types.some((candidate) => type.includes(normalizeForSearch(candidate)))) {
    reasons.push("property_type_rejected");
  }

  if (propertyCity !== profileCity) {
    reasons.push("city_mismatch");
  }

  if (propertyState !== profileState) {
    reasons.push("state_mismatch");
  }

  if ((property.bedrooms ?? 0) < (profile.hard_filters.min_bedrooms ?? 0)) {
    reasons.push("min_bedrooms");
  }

  if ((property.suites ?? 0) < (profile.hard_filters.min_suites ?? 0)) {
    reasons.push("min_suites");
  }

  if ((property.parking_spaces ?? 0) < (profile.hard_filters.min_parking_spaces ?? 0)) {
    reasons.push("min_parking_spaces");
  }

  if ((property.price_brl ?? 0) < (profile.hard_filters.min_price_brl ?? 0)) {
    reasons.push("min_price_brl");
  }

  if (profile.hard_filters.require_active_listing && !property.is_active) {
    reasons.push("inactive_listing");
  }

  if (
    profile.hard_filters.reject_mixed_use &&
    (
      normalizeForSearch(property.usage_type).includes("mixed") ||
      normalizeForSearch(property.usage_type).includes("commercial") ||
      descriptionText.includes("comercial") ||
      descriptionText.includes("residencial/comercial")
    )
  ) {
    reasons.push("mixed_use");
  }

  return reasons;
}

export function scoreProperty(profile: SearchProfile, property: NormalizedProperty): ScoreDecision {
  const hardFilters = hardFilterReasons(profile, property);
  const keywordResult = scoreKeywords(profile, [property.title, property.description, property.neighborhood, property.address]);
  const featureResult = scoreFeatures(profile, property);
  const total = keywordResult.score + featureResult.score;
  const shouldStoreCandidate = total >= profile.decision.min_score_to_store_candidate;
  const shouldNotify = total >= profile.decision.min_score_to_notify;
  const manualReview =
    total >= profile.decision.allow_manual_review_band.from &&
    total <= profile.decision.allow_manual_review_band.to;

  return {
    total,
    reasons: [...hardFilters.map((reason) => `hard_filter:${reason}`), ...keywordResult.reasons, ...featureResult.reasons],
    shouldStoreCandidate,
    shouldNotify,
    manualReview,
    hardFiltered: hardFilters.length > 0
  };
}
