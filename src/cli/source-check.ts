import { bootstrap } from "../app/bootstrap.js";

export async function runSourceCheckCommand(sourceId?: string) {
  const app = await bootstrap();

  try {
    const sources = sourceId ? [app.crawlerService.getSourceById(sourceId)] : app.sources;
    const results = [];

    for (const source of sources) {
      const adapter = app.createAdapter(source);
      const result = await adapter.crawl({ maxListings: 3, maxSeeds: 2, saveDebugArtifacts: true });
      results.push({
        sourceId: source.id,
        count: result.properties.length,
        zeroResultsMessage: result.zeroResultsMessage,
        warnings: result.warnings
      });
    }

    for (const item of results) {
      app.logger.info(item, "Source check concluído.");
    }

    return results;
  } finally {
    await app.close();
  }
}
