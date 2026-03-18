import { createHash } from "node:crypto";
import type { NotificationEventType, QueuedNotificationPayload } from "../domain/property.js";

export const NOTIFICATION_PRIORITIES: Record<NotificationEventType, number> = {
  new_listing: 100,
  price_drop: 90,
  updated: 80,
  initial: 50
};

export function buildPayloadHash(payload: QueuedNotificationPayload): string {
  const signature = {
    propertyId: payload.propertyId,
    sourceId: payload.sourceId,
    type: payload.event.type,
    fingerprint: payload.event.fingerprint,
    snapshotHash: payload.event.snapshotHash,
    currentPriceBrl: payload.event.currentPriceBrl ?? payload.event.property.price_brl ?? null,
    previousPriceBrl: payload.event.previousPriceBrl ?? null,
    changedFields: payload.event.changedFields ?? [],
    descriptionSimilarity: payload.event.descriptionSimilarity ?? null,
    score: payload.event.score,
    title: payload.event.property.title,
    canonicalUrl: payload.event.property.canonical_url
  };

  return createHash("sha256").update(JSON.stringify(signature)).digest("hex");
}
