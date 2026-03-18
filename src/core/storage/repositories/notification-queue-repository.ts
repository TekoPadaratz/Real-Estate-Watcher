import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { NotificationEventType, QueuedNotificationPayload } from "../../domain/property.js";
import type { AppDatabase } from "../db.js";
import { notificationQueueTable } from "../schema.js";

export type NotificationQueueStatus = "pending" | "sending" | "sent" | "failed" | "retry_scheduled";

export interface NotificationQueueItem {
  id: number;
  propertyId: number;
  sourceId: string;
  fingerprint: string;
  eventType: NotificationEventType;
  priority: number;
  status: NotificationQueueStatus;
  attemptCount: number;
  lastError: string | null;
  availableAt: string;
  payloadHash: string;
  payload: QueuedNotificationPayload;
  payloadJson: string;
  createdAt: string;
  sentAt: string | null;
}

function parsePayload(payloadJson: string): QueuedNotificationPayload {
  return JSON.parse(payloadJson) as QueuedNotificationPayload;
}

function mapRow(row: typeof notificationQueueTable.$inferSelect): NotificationQueueItem {
  return {
    id: row.id,
    propertyId: row.propertyId,
    sourceId: row.sourceId,
    fingerprint: row.fingerprint,
    eventType: row.eventType as NotificationEventType,
    priority: row.priority,
    status: row.status as NotificationQueueStatus,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    availableAt: row.availableAt,
    payloadHash: row.payloadHash,
    payload: parsePayload(row.payloadJson),
    payloadJson: row.payloadJson,
    createdAt: row.createdAt,
    sentAt: row.sentAt
  };
}

export class NotificationQueueRepository {
  constructor(private readonly db: AppDatabase) {}

  async enqueue(input: {
    propertyId: number;
    sourceId: string;
    fingerprint: string;
    eventType: NotificationEventType;
    priority: number;
    payloadHash: string;
    payload: QueuedNotificationPayload;
    availableAt: string;
    createdAt: string;
  }): Promise<boolean> {
    const payloadJson = JSON.stringify(input.payload);
    const result = this.db
      .insert(notificationQueueTable)
      .values({
        propertyId: input.propertyId,
        sourceId: input.sourceId,
        fingerprint: input.fingerprint,
        eventType: input.eventType,
        priority: input.priority,
        status: "pending",
        attemptCount: 0,
        lastError: null,
        availableAt: input.availableAt,
        payloadHash: input.payloadHash,
        payloadJson,
        createdAt: input.createdAt,
        sentAt: null
      })
      .onConflictDoNothing()
      .run();

    return (result.changes ?? 0) > 0;
  }

  async claimNext(now: string): Promise<NotificationQueueItem | null> {
    const next = this.db
      .select()
      .from(notificationQueueTable)
      .where(
        and(
          or(eq(notificationQueueTable.status, "pending"), eq(notificationQueueTable.status, "retry_scheduled")),
          lte(notificationQueueTable.availableAt, now)
        )
      )
      .orderBy(desc(notificationQueueTable.priority), asc(notificationQueueTable.createdAt), asc(notificationQueueTable.id))
      .get();

    if (!next) {
      return null;
    }

    const updated = this.db
      .update(notificationQueueTable)
      .set({
        status: "sending",
        attemptCount: sql`${notificationQueueTable.attemptCount} + 1`,
        lastError: null
      })
      .where(
        and(
          eq(notificationQueueTable.id, next.id),
          inArray(notificationQueueTable.status, ["pending", "retry_scheduled"])
        )
      )
      .run();

    if ((updated.changes ?? 0) === 0) {
      return null;
    }

    const claimed = this.db.select().from(notificationQueueTable).where(eq(notificationQueueTable.id, next.id)).get();
    return claimed ? mapRow(claimed) : null;
  }

  async markSent(queueId: number, sentAt: string): Promise<void> {
    this.db
      .update(notificationQueueTable)
      .set({
        status: "sent",
        sentAt,
        availableAt: sentAt,
        lastError: null
      })
      .where(eq(notificationQueueTable.id, queueId))
      .run();
  }

  async markRetry(queueId: number, availableAt: string, lastError: string): Promise<void> {
    this.db
      .update(notificationQueueTable)
      .set({
        status: "retry_scheduled",
        availableAt,
        lastError
      })
      .where(eq(notificationQueueTable.id, queueId))
      .run();
  }

  async markFailed(queueId: number, lastError: string): Promise<void> {
    this.db
      .update(notificationQueueTable)
      .set({
        status: "failed",
        lastError
      })
      .where(eq(notificationQueueTable.id, queueId))
      .run();
  }

  async countActiveByEventType(eventType: NotificationEventType): Promise<number> {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(notificationQueueTable)
      .where(
        and(
          eq(notificationQueueTable.eventType, eventType),
          inArray(notificationQueueTable.status, ["pending", "sending", "retry_scheduled"])
        )
      )
      .get();

    return Number(row?.count ?? 0);
  }

  async countPendingReady(now: string): Promise<number> {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(notificationQueueTable)
      .where(
        and(
          or(eq(notificationQueueTable.status, "pending"), eq(notificationQueueTable.status, "retry_scheduled")),
          lte(notificationQueueTable.availableAt, now)
        )
      )
      .get();

    return Number(row?.count ?? 0);
  }

  async getByPayloadHash(payloadHash: string): Promise<NotificationQueueItem | null> {
    const row = this.db
      .select()
      .from(notificationQueueTable)
      .where(eq(notificationQueueTable.payloadHash, payloadHash))
      .get();
    return row ? mapRow(row) : null;
  }
}
