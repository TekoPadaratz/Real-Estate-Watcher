import type { Page } from "playwright";
import type { SourceDefinition } from "../../config/sources.js";
import type { AdapterServices } from "../base/base-source-adapter.js";
import { ImoFlowAdapter } from "../families/imoflow.adapter.js";

export class VillaniSourceAdapter extends ImoFlowAdapter {
  constructor(source: SourceDefinition, services: AdapterServices) {
    super(source, services);
  }

  protected override async attachNetworkInterception(page: Page, interceptedPayloads: unknown[]): Promise<void> {
    await super.attachNetworkInterception(page, interceptedPayloads);

    page.on("response", async (response) => {
      const contentType = response.headers()["content-type"] ?? "";
      if (!/json/i.test(contentType)) {
        return;
      }

      await this.services.debugDumps.writeText(
        this.source.id,
        this.source.id,
        "villani-json-endpoint",
        response.url()
      );
    });
  }
}
