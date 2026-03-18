import type { SourceDefinition } from "../../config/sources.js";
import type { AdapterServices } from "../base/base-source-adapter.js";
import { ImobziAdapter } from "../families/imobzi.adapter.js";

export class PadilhaFerrariSourceAdapter extends ImobziAdapter {
  constructor(source: SourceDefinition, services: AdapterServices) {
    super(source, services);
  }
}
