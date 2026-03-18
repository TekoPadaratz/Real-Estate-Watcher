import type { CrawlResult } from "../../domain/property.js";
import type { CrawlOptions } from "../base/base-source-adapter.js";
import { BaseHttpAdapter } from "../base/base-http-adapter.js";

export class NalessoAdapter extends BaseHttpAdapter {
  protected override async collectRecords(options: CrawlOptions): Promise<CrawlResult> {
    const result = await super.collectRecords(options);

    return {
      ...result,
      properties: result.properties.filter((property) => {
        const title = property.title?.toLowerCase() ?? "";
        const description = property.description?.toLowerCase() ?? "";
        return title.includes("resid") || title.includes("casa") || description.includes("resid");
      })
    };
  }
}
