import { eq } from "drizzle-orm";
import type { NotificationEventType } from "../../domain/property.js";
import type { AppDatabase } from "../db.js";
import { notificationsTable } from "../schema.js";

export interface RecordedNotification {
  queueId: number;
  propertyId: number;
  sourceId: string;
  eventType: NotificationEventType;
  payloadHash: string;
  payloadJson: string;
  telegramMethod: string;
  telegramMessageId?: string | null;
  createdAt: string;
  sentAt: string;
}

export class NotificationRepository {
  constructor(private readonly db: AppDatabase) {}

  async hasPayloadHash(payloadHash: string): Promise<boolean> {
    const row = this.db.select().from(notificationsTable).where(eq(notificationsTable.payloadHash, payloadHash)).get();
    return Boolean(row);
  }

  async recordSent(notification: RecordedNotification): Promise<void> {
    this.db
      .insert(notificationsTable)
      .values({
        queueId: notification.queueId,
        propertyId: notification.propertyId,
        sourceId: notification.sourceId,
        eventType: notification.eventType,
        payloadHash: notification.payloadHash,
        payloadJson: notification.payloadJson,
        telegramMethod: notification.telegramMethod,
        telegramMessageId: notification.telegramMessageId ?? null,
        createdAt: notification.createdAt,
        sentAt: notification.sentAt
      })
      .onConflictDoNothing()
      .run();
  }
}
