import { bootstrap } from "../app/bootstrap.js";
import { runScanCycle, runScheduler } from "../app/scheduler.js";
import { loadEnv } from "../core/config/env.js";

export async function runServiceCommand(sourceId?: string, intervalMinutes?: number) {
  const env = loadEnv();
  const effectiveIntervalMinutes = intervalMinutes ?? env.CRAWL_INTERVAL_MINUTES;
  const app = await bootstrap();
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.logger.info({ signal }, "Encerrando run-service.");
  };

  const sigintHandler = () => shutdown("SIGINT");
  const sigtermHandler = () => shutdown("SIGTERM");
  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);

  try {
    const dispatcherPromise = app.notificationDispatcher.runContinuously({
      shouldStop: () => shuttingDown,
      idleMs: app.env.DISPATCHER_IDLE_MS
    });

    const bootstrapStatus = await app.appStateRepository.getBootstrapStatus();
    let runImmediately = true;

    if (!sourceId && bootstrapStatus !== "completed") {
      if (!app.env.BOOTSTRAP_ON_START) {
        throw new Error(
          "Bootstrap ainda não concluído. Execute `pnpm app bootstrap` manualmente ou defina BOOTSTRAP_ON_START=true."
        );
      }

      await app.appStateRepository.markBootstrapStatus("in_progress", new Date().toISOString());
      await runScanCycle(app, { mode: "bootstrap" });
      runImmediately = false;
    }

    await runScheduler(app, {
      intervalMs: effectiveIntervalMinutes * 60_000,
      sourceId,
      mode: "watch",
      runImmediately,
      shouldStop: () => shuttingDown
    });

    await dispatcherPromise;
  } finally {
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
    await app.close();
  }
}
