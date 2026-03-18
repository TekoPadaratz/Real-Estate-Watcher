import got from "got";
import type { SourceDefinition } from "../../config/sources.js";
import type { CrawlResult, ScrapedPropertyRecord } from "../../domain/property.js";
import { parseAreaM2, parseBrlValue, parseInteger } from "../../extraction/price-parser.js";
import { DEFAULT_LINUX_USER_AGENT } from "../../http/user-agent.js";
import { UniversalSoftwareAdapter } from "../families/universal-software.adapter.js";
import type { AdapterServices, CrawlOptions } from "../base/base-source-adapter.js";

interface MarkizeApiItem extends Record<string, unknown> {
  codigo: number;
  titulo: string;
  finalidade: string;
  tipo: string;
  tipo2?: string | null;
  valor?: string | null;
  valorminimo?: string | null;
  valormaximo?: string | null;
  valorcondominio?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  endereco?: string | null;
  numero?: string | null;
  numeroquartos?: string | null;
  numerosuites?: string | null;
  numerobanhos?: string | null;
  numerovagas?: string | null;
  areaprincipal?: string | null;
  arealote?: string | null;
  urlfotoprincipalp?: string | null;
  descricao?: string | null;
  fotos?: Array<{ urlp?: string | null }>;
}

interface MarkizeApiResponse {
  quantidade: number;
  lista: MarkizeApiItem[];
}

export class MarkizeSourceAdapter extends UniversalSoftwareAdapter {
  constructor(source: SourceDefinition, services: AdapterServices) {
    super(source, services);
  }

  protected override async collectRecords(options: CrawlOptions): Promise<CrawlResult> {
    const warnings: string[] = [];
    const properties: ScrapedPropertyRecord[] = [];
    const pageSize = 20;
    let totalPages = 1;
    const maxPages = this.services.env.HTTP_MAX_PAGINATION_PAGES;

    for (let page = 1; page <= totalPages && page <= maxPages; page += 1) {
      const payload = this.buildAjaxPayload(page);
      const response = await got
        .post(new URL("/imoveis/ajax/", this.source.base_url).toString(), {
          form: payload,
          timeout: {
            request: this.services.env.HTTP_TIMEOUT_MS
          },
          headers: {
            "user-agent": DEFAULT_LINUX_USER_AGENT,
            "x-requested-with": "XMLHttpRequest",
            accept: "application/json"
          },
          retry: {
            limit: 2,
            methods: ["GET", "POST"]
          },
          responseType: "json"
        })
        .json<MarkizeApiResponse>();

      totalPages = Math.max(1, Math.ceil((response.quantidade || response.lista.length) / pageSize));
      if (response.lista.length === 0) {
        break;
      }

      for (const item of response.lista) {
        if (!this.isResidentialCandidate(item)) {
          continue;
        }

        const detailUrl = new URL(`/imovel/${item.titulo}/${item.codigo}`, this.source.base_url).toString();
        const baseRecord: ScrapedPropertyRecord = {
          sourceId: this.source.id,
          sourceName: this.source.name,
          externalId: String(item.codigo),
          canonicalUrl: detailUrl,
          title: `${item.tipo ?? "Imóvel"} - ${item.bairro ?? item.cidade ?? "Santo Antônio da Platina"}`,
          transactionType: "rent",
          propertyType: item.tipo2 || item.tipo,
          usageType: /comercial/i.test(item.tipo ?? "") ? "commercial" : "residential",
          city: item.cidade ?? null,
          state: item.estado ?? null,
          neighborhood: item.bairro ?? null,
          address: [item.endereco, item.numero].filter(Boolean).join(", ") || null,
          priceText: item.valor ?? item.valorminimo ?? item.valormaximo ?? null,
          priceBrl: parseBrlValue(item.valor ?? item.valorminimo ?? item.valormaximo ?? null),
          condoFeeText: item.valorcondominio ?? null,
          condoFeeBrl: parseBrlValue(item.valorcondominio ?? null),
          bedrooms: parseInteger(item.numeroquartos ?? null),
          suites: parseInteger(item.numerosuites ?? null),
          bathrooms: parseInteger(item.numerobanhos ?? null),
          parkingSpaces: parseInteger(item.numerovagas ?? null),
          areaBuiltText: item.areaprincipal ?? null,
          areaBuiltM2: parseAreaM2(item.areaprincipal ?? null),
          areaTotalText: item.arealote ?? null,
          areaTotalM2: parseAreaM2(item.arealote ?? null),
          mainImageUrl: item.urlfotoprincipalp ?? null,
          imageUrls: (item.fotos ?? []).map((foto) => foto.urlp).filter((url): url is string => Boolean(url)),
          description: item.descricao ?? null,
          rawPayload: item
        };

        try {
          const html = await this.fetchHtml(detailUrl);
          const detail = this.extractDetailRecord(this.createCheerio(html), detailUrl, html);
          detail.detailHtml = html;
          const merged = this.mergeRecords(baseRecord, detail);
          merged.propertyType = baseRecord.propertyType;
          merged.usageType = baseRecord.usageType;
          merged.priceText = baseRecord.priceText ?? merged.priceText;
          merged.priceBrl = baseRecord.priceBrl ?? merged.priceBrl;
          properties.push(merged);
        } catch (error) {
          warnings.push(`detail_failed:${detailUrl}:${error instanceof Error ? error.message : String(error)}`);
          properties.push(baseRecord);
        }

        if (options.maxListings && properties.length >= options.maxListings) {
          return {
            sourceId: this.source.id,
            sourceName: this.source.name,
            properties: this.dedupeScrapedRecords(properties),
            zeroResultsMessage: properties.length === 0 ? "0 resultados" : null,
            warnings
          };
        }
      }
    }

    if (totalPages > maxPages) {
      warnings.push(`pagination_limit_reached:${this.source.id}:${maxPages}`);
    }

    return {
      sourceId: this.source.id,
      sourceName: this.source.name,
      properties: this.dedupeScrapedRecords(properties),
      zeroResultsMessage: properties.length === 0 ? "0 resultados" : null,
      warnings
    };
  }

  private buildAjaxPayload(page: number): Record<string, string> {
    return {
      "imovel[finalidade]": "aluguel",
      "imovel[codigounidade]": "",
      "imovel[codigosimoveis]": "",
      "imovel[codigoTipo][codigo][]": "0",
      "imovel[codigoTipo][nome][]": "imoveis",
      "imovel[codigocidade]": "todas-as-cidades",
      "imovel[codigoregiao]": "0",
      "imovel[codigosbairros]": "0",
      "imovel[endereco]": "0",
      "imovel[numeroquartos]": "0-quartos",
      "imovel[numerovagas]": "0-vaga-ou-mais",
      "imovel[numerobanhos]": "0-banheiro-ou-mais",
      "imovel[numerosuite]": "0-suite-ou-mais",
      "imovel[numerovaranda]": "0",
      "imovel[numeroelevador]": "0",
      "imovel[valorde]": "0",
      "imovel[valorate]": "0",
      "imovel[areade]": "0",
      "imovel[areaate]": "0",
      "imovel[extras]": "0",
      "imovel[extends]": "false",
      "imovel[mobiliado]": "false",
      "imovel[dce]": "false",
      "imovel[piscina]": "false",
      "imovel[sauna]": "false",
      "imovel[salaofestas]": "false",
      "imovel[academia]": "false",
      "imovel[boxDespejo]": "false",
      "imovel[portaria24h]": "false",
      "imovel[aceitafinanciamento]": "false",
      "imovel[arealazer]": "false",
      "imovel[quartoqtdeexata]": "false",
      "imovel[vagaqtdexata]": "false",
      "imovel[destaque]": "0",
      "imovel[opcaoimovel]": "4",
      "imovel[retornomapa]": "false",
      "imovel[retornomapaapp]": "false",
      "imovel[numeropagina]": String(page),
      "imovel[numeroregistros]": "20",
      "imovel[ordenacao]": "valordesc",
      "imovel[pagina]": String(page),
      "imovel[codigocondominio]": "0",
      "imovel[condominio][]": "todos-os-condominios"
    };
  }

  private isResidentialCandidate(item: MarkizeApiItem): boolean {
    const type = `${item.tipo ?? ""} ${item.tipo2 ?? ""}`.toLowerCase();
    if (/apartamento|kitnet|kitinete|comercial|sala|barrac|terreno|lote|rural/.test(type)) {
      return false;
    }

    return /casa|sobrado|resid/.test(type);
  }
}
