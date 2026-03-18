import { existsSync } from "node:fs";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";
import { resolveRuntimePaths, type RuntimePaths } from "./runtime-paths.js";

function booleanFromEnv(defaultValue: boolean) {
  return z
    .union([z.boolean(), z.string(), z.undefined()])
    .transform((value) => {
      if (value === undefined) {
        return defaultValue;
      }

      if (typeof value === "boolean") {
        return value;
      }

      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    });
}

function buildEnvFileCandidates(input: NodeJS.ProcessEnv): string[] {
  const candidates = [input.APP_ENV_FILE, ".env"];
  const nodeEnv = input.NODE_ENV ?? process.env.NODE_ENV;
  if (nodeEnv === "production") {
    candidates.push("/etc/real-estate-watcher/real-estate-watcher.env");
  }

  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

function loadEnvironmentFile(input: NodeJS.ProcessEnv): void {
  for (const candidate of buildEnvFileCandidates(input)) {
    if (!existsSync(candidate)) {
      continue;
    }

    loadDotEnv({
      path: candidate,
      override: false
    });
    return;
  }
}

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TZ: z.string().default("America/Sao_Paulo"),
  APP_PORT: z.coerce.number().int().positive().optional(),
  APP_ENV_FILE: z.string().optional(),
  APP_CODE_DIR: z.string().optional(),
  APP_CONFIG_DIR: z.string().optional(),
  APP_DATA_DIR: z.string().optional(),
  APP_CACHE_DIR: z.string().optional(),
  APP_DEBUG_DIR: z.string().optional(),
  APP_SCREENSHOTS_DIR: z.string().optional(),
  APP_ARTIFACTS_DIR: z.string().optional(),
  APP_TMP_DIR: z.string().optional(),
  SEARCH_PROFILE_PATH: z.string().optional(),
  SOURCES_CONFIG_PATH: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  CRAWL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  GLOBAL_SCAN_LOCK_TTL_MINUTES: z.coerce.number().int().positive().default(120),
  DISPATCHER_IDLE_MS: z.coerce.number().int().positive().default(1000),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  HTTP_MAX_PAGINATION_PAGES: z.coerce.number().int().positive().default(10),
  TELEGRAM_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  PLAYWRIGHT_HEADLESS: booleanFromEnv(true),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  PLAYWRIGHT_BROWSERS_PATH: z.string().optional(),
  BOOTSTRAP_ON_START: booleanFromEnv(false),
  ENABLE_LIVE_SMOKE: booleanFromEnv(false)
});

type RawAppEnv = z.infer<typeof rawEnvSchema>;

export interface AppEnv extends RawAppEnv {
  DATABASE_URL: string;
  DATABASE_PATH: string;
  RUNTIME_PATHS: RuntimePaths;
  TELEGRAM_MIN_INTERVAL_MS: number;
}

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  loadEnvironmentFile(input);
  const merged = {
    ...process.env,
    ...input
  };
  const raw = rawEnvSchema.parse(merged);
  const runtimePaths = resolveRuntimePaths(raw);
  const databaseUrl = raw.DATABASE_URL ?? runtimePaths.databaseUrl;
  const env: AppEnv = {
    ...raw,
    DATABASE_URL: databaseUrl,
    DATABASE_PATH: runtimePaths.databasePath,
    RUNTIME_PATHS: runtimePaths,
    TELEGRAM_MIN_INTERVAL_MS: Math.max(1_000, Math.ceil(60_000 / raw.TELEGRAM_RATE_LIMIT_PER_MINUTE))
  };

  process.env.PLAYWRIGHT_BROWSERS_PATH = runtimePaths.playwrightBrowsersPath;
  process.env.TZ = env.TZ;

  return env;
}
