import iconv from "iconv-lite";
import got from "got";
import type { CrawlResult, ScrapedPropertyRecord } from "../../domain/property.js";
import { DEFAULT_LINUX_USER_AGENT } from "../../http/user-agent.js";
import type { CrawlOptions } from "./base-source-adapter.js";
import { BaseSourceAdapter } from "./base-source-adapter.js";

function scoreDecodedText(value: string): number {
  const replacementPenalty = (value.match(/�/g) ?? []).length * 5;
  const mojibakePenalty = (value.match(/Ã|Â|Ð|�/g) ?? []).length * 3;
  return value.length - replacementPenalty - mojibakePenalty;
}

export abstract class BaseHttpAdapter extends BaseSourceAdapter {
  protected async collectRecords(options: CrawlOptions): Promise<CrawlResult> {
    const warnings: string[] = [];
    const properties: ScrapedPropertyRecord[] = [];
    const pagesToVisit = this.source.seeds.slice(0, options.maxSeeds ?? this.source.seeds.length);
    const visitedPages = new Set<string>();
    const detailUrls = new Map<string, ScrapedPropertyRecord>();
    let zeroResultsMessage: string | null = null;

    for (const seedUrl of pagesToVisit) {
      const queue = [seedUrl];
      let visitedPagesForSeed = 0;
      while (queue.length > 0) {
        if (visitedPagesForSeed >= this.services.env.HTTP_MAX_PAGINATION_PAGES) {
          warnings.push(`pagination_limit_reached:${seedUrl}:${this.services.env.HTTP_MAX_PAGINATION_PAGES}`);
          break;
        }

        const pageUrl = queue.shift();
        if (!pageUrl || visitedPages.has(pageUrl)) {
          continue;
        }

        visitedPages.add(pageUrl);
        visitedPagesForSeed += 1;

        try {
          const html = await this.fetchHtml(pageUrl);
          zeroResultsMessage ||= this.extractZeroResultsMessage(html);
          const $ = this.createCheerio(html);
          const discoveredUrlsBeforePage = detailUrls.size;

          for (const record of this.collectListingCandidates($, pageUrl, html)) {
            record.listingHtml = html;
            detailUrls.set(record.canonicalUrl, record);
          }

          for (const payload of this.parseStructuredData(html)) {
            for (const record of this.extractJsonRecords(payload)) {
              detailUrls.set(record.canonicalUrl, record);
            }
          }

          const discoveredUrlsAfterPage = detailUrls.size;
          const pageDiscoveredCandidates = discoveredUrlsAfterPage > discoveredUrlsBeforePage;

          if (queue.length === 0 && pageDiscoveredCandidates) {
            for (const nextUrl of this.collectPaginationUrls($, pageUrl)) {
              if (!visitedPages.has(nextUrl)) {
                queue.push(nextUrl);
              }
            }
          }
        } catch (error) {
          warnings.push(`fetch_failed:${pageUrl}:${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    const candidates = [...detailUrls.values()].slice(0, options.maxListings ?? 50);
    for (const candidate of candidates) {
      try {
        const html = await this.fetchHtml(candidate.canonicalUrl);
        const detail = this.extractDetailRecord(this.createCheerio(html), candidate.canonicalUrl, html);
        detail.detailHtml = html;
        properties.push(this.mergeRecords(candidate, detail));
      } catch (error) {
        warnings.push(`detail_failed:${candidate.canonicalUrl}:${error instanceof Error ? error.message : String(error)}`);
        properties.push(candidate);
      }
    }

    return {
      sourceId: this.source.id,
      sourceName: this.source.name,
      properties: this.dedupeScrapedRecords(properties),
      zeroResultsMessage,
      warnings
    };
  }

  protected async fetchHtml(url: string): Promise<string> {
    const response = await got(url, {
      timeout: {
        request: this.services.env.HTTP_TIMEOUT_MS
      },
      headers: {
        "user-agent": DEFAULT_LINUX_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8"
      },
      responseType: "buffer",
      retry: {
        limit: 2
      },
      https: {
        rejectUnauthorized: true
      }
    });

    const fallbacks = this.getHintArray(["decode_fallbacks"]);
    const encodings = fallbacks.length > 0 ? fallbacks : ["utf-8"];
    const decoded = encodings.map((encoding) => {
      try {
        return { encoding, text: iconv.decode(response.rawBody, encoding) };
      } catch {
        return { encoding, text: "" };
      }
    });

    decoded.sort((left, right) => scoreDecodedText(right.text) - scoreDecodedText(left.text));
    return decoded[0]?.text ?? response.rawBody.toString("utf8");
  }

  protected override collectPaginationUrls($: ReturnType<typeof this.createCheerio>, currentUrl: string): string[] {
    const pages = super.collectPaginationUrls($, currentUrl);
    if (pages.length > 0) {
      return pages;
    }

    const paginationParam = this.getHint(["pagination_param"]);
    if (typeof paginationParam !== "string") {
      return [];
    }

    const current = new URL(currentUrl);
    const pageNumber = Number.parseInt(current.searchParams.get(paginationParam) ?? "1", 10);
    const nextUrl = new URL(currentUrl);
    nextUrl.searchParams.set(paginationParam, String(pageNumber + 1));
    return [nextUrl.toString()];
  }
}
