import { z } from "zod";

const weightedTermSchema = z.object({
  term: z.string().min(1),
  weight: z.number()
});

export const searchProfileSchema = z.object({
  profile: z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  }),
  location: z.object({
    city: z.string().min(1),
    state: z.string().min(1),
    country: z.string().min(1)
  }),
  transaction: z.object({
    mode: z.string().min(1)
  }),
  property: z.object({
    usage: z.string().min(1),
    allowed_types: z.array(z.string()).min(1),
    reject_types: z.array(z.string()).default([])
  }),
  hard_filters: z.object({
    min_bedrooms: z.number().int().nullable().optional(),
    min_suites: z.number().int().nullable().optional(),
    min_parking_spaces: z.number().int().nullable().optional(),
    min_price_brl: z.number().nullable().optional(),
    require_active_listing: z.boolean().default(true),
    reject_mixed_use: z.boolean().default(true)
  }),
  text_rules: z.object({
    positive_keywords: z.array(weightedTermSchema).default([]),
    negative_keywords: z.array(weightedTermSchema).default([])
  }),
  feature_bonus: z.record(z.string(), z.number()).default({}),
  feature_penalty: z.record(z.string(), z.number()).default({}),
  decision: z.object({
    min_score_to_notify: z.number(),
    min_score_to_store_candidate: z.number(),
    allow_manual_review_band: z.object({
      from: z.number(),
      to: z.number()
    })
  }),
  change_detection: z.object({
    notify_on_new_listing: z.boolean().default(true),
    notify_on_price_drop: z.boolean().default(true),
    notify_on_price_drop_percent_gte: z.number().default(5),
    notify_on_major_description_change: z.boolean().default(true),
    major_description_change_similarity_lt: z.number().default(0.72)
  }),
  dedupe: z.object({
    mode: z.string().default("per_source_v1"),
    fingerprint_fields: z.array(z.string()).default([]),
    cross_source_cluster_v2: z.boolean().default(false)
  }),
  notification: z.object({
    channel: z.string().default("telegram"),
    include_main_photo: z.boolean().default(true),
    include_price: z.boolean().default(true),
    include_main_features: z.boolean().default(true),
    include_score: z.boolean().default(true),
    include_source_name: z.boolean().default(true),
    include_link: z.boolean().default(true)
  })
});

export type SearchProfile = z.infer<typeof searchProfileSchema>;
