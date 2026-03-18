import type { Logger } from "pino";
import { TelegramDeliveryError, TelegramService } from "./telegram.service.js";
import { FixedIntervalRateLimiter } from "./rate-limiter.js";
import { NotificationQueueRepository } from "../storage/repositories/notification-queue-repository.js";
import { NotificationRepository } from "../storage/repositories/notification-repository.js";
import { AppStateRepository } from "../storage/repositories/app-state-repository.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function computeBackoffMs(attemptCount: number): number {
  const baseMs = 30_000;
  const cappedAttempts = Math.max(0, Math.min(attemptCount - 1, 7));
  return Math.min(baseMs * 2 ** cappedAttempts, 6 * 60 * 60 * 1000);
}

export class NotificationDispatcher {
  constructor(
    private readonly queueRepository: NotificationQueueRepository,
    private readonly notificationRepository: NotificationRepository,
    private readonly appStateRepository: AppStateRepository,
    private readonly telegramService: TelegramService,
    private readonly rateLimiter: FixedIntervalRateLimiter,
    private readonly logger: Logger,
    private readonly sleepFn: (ms: number) => Promise<void> = sleep
  ) {}

  private async maybeMarkBootstrapCompleted(now: string): Promise<void> {
    const bootstrapStatus = await this.appStateRepository.getBootstrapStatus();
    if (bootstrapStatus !== "in_progress") {
      return;
    }

    const remaining = await this.queueRepository.countActiveByEventType("initial");
    if (remaining > 0) {
      return;
    }

    await this.appStateRepository.markBootstrapCompleted(now);
    this.logger.info("Fila inicial concluída. Bootstrap marcado como completed.");
  }

  async dispatchOnce(nowMs: number = Date.now()): Promise<boolean> {
    const queueItem = await this.queueRepository.claimNext(new Date(nowMs).toISOString());
    if (!queueItem) {
      await this.maybeMarkBootstrapCompleted(new Date(nowMs).toISOString());
      return false;
    }

    if (await this.notificationRepository.hasPayloadHash(queueItem.payloadHash)) {
      const dedupeSentAt = new Date().toISOString();
      await this.queueRepository.markSent(queueItem.id, dedupeSentAt);
      await this.maybeMarkBootstrapCompleted(dedupeSentAt);
      this.logger.warn(
        {
          queueId: queueItem.id,
          payloadHash: queueItem.payloadHash
        },
        "Payload já registrado como enviado. Marcando item da fila como sent sem reenvio."
      );
      return true;
    }

    const scheduledAt = this.rateLimiter.reserve(Date.now());
    const waitMs = Math.max(0, scheduledAt - Date.now());
    if (waitMs > 0) {
      this.logger.info({ queueId: queueItem.id, waitMs }, "Aguardando janela do rate limiter.");
      await this.sleepFn(waitMs);
    }

    try {
      const result = await this.telegramService.sendQueuedNotification(queueItem.payload);
      const sentAt = new Date().toISOString();

      await this.notificationRepository.recordSent({
        queueId: queueItem.id,
        propertyId: queueItem.propertyId,
        sourceId: queueItem.sourceId,
        eventType: queueItem.eventType,
        payloadHash: queueItem.payloadHash,
        payloadJson: queueItem.payloadJson,
        telegramMethod: result.method,
        telegramMessageId: result.messageId ?? null,
        createdAt: queueItem.createdAt,
        sentAt
      });
      await this.queueRepository.markSent(queueItem.id, sentAt);
      await this.maybeMarkBootstrapCompleted(sentAt);

      this.logger.info(
        {
          queueId: queueItem.id,
          propertyId: queueItem.propertyId,
          eventType: queueItem.eventType,
          method: result.method,
          attemptCount: queueItem.attemptCount
        },
        "Notificação enviada com sucesso."
      );
      return true;
    } catch (error) {
      const classified =
        error instanceof TelegramDeliveryError
          ? error
          : new TelegramDeliveryError(error instanceof Error ? error.message : String(error), "temporary");

      if (classified.kind === "rate_limit") {
        const retryAfterMs = classified.retryAfterMs ?? 60_000;
        const nextAttemptAtMs = Date.now() + retryAfterMs;
        const nextAttemptAt = new Date(nextAttemptAtMs).toISOString();
        this.rateLimiter.applyRetryAfter(nextAttemptAtMs);
        await this.queueRepository.markRetry(queueItem.id, nextAttemptAt, classified.message);
        this.logger.warn(
          {
            queueId: queueItem.id,
            retryAfterMs,
            eventType: queueItem.eventType
          },
          "Telegram respondeu com rate limit. Item reagendado."
        );
        return true;
      }

      if (classified.kind === "temporary") {
        const backoffMs = computeBackoffMs(queueItem.attemptCount);
        const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();
        await this.queueRepository.markRetry(queueItem.id, nextAttemptAt, classified.message);
        this.logger.warn(
          {
            queueId: queueItem.id,
            backoffMs,
            attemptCount: queueItem.attemptCount,
            eventType: queueItem.eventType
          },
          "Falha temporária no envio. Item reenfileirado com backoff exponencial."
        );
        return true;
      }

      await this.queueRepository.markFailed(queueItem.id, classified.message);
      await this.maybeMarkBootstrapCompleted(new Date().toISOString());
      this.logger.error(
        {
          queueId: queueItem.id,
          eventType: queueItem.eventType,
          err: classified
        },
        "Falha permanente no envio. Item marcado como failed."
      );
      return true;
    }
  }

  async runContinuously(input: {
    shouldStop: () => boolean;
    idleMs?: number;
  }): Promise<void> {
    const idleMs = input.idleMs ?? 1_000;

    while (!input.shouldStop()) {
      const processed = await this.dispatchOnce();
      if (processed) {
        continue;
      }

      await this.sleepFn(idleMs);
    }
  }
}
