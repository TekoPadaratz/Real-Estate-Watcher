import { randomUUID } from "node:crypto";
import type { AppContext } from "./bootstrap.js";
import type { CrawlRunMode } from "../core/domain/source-run.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface ScanCycleOptions {
  sourceId?: string;
  mode: CrawlRunMode;
}

export async function runScanCycle(app: AppContext, options: ScanCycleOptions): Promise<void> {
  if (options.sourceId) {
    await app.crawlerService.crawlSource(options.sourceId, {}, options.mode);
    await app.appStateRepository.setLastGlobalScanAt(new Date().toISOString());
    return;
  }

  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + app.env.GLOBAL_SCAN_LOCK_TTL_MINUTES * 60_000).toISOString();
  const acquired = await app.appStateRepository.tryAcquireGlobalScanLock({
    token,
    now: now.toISOString(),
    expiresAt
  });

  if (!acquired) {
    app.logger.warn({ mode: options.mode }, "Lock global de scan ocupado. Ciclo ignorado.");
    return;
  }

  try {
    const summary = await app.crawlerService.crawlAll({}, options.mode);
    await app.appStateRepository.setLastGlobalScanAt(new Date().toISOString());
    if (summary.failures.length > 0) {
      app.logger.warn({ failures: summary.failures, mode: options.mode }, "Ciclo global concluído com falhas isoladas.");
    }
  } finally {
    await app.appStateRepository.releaseGlobalScanLock(token, new Date().toISOString());
  }
}

export interface SchedulerOptions {
  intervalMs: number;
  sourceId?: string;
  mode: CrawlRunMode;
  runImmediately?: boolean;
  shouldStop: () => boolean;
}

export async function runScheduler(app: AppContext, options: SchedulerOptions): Promise<void> {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error(`Intervalo inválido para scheduler: ${options.intervalMs}`);
  }

  let firstCycle = true;

  while (!options.shouldStop()) {
    if (options.runImmediately || !firstCycle) {
      try {
        await runScanCycle(app, {
          sourceId: options.sourceId,
          mode: options.mode
        });
      } catch (error) {
        app.logger.error({ err: error, mode: options.mode }, "Falha no loop do scheduler.");
      }
    }

    if (options.shouldStop()) {
      break;
    }

    firstCycle = false;
    await sleep(options.intervalMs);
  }
}
