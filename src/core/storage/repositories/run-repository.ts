import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { CrawlRunMode, SourceRunMetrics, SourceRunStatus } from "../../domain/source-run.js";
import type { AppDatabase } from "../db.js";
import { crawlRunsTable } from "../schema.js";

export class RunRepository {
  constructor(private readonly db: AppDatabase) {}

  async startRun(sourceId: string, mode: CrawlRunMode, startedAt: string): Promise<string> {
    const id = randomUUID();
    this.db
      .insert(crawlRunsTable)
      .values({
        id,
        sourceId,
        mode,
        startedAt,
        status: "started",
        metricsJson: JSON.stringify({
          sourceId,
          discovered: 0,
          stored: 0,
          queued: 0,
          filteredOut: 0,
          warnings: []
        })
      })
      .run();
    return id;
  }

  async finishRun(
    id: string,
    input: {
      status: SourceRunStatus;
      finishedAt: string;
      metrics: SourceRunMetrics;
      errorMessage?: string | null;
    }
  ): Promise<void> {
    this.db
      .update(crawlRunsTable)
      .set({
        status: input.status,
        finishedAt: input.finishedAt,
        metricsJson: JSON.stringify(input.metrics),
        errorMessage: input.errorMessage ?? null
      })
      .where(eq(crawlRunsTable.id, id))
      .run();
  }
}
