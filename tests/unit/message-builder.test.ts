import { describe, expect, it } from "vitest";
import { searchProfileSchema } from "../../src/core/config/search-profile.js";
import { buildTelegramMessage } from "../../src/core/notifications/message-builder.js";

const profile = searchProfileSchema.parse({
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
  text_rules: { positive_keywords: [], negative_keywords: [] },
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

describe("message-builder", () => {
  it("gera mensagem HTML com informações principais", () => {
    const text = buildTelegramMessage({
      profile,
      event: {
        type: "new_listing",
        fingerprint: "abc",
        score: 82,
        scoreReasons: ["keyword:+30:alto padrão", "feature:+12:pool"],
        snapshotHash: "snapshot-1",
        property: {
          source_id: "nalesso",
          source_name: "Nalesso",
          external_id: "ID-1",
          canonical_url: "https://example.com/imovel/1?foo=1&bar=\"baz\"",
          title: "Casa de alto padrão",
          transaction_type: "rent",
          property_type: "casa",
          usage_type: "residential",
          city: "Santo Antônio da Platina",
          state: "PR",
          neighborhood: "Centro",
          address: "Rua Exemplo",
          price_brl: 6800,
          condo_fee_brl: null,
          iptu_brl: null,
          bedrooms: 4,
          suites: 2,
          bathrooms: 4,
          parking_spaces: 2,
          area_built_m2: 200,
          area_total_m2: 340,
          main_image_url: "https://example.com/image.jpg",
          image_urls: ["https://example.com/image.jpg"],
          description: "Casa moderna.",
          features: ["pool"],
          raw_payload: {},
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          is_active: true
        }
      }
    });

    expect(text).toContain("Novo imóvel");
    expect(text).toContain("Casa de alto padrão");
    expect(text).toContain("Score: 82");
    expect(text).toContain("Abrir anúncio");
    expect(text).toContain("foo=1&amp;bar=&quot;baz&quot;");
  });
});
