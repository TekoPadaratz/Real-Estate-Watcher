import got from "got";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrap, type AppContext } from "../../src/app/bootstrap.js";

async function dumpFailureArtifacts(sourceId: string, seedUrl: string, outputDir: string) {
  const fileName = `${sourceId}-${Date.now()}`;
  await mkdir(outputDir, { recursive: true });

  try {
    const html = await got(seedUrl).text();
    await writeFile(join(outputDir, `${fileName}.html`), html, "utf8");
  } catch {
    await writeFile(join(outputDir, `${fileName}.html`), `Falha ao baixar HTML de ${seedUrl}`, "utf8");
  }

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
    await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.screenshot({ path: join(outputDir, `${fileName}.png`), fullPage: true });
    await page.close();
    await browser.close();
  } catch {
    await writeFile(join(outputDir, `${fileName}.png.txt`), `Falha ao capturar screenshot de ${seedUrl}`, "utf8");
  }
}

const runSmoke = process.env.ENABLE_LIVE_SMOKE === "true" || process.env.ENABLE_LIVE_SMOKE === "1";
let app: AppContext;

describe.runIf(runSmoke)("live source smoke tests", () => {
  beforeAll(async () => {
    app = await bootstrap();
  });

  afterAll(async () => {
    await app.close();
  });

  for (const sourceId of [
    "markize",
    "portal_do_sol",
    "santa_rosa",
    "boberg_sap",
    "gandara_oliveira",
    "padilha_ferrari",
    "villani",
    "nalesso"
  ]) {
    it(
      `${sourceId} retorna item válido ou zero resultados explícito`,
      async () => {
        const source = app.crawlerService.getSourceById(sourceId);
        const adapter = app.createAdapter(source);
        const result = await adapter.crawl({ maxListings: 2, maxSeeds: 2, saveDebugArtifacts: true });
        const first = result.properties[0];
        const validZeroResults = Boolean(result.zeroResultsMessage);
        const hasAtLeastOneItem = result.properties.length > 0;
        const validPrice = Boolean(first && ((first.priceBrl ?? 0) > 0 || /r\$\s*\d/i.test(first.priceText ?? "")));

        if (!validZeroResults && !hasAtLeastOneItem) {
          await dumpFailureArtifacts(source.id, source.seeds[0]!, app.env.RUNTIME_PATHS.screenshotsDir);
        }

        expect(validZeroResults || hasAtLeastOneItem).toBe(true);

        if (first) {
          if (!first.title || !first.canonicalUrl || !validPrice) {
            await dumpFailureArtifacts(source.id, first.canonicalUrl || source.seeds[0]!, app.env.RUNTIME_PATHS.screenshotsDir);
          }

          expect(first.title).toBeTruthy();
          expect(first.canonicalUrl).toMatch(/^https?:\/\//);
          expect(validPrice).toBe(true);
        }
      },
      180_000
    );
  }
});
