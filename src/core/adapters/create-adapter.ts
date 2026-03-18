import type { SourceDefinition } from "../config/sources.js";
import type { AdapterServices } from "./base/base-source-adapter.js";
import { BobergSapSourceAdapter } from "./sources/boberg-sap.adapter.js";
import { GandaraOliveiraSourceAdapter } from "./sources/gandara-oliveira.adapter.js";
import { MarkizeSourceAdapter } from "./sources/markize.adapter.js";
import { NalessoSourceAdapter } from "./sources/nalesso.adapter.js";
import { PadilhaFerrariSourceAdapter } from "./sources/padilha-ferrari.adapter.js";
import { PortalDoSolSourceAdapter } from "./sources/portal-do-sol.adapter.js";
import { SantaRosaSourceAdapter } from "./sources/santa-rosa.adapter.js";
import { VillaniSourceAdapter } from "./sources/villani.adapter.js";

export function createSourceAdapter(source: SourceDefinition, services: AdapterServices) {
  switch (source.id) {
    case "markize":
      return new MarkizeSourceAdapter(source, services);
    case "portal_do_sol":
      return new PortalDoSolSourceAdapter(source, services);
    case "santa_rosa":
      return new SantaRosaSourceAdapter(source, services);
    case "boberg_sap":
      return new BobergSapSourceAdapter(source, services);
    case "gandara_oliveira":
      return new GandaraOliveiraSourceAdapter(source, services);
    case "padilha_ferrari":
      return new PadilhaFerrariSourceAdapter(source, services);
    case "villani":
      return new VillaniSourceAdapter(source, services);
    case "nalesso":
      return new NalessoSourceAdapter(source, services);
    default:
      throw new Error(`Fonte não suportada: ${source.id}`);
  }
}
