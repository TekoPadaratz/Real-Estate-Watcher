import type { SourceDefinition } from "../config/sources.js";
import { normalizedPropertySchema, type NormalizedProperty } from "../domain/normalized-property.js";
import type { ScrapedPropertyRecord } from "../domain/property.js";
import { extractCanonicalFeatures, normalizeForSearch } from "./feature-parser.js";
import { absolutizeUrl, resolveImageUrls } from "./image-resolver.js";
import { parseAreaM2, parseBrlValue, parseInteger } from "./price-parser.js";

function inferPropertyType(input?: string | null): string {
  const value = normalizeForSearch(input ?? "");

  if (value.includes("casa")) {
    return "casa";
  }

  if (value.includes("sobrado")) {
    return "sobrado";
  }

  if (value.includes("condominio")) {
    return "casa de condomínio";
  }

  if (value.includes("residencia")) {
    return "residência";
  }

  if (value.includes("apartamento")) {
    return "apartamento";
  }

  return "desconhecido";
}

function extractSpecsFromText(text: string): {
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  areaBuiltM2: number | null;
  areaTotalM2: number | null;
} {
  const normalized = text.replace(/\u00a0/g, " ");

  return {
    bedrooms: parseInteger(normalized.match(/(\d+)\s*(?:quartos?|dormit[oó]rios?)/i)?.[1] ?? null),
    suites: parseInteger(normalized.match(/(\d+)\s*s[uú]i(?:te|tes)/i)?.[1] ?? null),
    bathrooms: parseInteger(normalized.match(/(\d+)\s*banheiros?/i)?.[1] ?? null),
    parkingSpaces: parseInteger(normalized.match(/(\d+)\s*(?:vagas?|garagens?)/i)?.[1] ?? null),
    areaBuiltM2: parseAreaM2(
      normalized.match(/(?:[áa]rea constru[ií]da|[áa]rea [uú]til|[áa]rea privativa)\s*[:\-]?\s*([\d\.\,]+\s*m[²2]?)/i)?.[1] ??
        null
    ),
    areaTotalM2: parseAreaM2(
      normalized.match(/(?:[áa]rea total|terreno)\s*[:\-]?\s*([\d\.\,]+\s*m[²2]?)/i)?.[1] ?? null
    )
  };
}

function deriveExternalId(record: ScrapedPropertyRecord): string {
  if (record.externalId?.trim()) {
    return record.externalId.trim();
  }

  try {
    const url = new URL(record.canonicalUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? record.canonicalUrl;
  } catch {
    return record.canonicalUrl;
  }
}

function normalizePropertyType(record: ScrapedPropertyRecord): string {
  for (const candidate of [record.title, record.description, record.propertyType]) {
    const inferred = inferPropertyType(candidate);
    if (inferred !== "desconhecido") {
      return inferred;
    }
  }

  return record.propertyType?.trim() || "desconhecido";
}

function safeText(input?: string | null): string | null {
  const value = input?.replace(/\s+/g, " ").trim();
  return value ? value : null;
}

function normalizeUsageType(record: ScrapedPropertyRecord): string {
  const content = normalizeForSearch([record.title, record.description, record.propertyType].filter(Boolean).join(" "));

  if (
    content.includes("residencial/comercial") ||
    content.includes("residencial ou comercial") ||
    content.includes("comercial e residencial") ||
    content.includes("uso misto")
  ) {
    return "mixed";
  }

  if (content.includes("comercial") && !/(casa|sobrado|residencia|residencial)/i.test(content)) {
    return "commercial";
  }

  return "residential";
}

function normalizeCity(source: SourceDefinition, record: ScrapedPropertyRecord): string | null {
  const sourceCity = source.city_scope[0];
  const text = [record.city, record.address, record.neighborhood, record.title, record.description].filter(Boolean).join(" ");
  if (sourceCity && normalizeForSearch(text).includes(normalizeForSearch(sourceCity))) {
    return sourceCity;
  }

  const city = safeText(record.city);
  if (!city || city.length > 80) {
    return sourceCity ?? null;
  }

  return city;
}

export function normalizeProperty(
  source: SourceDefinition,
  record: ScrapedPropertyRecord,
  now: string
): NormalizedProperty {
  const baseUrl = source.base_url;
  const imageUrls = resolveImageUrls(baseUrl, record.imageUrls ?? [record.mainImageUrl]);
  const mainImageUrl = absolutizeUrl(baseUrl, record.mainImageUrl ?? imageUrls[0]) ?? null;
  const textFallback = [record.title, record.description, record.address, record.neighborhood].filter(Boolean).join(" ");
  const parsedSpecs = extractSpecsFromText(textFallback);
  const features = [...new Set([...(record.features ?? []), ...extractCanonicalFeatures([record.title, record.description])])];

  const normalized = normalizedPropertySchema.parse({
    source_id: source.id,
    source_name: source.name,
    external_id: deriveExternalId(record),
    canonical_url: absolutizeUrl(baseUrl, record.canonicalUrl) ?? record.canonicalUrl,
    title: safeText(record.title) ?? "Imóvel sem título",
    transaction_type: safeText(record.transactionType) ?? "rent",
    property_type: normalizePropertyType(record),
    usage_type: normalizeUsageType(record),
    city: normalizeCity(source, record),
    state: safeText(record.state) ?? "PR",
    neighborhood: safeText(record.neighborhood),
    address: safeText(record.address),
    price_brl: record.priceBrl ?? parseBrlValue(record.priceText),
    condo_fee_brl: record.condoFeeBrl ?? parseBrlValue(record.condoFeeText),
    iptu_brl: record.iptuBrl ?? parseBrlValue(record.iptuText),
    bedrooms:
      record.bedrooms ??
      parseInteger(record.rawPayload?.bedrooms as string | number | null | undefined) ??
      parsedSpecs.bedrooms,
    suites:
      record.suites ??
      parseInteger(record.rawPayload?.suites as string | number | null | undefined) ??
      parsedSpecs.suites,
    bathrooms:
      record.bathrooms ??
      parseInteger(record.rawPayload?.bathrooms as string | number | null | undefined) ??
      parsedSpecs.bathrooms,
    parking_spaces:
      record.parkingSpaces ??
      parseInteger(record.rawPayload?.parking_spaces as string | number | null | undefined) ??
      parsedSpecs.parkingSpaces,
    area_built_m2: record.areaBuiltM2 ?? parseAreaM2(record.areaBuiltText) ?? parsedSpecs.areaBuiltM2,
    area_total_m2: record.areaTotalM2 ?? parseAreaM2(record.areaTotalText) ?? parsedSpecs.areaTotalM2,
    main_image_url: mainImageUrl,
    image_urls: imageUrls,
    description: safeText(record.description),
    features,
    raw_payload: record.rawPayload ?? {},
    first_seen_at: now,
    last_seen_at: now,
    is_active: record.isActive ?? true
  });

  return normalized;
}
