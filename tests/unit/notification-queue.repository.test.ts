import { afterEach, describe, expect, it } from "vitest";
import { buildPayloadHash } from "../../src/core/notifications/notification-payload.js";
import { NotificationQueueRepository } from "../../src/core/storage/repositories/notification-queue-repository.js";
import { createTestDatabase } from "./helpers/test-database.js";

describe("NotificationQueueRepository", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it("deduplica itens da fila pelo payload_hash", async () => {
    const database = await createTestDatabase();
    cleanups.push(() => database.cleanup());

    const repository = new NotificationQueueRepository(database.db);
    const payload = {
      propertyId: 1,
      sourceId: "test-source",
      event: {
        type: "initial" as const,
        fingerprint: "fp-1",
        score: 80,
        scoreReasons: [],
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
    const payloadHash = buildPayloadHash(payload);
    const createdAt = new Date().toISOString();

    const first = await repository.enqueue({
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
    const second = await repository.enqueue({
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

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await repository.getByPayloadHash(payloadHash)).not.toBeNull();
  });
});
