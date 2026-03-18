import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { AppContext } from "../../app/bootstrap.js";

export interface HealthcheckResult {
  ok: boolean;
  bootstrapStatus: string;
  pendingQueue: number;
  runtimeMode: string;
  details: string[];
}

async function assertWritableDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await access(directory, constants.W_OK);
  const probePath = join(directory, `.healthcheck-${process.pid}-${Date.now()}`);
  await writeFile(probePath, "ok", "utf8");
  await rm(probePath, { force: true });
}

export async function runHealthcheck(app: AppContext): Promise<HealthcheckResult> {
  const details: string[] = [];
  const runtimePaths = app.env.RUNTIME_PATHS;
  details.push(`db=${app.env.DATABASE_PATH}`);

  await assertWritableDirectory(runtimePaths.stateDir);
  details.push(`state=${runtimePaths.stateDir}`);

  await assertWritableDirectory(runtimePaths.cacheDir);
  details.push(`cache=${runtimePaths.cacheDir}`);

  await assertWritableDirectory(runtimePaths.debugDir);
  details.push(`debug=${runtimePaths.debugDir}`);

  const bootstrapStatus = await app.appStateRepository.getBootstrapStatus();
  details.push(`bootstrap=${bootstrapStatus}`);

  const pendingQueue = await app.notificationQueueRepository.countPendingReady(new Date().toISOString());
  details.push(`queue_ready=${pendingQueue}`);

  if (!app.telegramService.isConfigured()) {
    throw new Error("Telegram não configurado no ambiente.");
  }
  details.push("telegram=configured");

  return {
    ok: true,
    bootstrapStatus,
    pendingQueue,
    runtimeMode: app.env.RUNTIME_PATHS.mode,
    details
  };
}
