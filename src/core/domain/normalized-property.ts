import { z } from "zod";

export const normalizedPropertySchema = z.object({
  source_id: z.string().min(1),
  source_name: z.string().min(1),
  external_id: z.string().min(1),
  canonical_url: z.string().url(),
  title: z.string().min(1),
  transaction_type: z.string().min(1),
  property_type: z.string().min(1),
  usage_type: z.string().min(1),
  city: z.string().nullable(),
  state: z.string().nullable(),
  neighborhood: z.string().nullable(),
  address: z.string().nullable(),
  price_brl: z.number().nullable(),
  condo_fee_brl: z.number().nullable(),
  iptu_brl: z.number().nullable(),
  bedrooms: z.number().int().nullable(),
  suites: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  parking_spaces: z.number().int().nullable(),
  area_built_m2: z.number().nullable(),
  area_total_m2: z.number().nullable(),
  main_image_url: z.string().url().nullable(),
  image_urls: z.array(z.string().url()).default([]),
  description: z.string().nullable(),
  features: z.array(z.string()).default([]),
  raw_payload: z.record(z.string(), z.unknown()),
  first_seen_at: z.string().min(1),
  last_seen_at: z.string().min(1),
  is_active: z.boolean()
});

export type NormalizedProperty = z.infer<typeof normalizedPropertySchema>;
