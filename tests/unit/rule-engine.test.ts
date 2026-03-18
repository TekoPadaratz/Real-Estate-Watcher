import { describe, expect, it } from "vitest";
import { searchProfileSchema } from "../../src/core/config/search-profile.js";
import { scoreProperty } from "../../src/core/scoring/rule-engine.js";

const profile = searchProfileSchema.parse({
  profile: { id: "test", name: "Teste" },
  location: { city: "Santo Antônio da Platina", state: "PR", country: "BR" },
  transaction: { mode: "rent" },
  property: {
    usage: "residential",
    allowed_types: ["casa", "residência"],
    reject_types: ["apartamento"]
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
    positive_keywords: [
      { term: "alto padrão", weight: 30 },
      { term: "piscina", weight: 15 },
      { term: "área gourmet", weight: 14 }
    ],
    negative_keywords: [{ term: "simples", weight: -12 }]
  },
  feature_bonus: {
    pool: 12,
    gourmet_area: 10,
    built_area_over_180: 8
  },
  feature_penalty: {
    no_main_image: -10,
    missing_price: -20,
    missing_bedrooms: -20,
    missing_parking: -10,
    incomplete_description: -6
  },
  decision: {
    min_score_to_notify: 70,
    min_score_to_store_candidate: 45,
    allow_manual_review_band: { from: 55, to: 69 }
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

describe("rule-engine", () => {
  it("pontua positivamente um imóvel aderente ao perfil", () => {
    const decision = scoreProperty(profile, {
      source_id: "nalesso",
      source_name: "Nalesso",
      external_id: "ID-1",
      canonical_url: "https://example.com/imovel/1",
      title: "Casa de alto padrão com piscina",
      transaction_type: "rent",
      property_type: "casa",
      usage_type: "residential",
      city: "Santo Antônio da Platina",
      state: "PR",
      neighborhood: "Centro",
      address: "Rua Exemplo",
      price_brl: 6500,
      condo_fee_brl: null,
      iptu_brl: null,
      bedrooms: 4,
      suites: 2,
      bathrooms: 4,
      parking_spaces: 3,
      area_built_m2: 220,
      area_total_m2: 360,
      main_image_url: "https://example.com/image.jpg",
      image_urls: ["https://example.com/image.jpg"],
      description: "Casa de alto padrão com piscina, área gourmet e acabamento sofisticado.",
      features: ["pool", "gourmet_area"],
      raw_payload: {},
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      is_active: true
    });

    expect(decision.hardFiltered).toBe(false);
    expect(decision.total).toBeGreaterThanOrEqual(70);
    expect(decision.shouldNotify).toBe(true);
  });

  it("não rejeita cidade equivalente sem acento e rejeita uso misto normalizado", () => {
    const cityDecision = scoreProperty(profile, {
      source_id: "nalesso",
      source_name: "Nalesso",
      external_id: "ID-2",
      canonical_url: "https://example.com/imovel/2",
      title: "Casa moderna",
      transaction_type: "rent",
      property_type: "casa",
      usage_type: "residential",
      city: "Santo Antonio da Platina",
      state: "PR",
      neighborhood: "Centro",
      address: "Rua Exemplo",
      price_brl: 5000,
      condo_fee_brl: null,
      iptu_brl: null,
      bedrooms: 4,
      suites: 1,
      bathrooms: 3,
      parking_spaces: 2,
      area_built_m2: 190,
      area_total_m2: 300,
      main_image_url: "https://example.com/image.jpg",
      image_urls: ["https://example.com/image.jpg"],
      description: "Casa moderna com área gourmet.",
      features: ["gourmet_area"],
      raw_payload: {},
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      is_active: true
    });

    expect(cityDecision.reasons).not.toContain("hard_filter:city_mismatch");

    const mixedUseDecision = scoreProperty(profile, {
      source_id: "nalesso",
      source_name: "Nalesso",
      external_id: "ID-3",
      canonical_url: "https://example.com/imovel/3",
      title: "Casa residencial/comercial",
      transaction_type: "rent",
      property_type: "casa",
      usage_type: "mixed",
      city: "Santo Antônio da Platina",
      state: "PR",
      neighborhood: "Centro",
      address: "Rua Exemplo",
      price_brl: 5000,
      condo_fee_brl: null,
      iptu_brl: null,
      bedrooms: 4,
      suites: 1,
      bathrooms: 3,
      parking_spaces: 2,
      area_built_m2: 190,
      area_total_m2: 300,
      main_image_url: "https://example.com/image.jpg",
      image_urls: ["https://example.com/image.jpg"],
      description: "Uso residencial/comercial.",
      features: [],
      raw_payload: {},
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      is_active: true
    });

    expect(mixedUseDecision.reasons).toContain("hard_filter:mixed_use");
    expect(mixedUseDecision.hardFiltered).toBe(true);
  });
});
