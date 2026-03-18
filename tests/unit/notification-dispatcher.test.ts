import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayloadHash } from "../../src/core/notifications/notification-payload.js";
import { NotificationDispatcher } from "../../src/core/notifications/notification-dispatcher.js";
import { TelegramDeliveryError } from "../../src/core/notifications/telegram.service.js";
import { AppStateRepository } from "../../src/core/storage/repositories/app-state-repository.js";
import { NotificationQueueRepository } from "../../src/core/storage/repositories/notification-queue-repository.js";
import { NotificationRepository } from "../../src/core/storage/repositories/notification-repository.js";
import { createTestDatabase } from "./helpers/test-database.js";

function createPayload(eventType: "initial" | "new_listing" = "initial") {
  return {
    propertyId: 1,
    sourceId: "test-source",
    event: {
      type: eventType,
      fingerprint: "fp-1",
      score: 80,
      scoreReasons: ["keyword:+30:alto padrão"],
      snapshotHash: "snapshot-1",
      property: {
        source_id: "test-source",
        source_name: "Fonte Teste",
        external_id: "prop-1",
        canonical_url: "https://example.com/imovel/1",
        title: "Casa",
        transaction_type: "rent",
        property_type: "casa",
        usage_type: "residential",
        city: "Santo Antônio da Platina",
        state: "PR",
        neighborhood: "Centro",
        address: "Rua Exemplo",
        price_brl: 5000,
        condo_fee_brl: null,
        iptu_brl: null,
        bedrooms: 4,
        suites: 2,
        bathrooms: 4,
        parking_spaces: 2,
        area_built_m2: 200,
        area_total_m2: 300,
        main_image_url: null,
        image_urls: [],
        description: "Casa",
        features: [],
        raw_payload: {},
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_active: true
      }
    }
  };
}

describe("NotificationDispatcher", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it("marca bootstrap como completed quando a fila initial termina", async () => {
    const database = await createTestDatabase();
    cleanups.push(() => database.cleanup());

    const queueRepository = new NotificationQueueRepository(database.db);
    const notificationRepository = new NotificationRepository(database.db);
    const appStateRepository = new AppStateRepository(database.db, database.client);
    const payload = createPayload("initial");
    const payloadHash = buildPayloadHash(payload);
    const createdAt = new Date().toISOString();

    await appStateRepository.markBootstrapStatus("in_progress", createdAt);
    await queueRepository.enqueue({
      propertyId: 1,
      sourceId: "test-source",
      fingerprint: "fp-1",
      eventType: "initial",
      priority: 50,
      payloadHash,
      payload,
      availableAt: createdAt,
      createdAt
    });

    const dispatcher = new NotificationDispatcher(
      queueRepository,
      notificationRepository,
      appStateRepository,
      {
        sendQueuedNotification: vi.fn().mockResolvedValue({
          method: "sendMessage",
          messageId: "10"
        })
      } as any,
      {
        reserve: vi.fn().mockReturnValue(Date.now()),
        applyRetryAfter: vi.fn()
      } as any,
      {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } as any,
      async () => {}
    );

    await dispatcher.dispatchOnce();

    const queueItem = await queueRepository.getByPayloadHash(payloadHash);
    expect(queueItem?.status).toBe("sent");
    expect(await notificationRepository.hasPayloadHash(payloadHash)).toBe(true);
    expect(await appStateRepository.getBootstrapStatus()).toBe("completed");
  });

  it("respeita retry_after e reenfileira o item com retry_scheduled", async () => {
    const database = await createTestDatabase();
    cleanups.push(() => database.cleanup());

    const queueRepository = new NotificationQueueRepository(database.db);
    const notificationRepository = new NotificationRepository(database.db);
    const appStateRepository = new AppStateRepository(database.db, database.client);
    const payload = createPayload("new_listing");
    const payloadHash = buildPayloadHash(payload);
    const createdAt = new Date().toISOString();

    await queueRepository.enqueue({
      propertyId: 1,
      sourceId: "test-source",
      fingerprint: "fp-1",
      eventType: "new_listing",
      priority: 100,
      payloadHash,
      payload,
      availableAt: createdAt,
      createdAt
    });

    const limiter = {
      reserve: vi.fn().mockReturnValue(Date.now()),
      applyRetryAfter: vi.fn()
    };
    const dispatcher = new NotificationDispatcher(
      queueRepository,
      notificationRepository,
      appStateRepository,
      {
        sendQueuedNotification: vi
          .fn()
          .mockRejectedValue(new TelegramDeliveryError("slow down", "rate_limit", 9_000, 429))
      } as any,
      limiter as any,
      {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } as any,
      async () => {}
    );

    const startedAt = Date.now();
    await dispatcher.dispatchOnce();
    const finishedAt = Date.now();

    const queueItem = await queueRepository.getByPayloadHash(payloadHash);
    expect(queueItem?.status).toBe("retry_scheduled");
    expect(queueItem?.availableAt).toBeTruthy();
    expect(new Date(queueItem!.availableAt).getTime()).toBeGreaterThanOrEqual(startedAt + 8_500);
    expect(new Date(queueItem!.availableAt).getTime()).toBeLessThanOrEqual(finishedAt + 9_500);
    expect(limiter.applyRetryAfter).toHaveBeenCalledTimes(1);
  });
});
