import type { AppEnv } from "../../../src/core/config/env.js";
import { resolveRuntimePaths } from "../../../src/core/config/runtime-paths.js";

export function createTestEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  const runtimePaths = resolveRuntimePaths(
    {
      NODE_ENV: "test",
      APP_CODE_DIR: process.cwd(),
      APP_DATA_DIR: "./data/test-runtime",
      APP_CACHE_DIR: "./data/test-runtime-cache",
      APP_DEBUG_DIR: "./data/test-runtime-debug",
      DATABASE_URL: "file:./data/test-runtime/app.db",
      PLAYWRIGHT_BROWSERS_PATH: "./data/test-runtime/pw-browsers"
    },
    {
      cwd: process.cwd(),
      platform: process.platform
    }
  );

  return {
    NODE_ENV: "test",
    TZ: "America/Sao_Paulo",
    APP_PORT: undefined,
    APP_ENV_FILE: undefined,
    APP_CODE_DIR: runtimePaths.codeDir,
    APP_CONFIG_DIR: runtimePaths.configDir,
    APP_DATA_DIR: runtimePaths.stateDir,
    APP_CACHE_DIR: runtimePaths.cacheDir,
    APP_DEBUG_DIR: runtimePaths.debugDir,
    APP_SCREENSHOTS_DIR: runtimePaths.screenshotsDir,
    APP_ARTIFACTS_DIR: runtimePaths.artifactsDir,
    APP_TMP_DIR: runtimePaths.tempDir,
    SEARCH_PROFILE_PATH: runtimePaths.searchProfilePath,
    SOURCES_CONFIG_PATH: runtimePaths.sourcesConfigPath,
    DATABASE_URL: runtimePaths.databaseUrl,
    DATABASE_PATH: runtimePaths.databasePath,
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "test-chat",
    LOG_LEVEL: "silent",
    CRAWL_INTERVAL_MINUTES: 60,
    GLOBAL_SCAN_LOCK_TTL_MINUTES: 120,
    DISPATCHER_IDLE_MS: 1000,
    HTTP_TIMEOUT_MS: 30_000,
    HTTP_MAX_PAGINATION_PAGES: 10,
    TELEGRAM_RATE_LIMIT_PER_MINUTE: 10,
    TELEGRAM_MIN_INTERVAL_MS: 6_000,
    PLAYWRIGHT_HEADLESS: true,
    PLAYWRIGHT_TIMEOUT_MS: 45_000,
    PLAYWRIGHT_BROWSERS_PATH: runtimePaths.playwrightBrowsersPath,
    BOOTSTRAP_ON_START: false,
    ENABLE_LIVE_SMOKE: false,
    RUNTIME_PATHS: runtimePaths,
    ...overrides
  };
}
