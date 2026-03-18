import { searchProfileSchema, type SearchProfile } from "../../../src/core/config/search-profile.js";
import type { SourceDefinition } from "../../../src/core/config/sources.js";
import type { ScrapedPropertyRecord } from "../../../src/core/domain/property.js";

export function createTestProfile(): SearchProfile {
  return searchProfileSchema.parse({
    profile: { id: "test", name: "Teste" },
    location: { city: "Santo Antônio da Platina", state: "PR", country: "BR" },
    transaction: { mode: "rent" },
    property: {
      usage: "residential",
      allowed_types: ["casa"],
      reject_types: []
    },
    hard_filters: {
      min_bedrooms: 3,
      min_suites: 1,
      min_parking_spaces: 2,
      min_price_brl: 2000,
      require_active_listing: true,
      reject_mixed_use: true
    },
    text_rules: {
      positive_keywords: [{ term: "alto padrão", weight: 30 }],
      negative_keywords: []
    },
    feature_bonus: {
      pool: 12
    },
    feature_penalty: {},
    decision: {
      min_score_to_notify: 30,
      min_score_to_store_candidate: 10,
      allow_manual_review_band: { from: 20, to: 29 }
    },
    change_detection: {
      notify_on_new_listing: true,
      notify_on_price_drop: true,
      notify_on_price_drop_percent_gte: 5,
      notify_on_major_description_change: true,
      major_description_change_similarity_lt: 0.72
    },
    dedupe: {
      mode: "per_source_v1",
      fingerprint_fields: ["source_id", "external_id"],
      cross_source_cluster_v2: false
    },
    notification: {
      channel: "telegram",
      include_main_photo: true,
      include_price: true,
      include_main_features: true,
      include_score: true,
      include_source_name: true,
      include_link: true
    }
  });
}

export function createTestSource(id = "test-source"): SourceDefinition {
  return {
    id,
    name: "Fonte Teste",
    base_url: `https://${id}.example.com`,
    enabled: true,
    strategy: "http",
    platform_family: "universal_software",
    experimental: false,
    city_scope: ["Santo Antônio da Platina"],
    seeds: [`https://${id}.example.com/aluguel`],
    capabilities: {
      supports_listing_pages: true,
      supports_detail_pages: true,
      supports_server_side_html: true,
      requires_browser: false,
      supports_pagination: false
    },
    extraction_hints: {}
  };
}

export function createScrapedPropertyRecord(overrides: Partial<ScrapedPropertyRecord> = {}): ScrapedPropertyRecord {
  return {
    sourceId: "test-source",
    sourceName: "Fonte Teste",
    externalId: "prop-1",
    canonicalUrl: "https://test-source.example.com/imovel/prop-1",
    title: "Casa de alto padrão com piscina",
    transactionType: "rent",
    propertyType: "casa",
    usageType: "residential",
    city: "Santo Antônio da Platina",
    state: "PR",
    neighborhood: "Centro",
    address: "Rua Exemplo, 10",
    priceBrl: 5000,
    condoFeeBrl: null,
    iptuBrl: null,
    bedrooms: 4,
    suites: 2,
    bathrooms: 4,
    parkingSpaces: 2,
    areaBuiltM2: 220,
    areaTotalM2: 320,
    mainImageUrl: "https://test-source.example.com/image.jpg",
    imageUrls: ["https://test-source.example.com/image.jpg"],
    description: "Casa de alto padrão com piscina e área gourmet.",
    features: ["pool"],
    rawPayload: {
      id: "prop-1"
    },
    isActive: true,
    ...overrides
  };
}
