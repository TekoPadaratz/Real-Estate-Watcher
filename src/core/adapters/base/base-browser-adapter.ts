import { chromium, type Page } from "playwright";
import type { CrawlResult, ScrapedPropertyRecord } from "../../domain/property.js";
import { DEFAULT_LINUX_USER_AGENT } from "../../http/user-agent.js";
import type { CrawlOptions } from "./base-source-adapter.js";
import { BaseSourceAdapter } from "./base-source-adapter.js";

export abstract class BaseBrowserAdapter extends BaseSourceAdapter {
  protected async collectRecords(options: CrawlOptions): Promise<CrawlResult> {
    const browser = await chromium.launch({ headless: this.services.env.PLAYWRIGHT_HEADLESS });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1600 },
      userAgent: DEFAULT_LINUX_USER_AGENT,
      locale: "pt-BR"
    });
    context.setDefaultTimeout(this.services.env.PLAYWRIGHT_TIMEOUT_MS);

    const warnings: string[] = [];
    const detailUrls = new Map<string, ScrapedPropertyRecord>();
    let zeroResultsMessage: string | null = null;

    try {
      for (const seedUrl of this.source.seeds.slice(0, options.maxSeeds ?? this.source.seeds.length)) {
        const interceptedPayloads: unknown[] = [];
        const page = await context.newPage();
        await this.attachNetworkInterception(page, interceptedPayloads);

        try {
          await page.goto(seedUrl, {
            waitUntil: "domcontentloaded",
            timeout: this.services.env.PLAYWRIGHT_TIMEOUT_MS
          });

          await this.waitForHydration(page);
          await this.autoScroll(page);

          const html = await page.content();
          zeroResultsMessage ||= this.extractZeroResultsMessage(html);
          const $ = this.createCheerio(html);

          for (const record of this.collectListingCandidates($, seedUrl, html)) {
            record.listingHtml = html;
            detailUrls.set(record.canonicalUrl, record);
          }

          for (const payload of this.parseStructuredData(html)) {
            for (const record of this.extractJsonRecords(payload)) {
              detailUrls.set(record.canonicalUrl, record);
            }
          }

          for (const payload of interceptedPayloads) {
            for (const record of this.extractJsonRecords(payload)) {
              detailUrls.set(record.canonicalUrl, record);
            }
          }
        } catch (error) {
          warnings.push(`browser_seed_failed:${seedUrl}:${error instanceof Error ? error.message : String(error)}`);
        } finally {
          await page.close();
        }
      }

      const properties: ScrapedPropertyRecord[] = [];
      for (const candidate of [...detailUrls.values()].slice(0, options.maxListings ?? 50)) {
        const page = await context.newPage();
        try {
          await page.goto(candidate.canonicalUrl, {
            waitUntil: "domcontentloaded",
            timeout: this.services.env.PLAYWRIGHT_TIMEOUT_MS
          });
          await this.waitForHydration(page);

          const html = await page.content();
          const detail = this.extractDetailRecord(this.createCheerio(html), candidate.canonicalUrl, html);
          detail.detailHtml = html;
          properties.push(this.mergeRecords(candidate, detail));
        } catch (error) {
          warnings.push(`browser_detail_failed:${candidate.canonicalUrl}:${error instanceof Error ? error.message : String(error)}`);
          if (options.saveDebugArtifacts) {
            await this.dumpBrowserFailure(page, candidate.canonicalUrl);
          }
          properties.push(candidate);
        } finally {
          await page.close();
        }
      }

      return {
        sourceId: this.source.id,
        sourceName: this.source.name,
        properties: this.dedupeScrapedRecords(properties),
        zeroResultsMessage,
        warnings
      };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  protected async attachNetworkInterception(page: Page, interceptedPayloads: unknown[]): Promise<void> {
    page.on("response", async (response) => {
      const contentType = response.headers()["content-type"] ?? "";
      if (!/json/i.test(contentType)) {
        return;
      }

      try {
        interceptedPayloads.push(await response.json());
      } catch {
        return;
      }
    });
  }

  protected async waitForHydration(page: Page): Promise<void> {
    try {
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(this.services.env.PLAYWRIGHT_TIMEOUT_MS, 10_000)
      });
    } catch {
      await page.waitForTimeout(2000);
    }
  }

  protected async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let total = 0;
        const step = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          total += step;
          if (total >= document.body.scrollHeight || total > 4000) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  protected async dumpBrowserFailure(page: Page, url: string): Promise<void> {
    const name = url.replace(/^https?:\/\//, "").replace(/[^\w-]+/g, "-").slice(0, 80);
    const html = await page.content();
    await this.services.debugDumps.writeHtml(this.source.id, `${name}-failure`, html);
    const screenshot = await page.screenshot({ fullPage: true });
    await this.services.debugDumps.writeBuffer(this.source.id, `${name}-failure`, screenshot, "png");
  }
}
