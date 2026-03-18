import { afterEach, describe, expect, it } from "vitest";
import { AppStateRepository } from "../../src/core/storage/repositories/app-state-repository.js";
import { NotificationQueueRepository } from "../../src/core/storage/repositories/notification-queue-repository.js";
import { runHealthcheck } from "../../src/core/health/healthcheck.js";
import { createTestDatabase } from "./helpers/test-database.js";

describe("healthcheck", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it("valida banco, app_state, fila e diretórios de runtime", async () => {
    const database = await createTestDatabase();
    cleanups.push(() => database.cleanup());

    const app = {
      env: database.env,
      appStateRepository: new AppStateRepository(database.db, database.client),
      notificationQueueRepository: new NotificationQueueRepository(database.db),
      telegramService: {
        isConfigured: () => true
      }
    };

    const result = await runHealthcheck(app as any);

    expect(result.ok).toBe(true);
    expect(result.runtimeMode).toBe("test");
    expect(result.bootstrapStatus).toBe("not_started");
    expect(result.pendingQueue).toBe(0);
    expect(result.details.some((item) => item.startsWith("db="))).toBe(true);
  });
});
