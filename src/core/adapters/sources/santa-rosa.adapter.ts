import type { SourceDefinition } from "../../config/sources.js";
import type { AdapterServices } from "../base/base-source-adapter.js";
import { SiteParaImobiliariasAdapter } from "../families/site-para-imobiliarias.adapter.js";

export class SantaRosaSourceAdapter extends SiteParaImobiliariasAdapter {
  constructor(source: SourceDefinition, services: AdapterServices) {
    super(source, services);
  }
}
