import { describe, expect, it, vi } from "vitest";
import { CrawlerService, type CrawlSourceExecution } from "../../src/core/crawl/crawler.service.js";
import type { SourceDefinition } from "../../src/core/config/sources.js";

function createSource(id: string, name: string): SourceDefinition {
  return {
    id,
    name,
    base_url: `https://${id}.example.com`,
    enabled: true,
    strategy: "http",
    platform_family: "test",
    experimental: false,
    city_scope: ["Santo Antônio da Platina"],
    seeds: [`https://${id}.example.com/busca`],
    capabilities: {
      supports_listing_pages: true,
      supports_detail_pages: true,
      supports_server_side_html: true,
      requires_browser: false,
      supports_pagination: false
    },
    extraction_hints: {}
  };
}

function createExecution(source: SourceDefinition): CrawlSourceExecution {
  return {
    runId: `${source.id}-run`,
    source,
    result: {
      sourceId: source.id,
      sourceName: source.name,
      properties: [],
      warnings: []
    },
    processed: [],
    metrics: {
      sourceId: source.id,
      discovered: 0,
      stored: 0,
      queued: 0,
      filteredOut: 0,
      warnings: []
    }
  };
}

describe("CrawlerService", () => {
  it("continua processando outras fontes quando uma falha no crawl global", async () => {
    const sourceA = createSource("a", "Fonte A");
    const sourceB = createSource("b", "Fonte B");
    const sourceC = createSource("c", "Fonte C");
    const logger = {
      warn: vi.fn()
    };

    const service = new CrawlerService(
      [sourceA, sourceB, sourceC] as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      logger as any
    );

    const crawlSource = vi
      .fn()
      .mockResolvedValueOnce(createExecution(sourceA))
      .mockRejectedValueOnce(new Error("falha transitória"))
      .mockResolvedValueOnce(createExecution(sourceC));

    (service as CrawlerService & { crawlSource: typeof crawlSource }).crawlSource = crawlSource;

    const summary = await service.crawlAll({ maxListings: 1 });

    expect(summary.results.map((result) => result.source.id)).toEqual(["a", "c"]);
    expect(summary.failures).toEqual([
      {
        sourceId: "b",
        errorMessage: "falha transitória"
      }
    ]);
    expect(crawlSource).toHaveBeenNthCalledWith(1, "a", { maxListings: 1 }, "manual");
    expect(crawlSource).toHaveBeenNthCalledWith(2, "b", { maxListings: 1 }, "manual");
    expect(crawlSource).toHaveBeenNthCalledWith(3, "c", { maxListings: 1 }, "manual");
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
