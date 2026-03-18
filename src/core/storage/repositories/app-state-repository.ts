import { eq } from "drizzle-orm";
import type { AppDatabase, SqliteClient } from "../db.js";
import { appStateTable } from "../schema.js";

export class AppStateRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly client: SqliteClient
  ) {}

  async getValue(key: string): Promise<string | null> {
    const row = this.db.select().from(appStateTable).where(eq(appStateTable.key, key)).get();
    return row?.value ?? null;
  }

  async setValue(key: string, value: string, updatedAt: string): Promise<void> {
    this.db
      .insert(appStateTable)
      .values({
        key,
        value,
        updatedAt
      })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: {
          value,
          updatedAt
        }
      })
      .run();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.getValue(key);
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async setJson(key: string, value: unknown, updatedAt: string): Promise<void> {
    await this.setValue(key, JSON.stringify(value), updatedAt);
  }

  async getBootstrapStatus(): Promise<string> {
    return (await this.getValue("bootstrap_status")) ?? "not_started";
  }

  async markBootstrapStatus(status: "not_started" | "in_progress" | "completed", now: string): Promise<void> {
    await this.setValue("bootstrap_status", status, now);
  }

  async markBootstrapCompleted(now: string): Promise<void> {
    await this.markBootstrapStatus("completed", now);
    await this.setValue("bootstrap_completed_at", now, now);
  }

  async setLastGlobalScanAt(now: string): Promise<void> {
    await this.setValue("last_global_scan_at", now, now);
  }

  async tryAcquireGlobalScanLock(input: { token: string; now: string; expiresAt: string }): Promise<boolean> {
    const payload = JSON.stringify({
      token: input.token,
      acquiredAt: input.now,
      expiresAt: input.expiresAt
    });

    const result = this.client
      .prepare(
        `
        INSERT INTO app_state (key, value, updated_at)
        VALUES ('global_scan_lock', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        WHERE json_extract(app_state.value, '$.expiresAt') IS NULL
          OR json_extract(app_state.value, '$.expiresAt') <= excluded.updated_at
        `
      )
      .run(payload, input.now) as { changes?: number };

    return (result.changes ?? 0) > 0;
  }

  async releaseGlobalScanLock(token: string, now: string): Promise<void> {
    const current = await this.getJson<{ token?: string; expiresAt?: string }>("global_scan_lock");
    if (!current || current.token !== token) {
      return;
    }

    await this.setJson(
      "global_scan_lock",
      {
        token: null,
        releasedAt: now,
        expiresAt: now
      },
      now
    );
  }
}
