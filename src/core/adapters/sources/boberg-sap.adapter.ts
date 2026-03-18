import type { SourceDefinition } from "../../config/sources.js";
import type { AdapterServices } from "../base/base-source-adapter.js";
import { FlexproAdapter } from "../families/flexpro.adapter.js";

export class BobergSapSourceAdapter extends FlexproAdapter {
  constructor(source: SourceDefinition, services: AdapterServices) {
    super(source, services);
  }
}
