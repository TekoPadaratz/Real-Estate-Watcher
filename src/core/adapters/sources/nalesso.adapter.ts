import type { SourceDefinition } from "../../config/sources.js";
import type { AdapterServices } from "../base/base-source-adapter.js";
import { NalessoAdapter } from "../families/nalesso.adapter.js";

export class NalessoSourceAdapter extends NalessoAdapter {
  constructor(source: SourceDefinition, services: AdapterServices) {
    super(source, services);
  }
}
