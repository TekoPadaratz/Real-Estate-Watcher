import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { Logger } from "pino";
import type { AppEnv } from "../../config/env.js";
import type { SourceDefinition } from "../../config/sources.js";
import type { CrawlResult, ScrapedPropertyRecord } from "../../domain/property.js";
import { extractCanonicalFeatures, normalizeForSearch } from "../../extraction/feature-parser.js";
import { absolutizeUrl, resolveImageUrls } from "../../extraction/image-resolver.js";
import { parseAreaM2, parseBrlValue, parseInteger } from "../../extraction/price-parser.js";
import { DebugDumpService } from "../../observability/debug-dump.js";

export interface AdapterServices {
  env: AppEnv;
  logger: Logger;
  debugDumps: DebugDumpService;
}

export interface CrawlOptions {
  maxListings?: number;
  maxSeeds?: number;
  saveDebugArtifacts?: boolean;
}

type JsonLike = Record<string, unknown>;

function safeArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function uniqStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim()))];
}

function cleanText(input?: string | null): string | null {
  const value = input?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return value ? value : null;
}

export abstract class BaseSourceAdapter {
  constructor(protected readonly source: SourceDefinition, protected readonly services: AdapterServices) {}

  async crawl(options: CrawlOptions = {}): Promise<CrawlResult> {
    return this.collectRecords(options);
  }

  protected abstract collectRecords(options: CrawlOptions): Promise<CrawlResult>;

  protected get logger() {
    return this.services.logger.child({ sourceId: this.source.id });
  }

  protected getHint(path: string[]): unknown {
    let current: unknown = this.source.extraction_hints;
    for (const segment of path) {
      if (!current || typeof current !== "object" || !(segment in current)) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  protected getHintArray(path: string[]): string[] {
    const value = this.getHint(path);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  protected extractZeroResultsMessage(html: string): string | null {
    const normalized = normalizeForSearch(html);
    const candidates = [
      "0 resultados",
      "nenhum imovel encontrado",
      "nenhum imóvel encontrado",
      "nenhum resultado encontrado",
      "nenhum resultado",
      "sem resultados"
    ];

    const found = candidates.find((candidate) => normalized.includes(normalizeForSearch(candidate)));
    return found ?? null;
  }

  protected createCheerio(html: string): CheerioAPI {
    return load(html);
  }

  protected getCommonDetailPathHints(): string[] {
    const sourceSpecific = this.getHintArray(["url_patterns", "detail_contains"]);
    if (sourceSpecific.length > 0) {
      return uniqStrings(sourceSpecific);
    }

    return ["/imovel/", "/detalhe", "/imovel-", "/property/"];
  }

  protected getCommonListingPathHints(): string[] {
    return uniqStrings([
      ...this.getHintArray(["url_patterns", "listing_contains"]),
      ...this.getHintArray(["url_patterns", "search_contains"]),
      "/buscar",
      "/busca",
      "/imoveis/para-alugar",
      "/imoveis/",
      "/aluguel/imoveis/"
    ]);
  }

  protected isLikelyListingUrl(url: string): boolean {
    const absolute = absolutizeUrl(this.source.base_url, url);
    if (!absolute) {
      return false;
    }

    const parsed = new URL(absolute);
    const path = parsed.pathname.toLowerCase();
    const lastSegment = path.split("/").filter(Boolean).at(-1) ?? "";
    const listingHints = this.getCommonListingPathHints();

    if (listingHints.some((hint) => absolute.includes(hint))) {
      return true;
    }

    if (
      ["buscar", "busca", "alugar", "comprar", "venda", "locacao", "locação", "imoveis", "imovel"].includes(lastSegment)
    ) {
      return true;
    }

    const listingQueryParams = [
      "availability",
      "city",
      "property_type",
      "search_type",
      "show_map",
      "order",
      "direction",
      "pagina",
      "pag",
      "page",
      "status",
      "type",
      "finalidade"
    ];

    return listingQueryParams.some((param) => parsed.searchParams.has(param));
  }

  protected isLikelyDetailUrl(url: string): boolean {
    if (!url || url.startsWith("javascript:") || url.startsWith("#") || url.includes("/wp-content/")) {
      return false;
    }

    const absolute = absolutizeUrl(this.source.base_url, url);
    if (!absolute || !absolute.startsWith(this.source.base_url)) {
      return false;
    }

    if (absolute.endsWith("#") || this.isLikelyListingUrl(absolute)) {
      return false;
    }

    const parsed = new URL(absolute);
    const hints = this.getCommonDetailPathHints();
    const hasDetailHint = hints.some((hint) => absolute.includes(hint));
    if (!hasDetailHint) {
      return false;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.length >= 2;
  }

  protected collectPaginationUrls($: CheerioAPI, currentUrl: string): string[] {
    const pages = new Set<string>();

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      const absolute = absolutizeUrl(currentUrl, href);
      if (!absolute || !absolute.startsWith(this.source.base_url)) {
        return;
      }

      if (absolute === currentUrl) {
        return;
      }

      if (/pagina=|pag=|page=|\/pagina\//i.test(absolute)) {
        pages.add(absolute);
      }
    });

    return [...pages].slice(0, 5);
  }

  protected findLikelyCard(anchor: Cheerio<any>, $: CheerioAPI): Cheerio<any> {
    let current = anchor;
    for (let depth = 0; depth < 5; depth += 1) {
      const attr = `${current.attr("class") ?? ""} ${current.attr("id") ?? ""}`;
      if (/imovel|imoveis|property|card|item|result|resultado/i.test(attr)) {
        return current;
      }

      current = current.parent();
      if (!current.length) {
        break;
      }
    }

    return anchor.parent();
  }

  protected collectListingCandidates($: CheerioAPI, pageUrl: string, html: string): ScrapedPropertyRecord[] {
    const byUrl = new Map<string, ScrapedPropertyRecord>();

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      const absolute = absolutizeUrl(pageUrl, href);

      if (!absolute || !this.isLikelyDetailUrl(absolute)) {
        return;
      }

      const anchor = $(element);
      const card = this.findLikelyCard(anchor, $);
      const cardText = cleanText(card.text()) ?? cleanText(anchor.text()) ?? "";
      const title =
        cleanText(anchor.attr("title")) ??
        cleanText(card.find("h1, h2, h3, h4, .title, [class*='titulo'], [class*='title']").first().text()) ??
        cleanText(anchor.text());

      const mainImageUrl = absolutizeUrl(
        pageUrl,
        card.find("img").first().attr("src") ?? card.find("img").first().attr("data-src")
      );

      const specs = this.extractSpecsFromText(cardText);
      byUrl.set(absolute, {
        sourceId: this.source.id,
        sourceName: this.source.name,
        canonicalUrl: absolute,
        title,
        priceText: this.extractPriceText(cardText),
        bedrooms: specs.bedrooms,
        suites: specs.suites,
        bathrooms: specs.bathrooms,
        parkingSpaces: specs.parkingSpaces,
        areaBuiltText: specs.areaBuiltText,
        areaTotalText: specs.areaTotalText,
        mainImageUrl,
        imageUrls: resolveImageUrls(pageUrl, safeArray([mainImageUrl])),
        description: cardText || null,
        features: extractCanonicalFeatures([cardText]),
        rawPayload: {
          listingPageUrl: pageUrl,
          listingCardHtml: card.html() ?? "",
          listingPageHtmlFragment: html.slice(0, 1000)
        }
      });
    });

    return [...byUrl.values()];
  }

  protected extractJsonRecords(payload: unknown): ScrapedPropertyRecord[] {
    const records: ScrapedPropertyRecord[] = [];
    const seen = new Set<unknown>();

    const visit = (value: unknown) => {
      if (!value || typeof value !== "object" || seen.has(value)) {
        return;
      }

      seen.add(value);

      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item);
        }
        return;
      }

      const object = value as JsonLike;
      const url = this.pickString(object, ["canonical_url", "canonicalUrl", "url", "link", "href", "permalink"]);
      const title = this.pickString(object, ["title", "titulo", "name", "nome"]);
      const priceValue = this.pickPrimitive(object, [
        "price",
        "priceRent",
        "rentPrice",
        "valor",
        "valor_locacao",
        "preco",
        "locacao"
      ]);

      if (url && (title || priceValue !== undefined)) {
        const canonicalUrl = absolutizeUrl(this.source.base_url, url);
        if (canonicalUrl && this.isLikelyDetailUrl(canonicalUrl)) {
          records.push({
            sourceId: this.source.id,
            sourceName: this.source.name,
            canonicalUrl,
            externalId: this.pickString(object, ["id", "codigo", "code"]),
            title,
            neighborhood: this.pickString(object, ["neighborhood", "bairro"]),
            address: this.pickString(object, ["address", "endereco"]),
            city: this.pickString(object, ["city", "cidade"]),
            state: this.pickString(object, ["state", "estado", "uf"]),
            priceText: priceValue !== undefined ? String(priceValue) : null,
            bedrooms: this.pickInteger(object, ["bedrooms", "quartos", "dormitorios"]),
            suites: this.pickInteger(object, ["suites", "suitesCount", "suite"]),
            bathrooms: this.pickInteger(object, ["bathrooms", "banheiros"]),
            parkingSpaces: this.pickInteger(object, ["parkingSpaces", "garagens", "vagas"]),
            areaBuiltText: this.pickPrimitiveString(object, ["builtArea", "areaConstruida", "area_construida"]),
            areaTotalText: this.pickPrimitiveString(object, ["totalArea", "areaTotal", "area_total"]),
            mainImageUrl: absolutizeUrl(this.source.base_url, this.pickString(object, ["image", "thumbnail", "foto", "main_image"])),
            imageUrls: resolveImageUrls(
              this.source.base_url,
              this.pickStringArray(object, ["images", "fotos", "gallery", "galleryImages"])
            ),
            description: this.pickString(object, ["description", "descricao"]),
            features: extractCanonicalFeatures([
              this.pickString(object, ["description", "descricao"]),
              this.pickString(object, ["title", "titulo"])
            ]),
            rawPayload: object
          });
        }
      }

      for (const child of Object.values(object)) {
        visit(child);
      }
    };

    visit(payload);
    return this.dedupeScrapedRecords(records);
  }

  protected parseStructuredData(html: string): unknown[] {
    const $ = this.createCheerio(html);
    const payloads: unknown[] = [];

    $("script[type='application/ld+json']").each((_, element) => {
      const raw = $(element).html();
      if (!raw) {
        return;
      }

      try {
        payloads.push(JSON.parse(raw));
      } catch {
        this.logger.debug("Falha ao parsear JSON-LD.");
      }
    });

    $("script").each((_, element) => {
      const raw = $(element).html();
      if (!raw || !/__NEXT_DATA__|__INITIAL_STATE__|property|imovel|imoveis/i.test(raw)) {
        return;
      }

      const matches = raw.match(/\{[\s\S]*\}/g);
      if (!matches) {
        return;
      }

      for (const candidate of matches.slice(0, 5)) {
        try {
          payloads.push(JSON.parse(candidate));
        } catch {
          continue;
        }
      }
    });

    return payloads;
  }

  protected isLikelyNoiseText(text: string): boolean {
    const value = cleanText(text) ?? "";
    if (!value) {
      return true;
    }

    if (
      /[#\.\w-]+\{[^}]+\}|(?:font|padding|margin|display|position|z-index|transform|background|border)\s*:/i.test(
        value
      )
    ) {
      return true;
    }

    return /pol[ií]tica de privacidade|anuncie seu im[oó]vel|simule um financiamento|esqueceu a senha|resetar a senha/i.test(
      value
    );
  }

  protected extractMeaningfulText($: CheerioAPI, selectors: string[]): string | null {
    for (const selector of selectors) {
      const candidates = $(selector)
        .map((_, element) => cleanText($(element).text()))
        .get()
        .filter((value): value is string => Boolean(value && !this.isLikelyNoiseText(value)));

      const best = candidates.find((value) => value.length >= 20) ?? candidates[0];
      if (best) {
        return best;
      }
    }

    return null;
  }

  protected extractReadablePageText(html: string): string {
    const $ = this.createCheerio(html);
    $("script, style, noscript, template, svg, header, footer, nav, form").remove();

    return (
      this.extractMeaningfulText($, [
        "main",
        "[role='main']",
        "article",
        ".property-description",
        ".entry-content",
        ".content-description",
        ".property-content",
        ".single-property",
        ".property-detail",
        ".imovel"
      ]) ??
      cleanText($("body").text()) ??
      ""
    );
  }

  protected extractDetailStructuredRecord(html: string, pageUrl: string): ScrapedPropertyRecord | null {
    const normalizedTargetUrl = absolutizeUrl(this.source.base_url, pageUrl);

    for (const payload of this.parseStructuredData(html)) {
      const records = this.extractJsonRecords(payload);
      if (records.length === 0) {
        continue;
      }

      const exactMatch = records.find((record) => absolutizeUrl(this.source.base_url, record.canonicalUrl) === normalizedTargetUrl);
      if (exactMatch) {
        return exactMatch;
      }

      if (records.length === 1) {
        return records[0] ?? null;
      }
    }

    return null;
  }

  protected normalizeUsageType(values: Array<string | null | undefined>): string {
    const text = normalizeForSearch(values.filter(Boolean).join(" "));

    if (
      /residencial\/comercial|residencial ou comercial|comercial e residencial|uso misto|misto/i.test(text)
    ) {
      return "mixed";
    }

    if (text.includes("comercial") && !/(casa|sobrado|residencia|residencial)/i.test(text)) {
      return "commercial";
    }

    return "residential";
  }

  protected extractDetailRecord($: CheerioAPI, pageUrl: string, html: string): ScrapedPropertyRecord {
    const structured = this.extractDetailStructuredRecord(html, pageUrl);
    const title =
      structured?.title ??
      cleanText($("h1").first().text()) ??
      cleanText($("h2").first().text()) ??
      cleanText($("meta[property='og:title']").attr("content")) ??
      cleanText($("title").text()) ??
      "Imóvel sem título";

    const pageText = this.extractReadablePageText(html);
    const description =
      structured?.description ??
      this.extractMeaningfulText($, [
        "[class*='descricao']",
        "#descricao",
        ".description",
        "[class*='description']",
        ".property-description",
        ".content-description",
        ".entry-content",
        "article",
        "main"
      ]) ??
      cleanText(pageText);

    const priceCandidates = $(
      [
        "[class*='valor']",
        "[class*='price']",
        ".price",
        ".valor",
        ".property-price",
        ".listing-price"
      ].join(",")
    )
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((value): value is string => Boolean(value && /r\$\s*\d/i.test(value)));

    const priceText = structured?.priceText ?? priceCandidates[0] ?? this.extractPriceText(pageText);

    const mainImageUrl =
      structured?.mainImageUrl ??
      absolutizeUrl(
        pageUrl,
        $("meta[property='og:image']").attr("content") ??
          $(".swiper-slide img, .gallery img, .fotorama img, .property-gallery img, img")
            .first()
            .attr("src")
      ) ?? null;

    const imageUrls = resolveImageUrls(
      pageUrl,
      uniqStrings([
        ...(structured?.imageUrls ?? []),
        mainImageUrl,
        ...$("img")
          .map((_, element) => $(element).attr("src") ?? $(element).attr("data-src"))
          .get()
      ])
    );

    const specs = this.extractSpecsFromText([title, description, pageText].filter(Boolean).join(" "));
    const neighborhood =
      structured?.neighborhood ??
      cleanText(
        $(
          [
            "[class*='bairro']",
            "[data-field='bairro']",
            "[class*='localizacao']"
          ].join(",")
        )
          .first()
          .text()
      ) ?? this.extractNeighborhoodFromText([title, description, pageText].join(" "));

    const address =
      structured?.address ??
      cleanText(
        $(
          [
            "[class*='endereco']",
            "[data-field='endereco']",
            "[class*='address']"
          ].join(",")
        )
          .first()
          .text()
      ) ?? null;

    const cityCandidate =
      structured?.city ??
      cleanText(
        $(
          [
            "[class*='cidade']",
            "[data-field='cidade']",
            "[class*='city']"
          ].join(",")
        )
          .first()
          .text()
      );
    const scopedCity = this.source.city_scope.find((candidate) =>
      normalizeForSearch([cityCandidate, title, address, neighborhood, description].filter(Boolean).join(" ")).includes(
        normalizeForSearch(candidate)
      )
    );
    const city = scopedCity ?? cityCandidate ?? this.source.city_scope[0] ?? null;

    const stateCandidate =
      structured?.state ??
      cleanText(
        $(
          [
            "[class*='estado']",
            "[class*='uf']",
            "[data-field='estado']"
          ].join(",")
        )
          .first()
          .text()
      );
    const state = /\bpr\b/i.test([stateCandidate, address, neighborhood, title].filter(Boolean).join(" ")) ? "PR" : stateCandidate;

    const propertyTypeFromTitle = this.inferPropertyTypeFromText(title);
    const propertyTypeFromContent = this.inferPropertyTypeFromText([description, pageText].filter(Boolean).join(" "));
    const propertyType =
      propertyTypeFromTitle !== "desconhecido"
        ? propertyTypeFromTitle
        : structured?.propertyType ?? propertyTypeFromContent;
    const usageType = this.normalizeUsageType([structured?.usageType, title, description, address]);

    return {
      sourceId: this.source.id,
      sourceName: this.source.name,
      canonicalUrl: pageUrl,
      externalId: structured?.externalId ?? this.extractExternalIdFromText(pageText, pageUrl),
      title,
      transactionType: structured?.transactionType ?? "rent",
      propertyType,
      usageType,
      city: city ?? this.source.city_scope[0] ?? null,
      state: state ?? "PR",
      neighborhood,
      address,
      priceText,
      priceBrl: parseBrlValue(priceText),
      condoFeeText: this.extractLabeledValue(pageText, /condom[ií]nio/i),
      condoFeeBrl: parseBrlValue(this.extractLabeledValue(pageText, /condom[ií]nio/i)),
      iptuText: this.extractLabeledValue(pageText, /iptu/i),
      iptuBrl: parseBrlValue(this.extractLabeledValue(pageText, /iptu/i)),
      bedrooms: specs.bedrooms,
      suites: specs.suites,
      bathrooms: specs.bathrooms,
      parkingSpaces: specs.parkingSpaces,
      areaBuiltText: specs.areaBuiltText,
      areaBuiltM2: parseAreaM2(specs.areaBuiltText),
      areaTotalText: specs.areaTotalText,
      areaTotalM2: parseAreaM2(specs.areaTotalText),
      mainImageUrl,
      imageUrls,
      description,
      features: uniqStrings([
        ...(structured?.features ?? []),
        ...extractCanonicalFeatures([title, description, pageText]),
        ...$(
          [
            ".feature",
            "[class*='caracteristica']",
            "[class*='feature']",
            ".amenities li",
            ".property-features li",
            "[class*='amenit'] li"
          ].join(",")
        )
          .map((_, element) => cleanText($(element).text()))
          .get()
          .filter((value): value is string => Boolean(value && !this.isLikelyNoiseText(value)))
      ]),
      rawPayload: {
        ...(structured?.rawPayload ?? {}),
        htmlLength: html.length,
        title,
        extractedFrom: "detail_html"
      }
    };
  }

  protected mergeRecords(base: ScrapedPropertyRecord, detail: ScrapedPropertyRecord): ScrapedPropertyRecord {
    return {
      ...base,
      ...detail,
      externalId: detail.externalId ?? base.externalId,
      title: detail.title ?? base.title,
      transactionType: detail.transactionType ?? base.transactionType,
      propertyType: detail.propertyType ?? base.propertyType,
      usageType: detail.usageType ?? base.usageType,
      city: detail.city ?? base.city,
      state: detail.state ?? base.state,
      neighborhood: detail.neighborhood ?? base.neighborhood,
      address: detail.address ?? base.address,
      priceText: detail.priceText ?? base.priceText,
      priceBrl: detail.priceBrl ?? base.priceBrl,
      condoFeeText: detail.condoFeeText ?? base.condoFeeText,
      condoFeeBrl: detail.condoFeeBrl ?? base.condoFeeBrl,
      iptuText: detail.iptuText ?? base.iptuText,
      iptuBrl: detail.iptuBrl ?? base.iptuBrl,
      bedrooms: detail.bedrooms ?? base.bedrooms,
      suites: detail.suites ?? base.suites,
      bathrooms: detail.bathrooms ?? base.bathrooms,
      parkingSpaces: detail.parkingSpaces ?? base.parkingSpaces,
      areaBuiltText: detail.areaBuiltText ?? base.areaBuiltText,
      areaBuiltM2: detail.areaBuiltM2 ?? base.areaBuiltM2,
      areaTotalText: detail.areaTotalText ?? base.areaTotalText,
      areaTotalM2: detail.areaTotalM2 ?? base.areaTotalM2,
      mainImageUrl: detail.mainImageUrl ?? base.mainImageUrl,
      imageUrls: uniqStrings([...(base.imageUrls ?? []), ...(detail.imageUrls ?? [])]),
      description: detail.description ?? base.description,
      features: uniqStrings([...(base.features ?? []), ...(detail.features ?? [])]),
      rawPayload: {
        ...(base.rawPayload ?? {}),
        ...(detail.rawPayload ?? {})
      },
      detailHtml: detail.detailHtml ?? base.detailHtml,
      listingHtml: base.listingHtml ?? detail.listingHtml,
      isActive: detail.isActive ?? base.isActive ?? true
    };
  }

  protected dedupeScrapedRecords(records: ScrapedPropertyRecord[]): ScrapedPropertyRecord[] {
    const byUrl = new Map<string, ScrapedPropertyRecord>();

    for (const record of records) {
      const absolute = absolutizeUrl(this.source.base_url, record.canonicalUrl);
      if (!absolute) {
        continue;
      }

      const current = byUrl.get(absolute);
      const normalized = { ...record, canonicalUrl: absolute };
      byUrl.set(absolute, current ? this.mergeRecords(current, normalized) : normalized);
    }

    return [...byUrl.values()];
  }

  protected pickString(object: JsonLike, keys: string[]): string | null {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && cleanText(value)) {
        return cleanText(value);
      }
    }

    return null;
  }

  protected pickPrimitive(object: JsonLike, keys: string[]): string | number | boolean | null | undefined {
    for (const key of keys) {
      const value = object[key];
      if (["string", "number", "boolean"].includes(typeof value) || value === null) {
        return value as string | number | boolean | null;
      }
    }

    return undefined;
  }

  protected pickPrimitiveString(object: JsonLike, keys: string[]): string | null {
    const value = this.pickPrimitive(object, keys);
    return value === undefined || value === null ? null : String(value);
  }

  protected pickInteger(object: JsonLike, keys: string[]): number | null {
    const value = this.pickPrimitive(object, keys);
    return parseInteger(value === undefined ? null : String(value));
  }

  protected pickStringArray(object: JsonLike, keys: string[]): string[] {
    for (const key of keys) {
      const value = object[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
      }
    }

    return [];
  }

  protected extractPriceText(text: string): string | null {
    const match = text.match(/r\$\s*[\d\.\,]+(?:\s*\/\s*m[eê]s)?/i);
    return cleanText(match?.[0]) ?? null;
  }

  protected extractLabeledValue(text: string, labelPattern: RegExp): string | null {
    const lines = text.split(/\r?\n/).map((line) => cleanText(line)).filter(Boolean) as string[];
    for (const line of lines) {
      if (labelPattern.test(line)) {
        return this.extractPriceText(line) ?? line;
      }
    }

    return null;
  }

  protected extractExternalIdFromText(text: string, pageUrl: string): string {
    const byLabel = text.match(/(?:id do im[oó]vel|c[oó]digo|ref(?:er[eê]ncia)?)\s*[:\-]?\s*([a-z0-9\-]+)/i);
    if (byLabel?.[1]) {
      return byLabel[1];
    }

    const url = new URL(pageUrl);
    return url.pathname.split("/").filter(Boolean).at(-1) ?? pageUrl;
  }

  protected extractNeighborhoodFromText(text: string): string | null {
    const match = text.match(/(?:bairro|localiza[cç][aã]o)\s*[:\-]?\s*([a-z0-9\s\-\.\&]+)/i);
    return cleanText(match?.[1]) ?? null;
  }

  protected inferPropertyTypeFromText(text: string): string {
    const normalized = normalizeForSearch(text);

    if (normalized.includes("sobrado")) {
      return "sobrado";
    }

    if (normalized.includes("apartamento")) {
      return "apartamento";
    }

    if (normalized.includes("condominio")) {
      return "casa de condomínio";
    }

    if (normalized.includes("residencia")) {
      return "residência";
    }

    if (normalized.includes("casa")) {
      return "casa";
    }

    return "desconhecido";
  }

  protected extractSpecsFromText(text: string): {
    bedrooms: number | null;
    suites: number | null;
    bathrooms: number | null;
    parkingSpaces: number | null;
    areaBuiltText: string | null;
    areaTotalText: string | null;
  } {
    const normalized = text.replace(/\u00a0/g, " ");
    const bedrooms = parseInteger(normalized.match(/(\d+)\s*(?:quartos?|dormit[oó]rios?)/i)?.[1] ?? null);
    const suites = parseInteger(normalized.match(/(\d+)\s*s[uú]i(?:te|tes)/i)?.[1] ?? null);
    const bathrooms = parseInteger(normalized.match(/(\d+)\s*banheiros?/i)?.[1] ?? null);
    const parkingSpaces = parseInteger(normalized.match(/(\d+)\s*(?:vagas?|garagens?)/i)?.[1] ?? null);
    const areaBuiltText =
      cleanText(normalized.match(/(?:[áa]rea constru[ií]da|[áa]rea privativa)\s*[:\-]?\s*([\d\.\,]+\s*m[²2]?)/i)?.[1]) ??
      cleanText(normalized.match(/([\d\.\,]+\s*m[²2]?)\s*(?:de [áa]rea constru[ií]da|privativa)/i)?.[1]);
    const areaTotalText =
      cleanText(normalized.match(/(?:[áa]rea total|terreno)\s*[:\-]?\s*([\d\.\,]+\s*m[²2]?)/i)?.[1]) ??
      cleanText(normalized.match(/([\d\.\,]+\s*m[²2]?)\s*(?:de [áa]rea total|de terreno)/i)?.[1]);

    return {
      bedrooms,
      suites,
      bathrooms,
      parkingSpaces,
      areaBuiltText,
      areaTotalText
    };
  }
}
