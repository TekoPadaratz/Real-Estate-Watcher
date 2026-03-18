import { eq } from "drizzle-orm";
import type { SourceDefinition } from "../../config/sources.js";
import type { AppDatabase } from "../db.js";
import { sourcesTable } from "../schema.js";

export class SourceRepository {
  constructor(private readonly db: AppDatabase) {}

  async syncFromConfig(sources: SourceDefinition[], now: string): Promise<void> {
    for (const source of sources) {
      this.db
        .insert(sourcesTable)
        .values({
          id: source.id,
          name: source.name,
          enabled: source.enabled ? 1 : 0,
          strategy: source.strategy,
          platformFamily: source.platform_family,
          baseUrl: source.base_url,
          configJson: JSON.stringify(source),
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: sourcesTable.id,
          set: {
            name: source.name,
            enabled: source.enabled ? 1 : 0,
            strategy: source.strategy,
            platformFamily: source.platform_family,
            baseUrl: source.base_url,
            configJson: JSON.stringify(source),
            updatedAt: now
          }
        })
        .run();
    }
  }

  async markCrawled(sourceId: string, now: string): Promise<void> {
    this.db
      .update(sourcesTable)
      .set({
        lastCrawledAt: now,
        updatedAt: now
      })
      .where(eq(sourcesTable.id, sourceId))
      .run();
  }
}
