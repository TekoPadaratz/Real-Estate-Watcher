import got from "got";
import { chromium } from "playwright";
import { join } from "node:path";
import { bootstrap } from "../app/bootstrap.js";

async function dumpFailureArtifacts(seedUrl: string, outputDir: string, sourceId: string) {
  try {
    const html = await got(seedUrl).text();
    const fileName = `${sourceId}-${Date.now()}`;
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, `${fileName}.html`), html, "utf8");

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
    await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.screenshot({ path: join(outputDir, `${fileName}.png`), fullPage: true });
    await page.close();
    await browser.close();
  } catch {
    return;
  }
}

export async function runSmokeTestCommand(sourceId?: string) {
  const app = await bootstrap();

  try {
    const sources = sourceId ? [app.crawlerService.getSourceById(sourceId)] : app.sources;
    const results = [];

    for (const source of sources) {
      const adapter = app.createAdapter(source);
      const result = await adapter.crawl({ maxListings: 2, maxSeeds: 2, saveDebugArtifacts: true });
      const first = result.properties[0];
      const validZeroResults = Boolean(result.zeroResultsMessage);
      const validPrice = Boolean(first && ((first.priceBrl ?? 0) > 0 || /r\$\s*\d/i.test(first.priceText ?? "")));
      const validFirst = Boolean(first && first.title && first.canonicalUrl && validPrice);
      const seedUrl = source.seeds[0];

      if (!validZeroResults && !validFirst) {
        if (!seedUrl) {
          throw new Error(`Smoke test falhou para ${source.id}: fonte sem seed configurada.`);
        }

        await dumpFailureArtifacts(seedUrl, app.env.RUNTIME_PATHS.screenshotsDir, source.id);
        throw new Error(`Smoke test falhou para ${source.id}: nenhum item válido e nenhuma mensagem explícita de zero resultados.`);
      }

      results.push({
        sourceId: source.id,
        count: result.properties.length,
        zeroResultsMessage: result.zeroResultsMessage,
        firstTitle: first?.title ?? null,
        firstUrl: first?.canonicalUrl ?? null,
        firstPrice: first?.priceBrl ?? first?.priceText ?? null,
        warnings: result.warnings
      });
    }

    for (const item of results) {
      app.logger.info(item, "Smoke test concluído.");
    }

    return results;
  } finally {
    await app.close();
  }
}
