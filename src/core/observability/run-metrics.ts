import type { SourceRunMetrics } from "../domain/source-run.js";

export function createRunMetrics(sourceId: string): SourceRunMetrics {
  return {
    sourceId,
    discovered: 0,
    stored: 0,
    queued: 0,
    filteredOut: 0,
    warnings: []
  };
}
