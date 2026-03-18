import { z } from "zod";

const sourceCapabilitiesSchema = z.object({
  supports_listing_pages: z.boolean(),
  supports_detail_pages: z.boolean(),
  supports_server_side_html: z.union([z.boolean(), z.string()]).optional(),
  requires_browser: z.boolean(),
  supports_pagination: z.boolean(),
  supports_feature_filters: z.boolean().optional()
});

const sourceDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  base_url: z.string().url(),
  enabled: z.boolean(),
  strategy: z.enum(["http", "browser"]),
  platform_family: z.string().min(1),
  experimental: z.boolean().default(false),
  city_scope: z.array(z.string()).default([]),
  seeds: z.array(z.string().url()).min(1),
  capabilities: sourceCapabilitiesSchema,
  extraction_hints: z.record(z.string(), z.unknown()).default({})
});

export const sourcesConfigSchema = z.object({
  sources: z.array(sourceDefinitionSchema)
});

export type SourceDefinition = z.infer<typeof sourceDefinitionSchema>;
export type SourcesConfig = z.infer<typeof sourcesConfigSchema>;
