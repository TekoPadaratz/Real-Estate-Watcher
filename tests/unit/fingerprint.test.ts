import { describe, expect, it } from "vitest";
import { buildFingerprint, buildSnapshotHash } from "../../src/core/dedupe/fingerprint.js";
import { searchProfileSchema } from "../../src/core/config/search-profile.js";

const profile = searchProfileSchema.parse({
  profile: { id: "test", name: "Teste" },
  location: { city: "Santo Antônio da Platina", state: "PR", country: "BR" },
  transaction: { mode: "rent" },
  property: {
    usage: "residential",
    allowed_types: ["casa"],
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
    positive_keywords: [],
    negative_keywords: []
  },
  feature_bonus: {},
  feature_penalty: {},
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
    fingerprint_fields: [
      "source_id",
      "external_id",
      "canonical_url",
      "normalized_title",
      "normalized_neighborhood",
      "bedrooms",
      "suites",
      "parking_spaces"
    ],
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

const property = {
  source_id: "nalesso",
  source_name: "Nalesso",
  external_id: "ID-9464",
  canonical_url: "https://nalessoimoveis.com.br/imovel/residencia-jd-egea-2/",
  title: "Residência – Jd. Egea",
  transaction_type: "rent",
  property_type: "residência",
  usage_type: "residential",
  city: "Santo Antônio da Platina",
  state: "PR",
  neighborhood: "Jd. Egea",
  address: "Rua Exemplo",
  price_brl: 6600,
  condo_fee_brl: null,
  iptu_brl: null,
  bedrooms: 6,
  suites: 3,
  bathrooms: 6,
  parking_spaces: 4,
  area_built_m2: 184.35,
  area_total_m2: 300,
  main_image_url: "https://nalessoimoveis.com.br/example.jpg",
  image_urls: ["https://nalessoimoveis.com.br/example.jpg"],
  description: "Residência ampla com área gourmet e piscina.",
  features: ["pool", "gourmet_area"],
  raw_payload: {},
  first_seen_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
  is_active: true
};

describe("fingerprint", () => {
  it("gera fingerprint estável", () => {
    const first = buildFingerprint(profile, property);
    const second = buildFingerprint(profile, property);
    expect(first).toBe(second);
  });

  it("gera snapshot hash diferente quando muda o preço", () => {
    const first = buildSnapshotHash(property);
    const second = buildSnapshotHash({ ...property, price_brl: 6200 });
    expect(first).not.toBe(second);
  });
});
