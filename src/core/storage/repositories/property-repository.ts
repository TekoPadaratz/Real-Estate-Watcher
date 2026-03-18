import { and, eq, notInArray } from "drizzle-orm";
import type { NormalizedProperty } from "../../domain/normalized-property.js";
import type { AppDatabase } from "../db.js";
import { propertiesTable, propertySnapshotsTable } from "../schema.js";

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseJsonArray(value: string): string[] {
  const parsed = safeJsonParse<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function mapPropertyRow(row: typeof propertiesTable.$inferSelect): NormalizedProperty {
  return {
    source_id: row.sourceId,
    source_name: row.sourceName,
    external_id: row.externalId,
    canonical_url: row.canonicalUrl,
    title: row.title,
    transaction_type: row.transactionType,
    property_type: row.propertyType,
    usage_type: row.usageType,
    city: row.city,
    state: row.state,
    neighborhood: row.neighborhood,
    address: row.address,
    price_brl: row.priceBrl,
    condo_fee_brl: row.condoFeeBrl,
    iptu_brl: row.iptuBrl,
    bedrooms: row.bedrooms,
    suites: row.suites,
    bathrooms: row.bathrooms,
    parking_spaces: row.parkingSpaces,
    area_built_m2: row.areaBuiltM2,
    area_total_m2: row.areaTotalM2,
    main_image_url: row.mainImageUrl,
    image_urls: parseJsonArray(row.imageUrlsJson),
    description: row.description,
    features: parseJsonArray(row.featuresJson),
    raw_payload: safeJsonParse<Record<string, unknown>>(row.rawPayloadJson, {}),
    first_seen_at: row.firstSeenAt,
    last_seen_at: row.lastSeenAt,
    is_active: row.isActive === 1
  };
}

export interface StoredPropertyRecord {
  id: number;
  row: typeof propertiesTable.$inferSelect;
  property: NormalizedProperty;
}

export class PropertyRepository {
  constructor(private readonly db: AppDatabase) {}

  async findByFingerprint(fingerprint: string): Promise<StoredPropertyRecord | null> {
    const row = this.db.select().from(propertiesTable).where(eq(propertiesTable.fingerprint, fingerprint)).get();
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      row,
      property: mapPropertyRow(row)
    };
  }

  async upsertCurrentProperty(input: {
    property: NormalizedProperty;
    fingerprint: string;
    snapshotHash: string;
    score: number;
    scoreReasons: string[];
    runId: string;
    now: string;
  }): Promise<StoredPropertyRecord> {
    const existing = this.db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.fingerprint, input.fingerprint))
      .get();

    const payload = {
      sourceId: input.property.source_id,
      sourceName: input.property.source_name,
      externalId: input.property.external_id,
      canonicalUrl: input.property.canonical_url,
      fingerprint: input.fingerprint,
      currentSnapshotHash: input.snapshotHash,
      title: input.property.title,
      transactionType: input.property.transaction_type,
      propertyType: input.property.property_type,
      usageType: input.property.usage_type,
      city: input.property.city,
      state: input.property.state,
      neighborhood: input.property.neighborhood,
      address: input.property.address,
      priceBrl: input.property.price_brl,
      condoFeeBrl: input.property.condo_fee_brl,
      iptuBrl: input.property.iptu_brl,
      bedrooms: input.property.bedrooms,
      suites: input.property.suites,
      bathrooms: input.property.bathrooms,
      parkingSpaces: input.property.parking_spaces,
      areaBuiltM2: input.property.area_built_m2,
      areaTotalM2: input.property.area_total_m2,
      mainImageUrl: input.property.main_image_url,
      imageUrlsJson: JSON.stringify(input.property.image_urls),
      description: input.property.description,
      featuresJson: JSON.stringify(input.property.features),
      rawPayloadJson: JSON.stringify(input.property.raw_payload),
      firstSeenAt: existing?.firstSeenAt ?? input.property.first_seen_at,
      lastSeenAt: input.property.last_seen_at,
      isActive: input.property.is_active ? 1 : 0,
      matchScore: Math.round(input.score),
      scoreReasonsJson: JSON.stringify(input.scoreReasons),
      lastRunId: input.runId,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now
    };

    if (existing) {
      this.db.update(propertiesTable).set(payload).where(eq(propertiesTable.fingerprint, input.fingerprint)).run();
    } else {
      this.db.insert(propertiesTable).values(payload).run();
    }

    const row = this.db.select().from(propertiesTable).where(eq(propertiesTable.fingerprint, input.fingerprint)).get();
    if (!row) {
      throw new Error(`Imóvel não encontrado após upsert: ${input.fingerprint}`);
    }

    return {
      id: row.id,
      row,
      property: mapPropertyRow(row)
    };
  }

  async saveSnapshot(input: {
    property: NormalizedProperty;
    fingerprint: string;
    snapshotHash: string;
    score: number;
    scoreReasons: string[];
    capturedAt: string;
  }): Promise<void> {
    this.db
      .insert(propertySnapshotsTable)
      .values({
        propertyFingerprint: input.fingerprint,
        sourceId: input.property.source_id,
        snapshotHash: input.snapshotHash,
        capturedAt: input.capturedAt,
        priceBrl: input.property.price_brl,
        description: input.property.description,
        isActive: input.property.is_active ? 1 : 0,
        matchScore: Math.round(input.score),
        scoreReasonsJson: JSON.stringify(input.scoreReasons),
        propertyJson: JSON.stringify(input.property),
        rawPayloadJson: JSON.stringify(input.property.raw_payload)
      })
      .onConflictDoNothing()
      .run();
  }

  async markMissingAsInactive(sourceId: string, seenFingerprints: string[], now: string): Promise<void> {
    if (seenFingerprints.length === 0) {
      this.db
        .update(propertiesTable)
        .set({
          isActive: 0,
          lastSeenAt: now,
          updatedAt: now
        })
        .where(and(eq(propertiesTable.sourceId, sourceId), eq(propertiesTable.isActive, 1)))
        .run();
      return;
    }

    this.db
      .update(propertiesTable)
      .set({
        isActive: 0,
        lastSeenAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(propertiesTable.sourceId, sourceId),
          eq(propertiesTable.isActive, 1),
          notInArray(propertiesTable.fingerprint, seenFingerprints)
        )
      )
      .run();
  }

  async listCurrentBySource(sourceId: string): Promise<NormalizedProperty[]> {
    return this.db.select().from(propertiesTable).where(eq(propertiesTable.sourceId, sourceId)).all().map(mapPropertyRow);
  }
}
