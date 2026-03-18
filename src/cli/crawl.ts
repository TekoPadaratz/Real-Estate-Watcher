import { bootstrap } from "../app/bootstrap.js";
import type { CrawlOptions } from "../core/adapters/base/base-source-adapter.js";

export async function runCrawlCommand(sourceId?: string, options: CrawlOptions = {}) {
  const app = await bootstrap();

  try {
    if (sourceId) {
      const result = await app.crawlerService.crawlSource(sourceId, options, "manual");
      app.logger.info({ sourceId, metrics: result.metrics }, "Crawl manual concluído.");
      return result;
    }

    const summary = await app.crawlerService.crawlAll(options, "manual");
    app.logger.info(
      {
        results: summary.results.map((result) => ({
          sourceId: result.source.id,
          metrics: result.metrics
        })),
        failures: summary.failures
      },
      "Crawl manual concluído."
    );

    if (summary.failures.length > 0) {
      process.exitCode = 1;
    }

    return summary;
  } finally {
    await app.close();
  }
}
