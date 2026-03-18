import { bootstrap } from "../app/bootstrap.js";
import { runScanCycle } from "../app/scheduler.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runBootstrapCommand() {
  const app = await bootstrap();
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.logger.info({ signal }, "Encerrando bootstrap.");
  };

  const sigintHandler = () => shutdown("SIGINT");
  const sigtermHandler = () => shutdown("SIGTERM");
  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);

  try {
    const now = new Date().toISOString();
    await app.appStateRepository.markBootstrapStatus("in_progress", now);
    await runScanCycle(app, { mode: "bootstrap" });

    while (!shuttingDown) {
      const remainingInitial = await app.notificationQueueRepository.countActiveByEventType("initial");
      if (remainingInitial === 0) {
        await app.appStateRepository.markBootstrapCompleted(new Date().toISOString());
        break;
      }

      const processed = await app.notificationDispatcher.dispatchOnce();
      if (!processed) {
        await sleep(app.env.DISPATCHER_IDLE_MS);
      }
    }
  } finally {
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
    await app.close();
  }
}
