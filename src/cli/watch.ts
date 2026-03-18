import { bootstrap } from "../app/bootstrap.js";
import { runScheduler } from "../app/scheduler.js";
import { loadEnv } from "../core/config/env.js";

export async function runWatchCommand(sourceId?: string, intervalMinutes?: number) {
  const env = loadEnv();
  const effectiveIntervalMinutes = intervalMinutes ?? env.CRAWL_INTERVAL_MINUTES;
  const app = await bootstrap();
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.logger.info({ signal }, "Encerrando watch.");
  };

  const sigintHandler = () => shutdown("SIGINT");
  const sigtermHandler = () => shutdown("SIGTERM");
  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);

  try {
    await runScheduler(app, {
      intervalMs: effectiveIntervalMinutes * 60_000,
      sourceId,
      mode: "watch",
      runImmediately: true,
      shouldStop: () => shuttingDown
    });
  } finally {
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
    await app.close();
  }
}
