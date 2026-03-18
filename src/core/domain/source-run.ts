export type CrawlRunMode = "bootstrap" | "watch" | "manual";
export type SourceRunStatus = "started" | "completed" | "failed";

export interface SourceRunMetrics {
  sourceId: string;
  discovered: number;
  stored: number;
  queued: number;
  filteredOut: number;
  warnings: string[];
}

export interface SourceRunRecord {
  id: string;
  sourceId: string;
  mode: CrawlRunMode;
  startedAt: string;
  finishedAt?: string | null;
  status: SourceRunStatus;
  metrics: SourceRunMetrics;
  errorMessage?: string | null;
}
