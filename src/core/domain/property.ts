import type { NormalizedProperty } from "./normalized-property.js";

export interface ScrapedPropertyRecord {
  sourceId: string;
  sourceName: string;
  externalId?: string | null;
  canonicalUrl: string;
  title?: string | null;
  transactionType?: string | null;
  propertyType?: string | null;
  usageType?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  priceText?: string | null;
  priceBrl?: number | null;
  condoFeeText?: string | null;
  condoFeeBrl?: number | null;
  iptuText?: string | null;
  iptuBrl?: number | null;
  bedrooms?: number | null;
  suites?: number | null;
  bathrooms?: number | null;
  parkingSpaces?: number | null;
  areaBuiltText?: string | null;
  areaBuiltM2?: number | null;
  areaTotalText?: string | null;
  areaTotalM2?: number | null;
  mainImageUrl?: string | null;
  imageUrls?: string[];
  description?: string | null;
  features?: string[];
  rawPayload?: Record<string, unknown>;
  detailHtml?: string | null;
  listingHtml?: string | null;
  isActive?: boolean;
}

export interface CrawlResult {
  sourceId: string;
  sourceName: string;
  properties: ScrapedPropertyRecord[];
  zeroResultsMessage?: string | null;
  warnings: string[];
}

export interface ProcessedPropertyRecord {
  property: NormalizedProperty;
  fingerprint: string;
  snapshotHash: string;
  score: number;
  scoreReasons: string[];
  hardFiltered: boolean;
}

export type NotificationEventType = "initial" | "new_listing" | "price_drop" | "updated";

export interface NotificationEvent {
  type: NotificationEventType;
  property: NormalizedProperty;
  fingerprint: string;
  score: number;
  scoreReasons: string[];
  snapshotHash: string;
  previousPriceBrl?: number | null;
  currentPriceBrl?: number | null;
  descriptionSimilarity?: number | null;
  changedFields?: string[];
}

export interface QueuedNotificationPayload {
  propertyId: number;
  sourceId: string;
  event: NotificationEvent;
}
