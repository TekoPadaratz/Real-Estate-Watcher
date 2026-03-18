import { afterEach, describe, expect, it, vi } from "vitest";
import { CrawlerService } from "../../src/core/crawl/crawler.service.js";
import { notificationQueueTable } from "../../src/core/storage/schema.js";
import { NotificationQueueRepository } from "../../src/core/storage/repositories/notification-queue-repository.js";
import { PropertyRepository } from "../../src/core/storage/repositories/property-repository.js";
import { RunRepository } from "../../src/core/storage/repositories/run-repository.js";
import { SourceRepository } from "../../src/core/storage/repositories/source-repository.js";
import { createScrapedPropertyRecord, createTestProfile, createTestSource } from "./helpers/fixtures.js";
import { createTestDatabase } from "./helpers/test-database.js";

const { crawlMock } = vi.hoisted(() => ({
  crawlMock: vi.fn()
}));

vi.mock("../../src/core/adapters/create-adapter.js", () => ({
  createSourceAdapter: vi.fn(() => ({
    crawl: crawlMock
  }))
}));

describe("CrawlerService enqueue", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    crawlMock.mockReset();

    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  async function createService() {
    const database = await createTestDatabase();
    cleanups.push(() => database.cleanup());

    const source = createTestSource();
    const sourceRepository = new SourceRepository(database.db);
    await sourceRepository.syncFromConfig([source], new Date().toISOString());

    return {
      database,
      source,
      service: new CrawlerService(
        [source],
        createTestProfile(),
        {} as any,
        new PropertyRepository(database.db),
        sourceRepository,
        new RunRepository(database.db),
        new NotificationQueueRepository(database.db),
        {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn()
        } as any
      )
    };
  }

  it("enfileira initial no modo bootstrap", async () => {
    const { database, service, source } = await createService();
    crawlMock.mockResolvedValueOnce({
      sourceId: source.id,
      sourceName: source.name,
      properties: [createScrapedPropertyRecord()],
      warnings: []
    });

    await service.crawlSource(source.id, {}, "bootstrap");

    const rows = database.db.select().from(notificationQueueTable).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe("initial");
  });

  it("enfileira new_listing quando um imóvel novo aparece no modo watch", async () => {
    const { database, service, source } = await createService();
    crawlMock.mockResolvedValueOnce({
      sourceId: source.id,
      sourceName: source.name,
      properties: [createScrapedPropertyRecord()],
      warnings: []
    });

    await service.crawlSource(source.id, {}, "watch");

    const rows = database.db.select().from(notificationQueueTable).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe("new_listing");
  });

  it("enfileira price_drop quando o preço cai acima do limiar", async () => {
    const { database, service, source } = await createService();
    crawlMock
      .mockResolvedValueOnce({
        sourceId: source.id,
        sourceName: source.name,
        properties: [createScrapedPropertyRecord({ priceBrl: 5000 })],
        warnings: []
      })
      .mockResolvedValueOnce({
        sourceId: source.id,
        sourceName: source.name,
        properties: [createScrapedPropertyRecord({ priceBrl: 4500 })],
        warnings: []
      });

    await service.crawlSource(source.id, {}, "watch");
    await service.crawlSource(source.id, {}, "watch");

    const rows = database.db.select().from(notificationQueueTable).all();
    expect(rows.map((row) => row.eventType)).toEqual(["new_listing", "price_drop"]);
  });
});
