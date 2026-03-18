import { createHash } from "node:crypto";
import type { SearchProfile } from "../config/search-profile.js";
import type { NormalizedProperty } from "../domain/normalized-property.js";
import { normalizeForSearch } from "../extraction/feature-parser.js";

export function normalizeFingerprintField(key: string, property: NormalizedProperty): string {
  switch (key) {
    case "source_id":
      return property.source_id;
    case "external_id":
      return property.external_id;
    case "canonical_url":
      return property.canonical_url;
    case "normalized_title":
      return normalizeForSearch(property.title);
    case "normalized_neighborhood":
      return normalizeForSearch(property.neighborhood ?? "");
    case "bedrooms":
      return `${property.bedrooms ?? ""}`;
    case "suites":
      return `${property.suites ?? ""}`;
    case "parking_spaces":
      return `${property.parking_spaces ?? ""}`;
    default:
      return "";
  }
}

export function buildFingerprint(profile: SearchProfile, property: NormalizedProperty): string {
  const source = profile.dedupe.fingerprint_fields.map((field) => `${field}:${normalizeFingerprintField(field, property)}`).join("|");
  return createHash("sha256").update(source).digest("hex");
}

export function buildSnapshotHash(property: NormalizedProperty): string {
  const payload = JSON.stringify({
    title: property.title,
    price_brl: property.price_brl,
    description: property.description,
    bedrooms: property.bedrooms,
    suites: property.suites,
    bathrooms: property.bathrooms,
    parking_spaces: property.parking_spaces,
    area_built_m2: property.area_built_m2,
    area_total_m2: property.area_total_m2,
    features: property.features,
    image_urls: property.image_urls,
    is_active: property.is_active
  });

  return createHash("sha256").update(payload).digest("hex");
}
