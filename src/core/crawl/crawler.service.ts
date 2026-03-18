import type { Logger } from "pino";
import { createSourceAdapter } from "../adapters/create-adapter.js";
import type { AdapterServices, CrawlOptions } from "../adapters/base/base-source-adapter.js";
import type { SearchProfile } from "../config/search-profile.js";
import type { SourceDefinition } from "../config/sources.js";
import { buildFingerprint, buildSnapshotHash } from "../dedupe/fingerprint.js";
import { compareTextSimilarity } from "../dedupe/similarity.js";
import type { NormalizedProperty } from "../domain/normalized-property.js";
import type {
  CrawlResult,
  NotificationEvent,
  NotificationEventType,
  ProcessedPropertyRecord,
  QueuedNotificationPayload
} from "../domain/property.js";
import type { CrawlRunMode, SourceRunMetrics } from "../domain/source-run.js";
import { normalizeProperty } from "../extraction/property-normalizer.js";
import { buildPayloadHash, NOTIFICATION_PRIORITIES } from "../notifications/notification-payload.js";
import { createRunMetrics } from "../observability/run-metrics.js";
import { scoreProperty } from "../scoring/rule-engine.js";
import { NotificationQueueRepository } from "../storage/repositories/notification-queue-repository.js";
import { PropertyRepository, type StoredPropertyRecord } from "../storage/repositories/property-repository.js";
import { RunRepository } from "../storage/repositories/run-repository.js";
import { SourceRepository } from "../storage/repositories/source-repository.js";

function shouldDeactivateMissingListings(result: { properties: unknown[]; zeroResultsMessage?: string | null }): boolean {
  return result.properties.length > 0 || Boolean(result.zeroResultsMessage);
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function buildUpdatedEvent(
  profile: SearchProfile,
  processed: ProcessedPropertyRecord,
  previous: StoredPropertyRecord
): NotificationEvent | null {
  if (previous.row.currentSnapshotHash === processed.snapshotHash) {
    return null;
  }

  const changedFields: string[] = [];
  let descriptionSimilarity: number | undefined;

  if (previous.property.price_brl !== processed.property.price_brl) {
    changedFields.push("price");
  }
  if (previous.property.title !== processed.property.title) {
    changedFields.push("title");
  }
  if (previous.property.main_image_url !== processed.property.main_image_url) {
    changedFields.push("main_image");
  }
  if (!arraysEqual(previous.property.features, processed.property.features)) {
    changedFields.push("features");
  }
  if (previous.property.bedrooms !== processed.property.bedrooms) {
    changedFields.push("bedrooms");
  }
  if (previous.property.suites !== processed.property.suites) {
    changedFields.push("suites");
  }
  if (previous.property.bathrooms !== processed.property.bathrooms) {
    changedFields.push("bathrooms");
  }
  if (previous.property.parking_spaces !== processed.property.parking_spaces) {
    changedFields.push("parking_spaces");
  }
  if (previous.property.area_built_m2 !== processed.property.area_built_m2) {
    changedFields.push("area_built_m2");
  }
  if (previous.property.area_total_m2 !== processed.property.area_total_m2) {
    changedFields.push("area_total_m2");
  }

  if (profile.change_detection.notify_on_major_description_change) {
    const similarity = compareTextSimilarity(previous.property.description, processed.property.description);
    if (similarity < profile.change_detection.major_description_change_similarity_lt) {
      descriptionSimilarity = similarity;
      changedFields.push("description");
    }
  }

  if (changedFields.length === 0) {
    return null;
  }

  return {
    type: "updated",
    property: processed.property,
    fingerprint: processed.fingerprint,
    score: processed.score,
    scoreReasons: processed.scoreReasons,
    snapshotHash: processed.snapshotHash,
    descriptionSimilarity,
    changedFields
  };
}

function buildWatchEvent(
  profile: SearchProfile,
  processed: ProcessedPropertyRecord,
  previous: StoredPropertyRecord | null
): NotificationEvent | null {
  if (!previous) {
    return {
      type: "new_listing",
      property: processed.property,
      fingerprint: processed.fingerprint,
      score: processed.score,
      scoreReasons: processed.scoreReasons,
      snapshotHash: processed.snapshotHash
    };
  }

  if (
    profile.change_detection.notify_on_price_drop &&
    previous.property.price_brl !== null &&
    processed.property.price_brl !== null &&
    processed.property.price_brl < previous.property.price_brl
  ) {
    const diffPercent = ((previous.property.price_brl - processed.property.price_brl) / previous.property.price_brl) * 100;
    if (diffPercent >= profile.change_detection.notify_on_price_drop_percent_gte) {
      return {
        type: "price_drop",
        property: processed.property,
        fingerprint: processed.fingerprint,
        score: processed.score,
        scoreReasons: processed.scoreReasons,
        snapshotHash: processed.snapshotHash,
        previousPriceBrl: previous.property.price_brl,
        currentPriceBrl: processed.property.price_brl
      };
    }
  }

  return buildUpdatedEvent(profile, processed, previous);
}

function buildNotificationEvent(
  mode: CrawlRunMode,
  profile: SearchProfile,
  processed: ProcessedPropertyRecord,
  previous: StoredPropertyRecord | null
): NotificationEvent | null {
  if (mode === "bootstrap") {
    return {
      type: "initial",
      property: processed.property,
      fingerprint: processed.fingerprint,
      score: processed.score,
      scoreReasons: processed.scoreReasons,
      snapshotHash: processed.snapshotHash
    };
  }

  return buildWatchEvent(profile, processed, previous);
}

export interface CrawlSourceExecution {
  runId: string;
  source: SourceDefinition;
  result: CrawlResult;
  processed: ProcessedPropertyRecord[];
  metrics: SourceRunMetrics;
}

export interface CrawlSourceFailure {
  sourceId: string;
  errorMessage: string;
}

export interface CrawlAllSummary {
  results: CrawlSourceExecution[];
  failures: CrawlSourceFailure[];
}

export class CrawlerService {
  constructor(
    private readonly sources: SourceDefinition[],
    private readonly profile: SearchProfile,
    private readonly adapterServices: AdapterServices,
    private readonly propertyRepository: PropertyRepository,
    private readonly sourceRepository: SourceRepository,
    private readonly runRepository: RunRepository,
    private readonly notificationQueueRepository: NotificationQueueRepository,
    private readonly logger: Logger
  ) {}

  getSources(): SourceDefinition[] {
    return this.sources.filter((source) => source.enabled);
  }

  getSourceById(sourceId: string): SourceDefinition {
    const source = this.sources.find((item) => item.id === sourceId && item.enabled);
    if (!source) {
      throw new Error(`Fonte não encontrada ou desabilitada: ${sourceId}`);
    }
    return source;
  }

  async crawlSource(sourceId: string, options: CrawlOptions = {}, mode: CrawlRunMode = "manual"): Promise<CrawlSourceExecution> {
    const source = this.getSourceById(sourceId);
    const adapter = createSourceAdapter(source, this.adapterServices);
    const now = new Date().toISOString();
    const runId = await this.runRepository.startRun(source.id, mode, now);
    const metrics = createRunMetrics(source.id);

    try {
      const result = await adapter.crawl(options);
      metrics.discovered = result.properties.length;
      metrics.warnings.push(...result.warnings);

      const seenFingerprints: string[] = [];
      const processed: ProcessedPropertyRecord[] = [];

      for (const record of result.properties) {
        try {
          const property = normalizeProperty(source, record, now);
          const fingerprint = buildFingerprint(this.profile, property);
          const snapshotHash = buildSnapshotHash(property);
          const decision = scoreProperty(this.profile, property);

          const processedRecord: ProcessedPropertyRecord = {
            property,
            fingerprint,
            snapshotHash,
            score: decision.total,
            scoreReasons: decision.reasons,
            hardFiltered: decision.hardFiltered
          };

          processed.push(processedRecord);
          seenFingerprints.push(fingerprint);

          const previous = await this.propertyRepository.findByFingerprint(fingerprint);
          const stored = await this.propertyRepository.upsertCurrentProperty({
            property,
            fingerprint,
            snapshotHash,
            score: decision.total,
            scoreReasons: decision.reasons,
            runId,
            now
          });
          await this.propertyRepository.saveSnapshot({
            property,
            fingerprint,
            snapshotHash,
            score: decision.total,
            scoreReasons: decision.reasons,
            capturedAt: now
          });
          metrics.stored += 1;

          if (decision.hardFiltered || !decision.shouldNotify) {
            if (decision.hardFiltered || !decision.shouldStoreCandidate) {
              metrics.filteredOut += 1;
            }
            continue;
          }

          const event = buildNotificationEvent(mode, this.profile, processedRecord, previous);
          if (!event) {
            continue;
          }

          const payload: QueuedNotificationPayload = {
            propertyId: stored.id,
            sourceId: source.id,
            event
          };
          const payloadHash = buildPayloadHash(payload);
          const inserted = await this.notificationQueueRepository.enqueue({
            propertyId: stored.id,
            sourceId: source.id,
            fingerprint,
            eventType: event.type,
            priority: NOTIFICATION_PRIORITIES[event.type],
            payloadHash,
            payload,
            availableAt: now,
            createdAt: now
          });

          if (inserted) {
            metrics.queued += 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          metrics.warnings.push(`record_failed:${source.id}:${message}`);
          this.logger.warn({ err: error, sourceId: source.id }, "Falha ao processar imóvel individual.");
        }
      }

      if (shouldDeactivateMissingListings(result)) {
        await this.propertyRepository.markMissingAsInactive(source.id, seenFingerprints, now);
      } else {
        metrics.warnings.push(`deactivation_skipped:${source.id}:untrusted_empty_result`);
      }

      const finishedAt = new Date().toISOString();
      await this.sourceRepository.markCrawled(source.id, finishedAt);
      await this.runRepository.finishRun(runId, {
        status: "completed",
        finishedAt,
        metrics
      });

      this.logger.info({ sourceId: source.id, mode, metrics }, "Crawl concluído e eventos enfileirados.");

      return {
        runId,
        source,
        result,
        processed,
        metrics
      };
    } catch (error) {
      await this.runRepository.finishRun(runId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        metrics,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      this.logger.error({ err: error, sourceId, mode }, "Falha no crawl da fonte.");
      throw error;
    }
  }

  async crawlAll(options: CrawlOptions = {}, mode: CrawlRunMode = "manual"): Promise<CrawlAllSummary> {
    const results: CrawlSourceExecution[] = [];
    const failures: CrawlSourceFailure[] = [];

    for (const source of this.getSources()) {
      try {
        results.push(await this.crawlSource(source.id, options, mode));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failures.push({
          sourceId: source.id,
          errorMessage
        });
        this.logger.warn({ sourceId: source.id, errorMessage, mode }, "Falha isolada durante crawlAll.");
      }
    }

    return {
      results,
      failures
    };
  }
}
