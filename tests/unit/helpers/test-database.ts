import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createDatabase } from "../../../src/core/storage/db.js";
import { resolveRuntimePaths } from "../../../src/core/config/runtime-paths.js";
import { createTestEnv } from "./test-env.js";

export async function createTestDatabase() {
  const tempDir = await mkdtemp(resolve("data/test-db-"));
  const dbPath = join(tempDir, "app.db");
  const runtimePaths = resolveRuntimePaths(
    {
      NODE_ENV: "test",
      APP_CODE_DIR: process.cwd(),
      APP_DATA_DIR: tempDir,
      APP_CACHE_DIR: join(tempDir, "cache"),
      APP_DEBUG_DIR: join(tempDir, "debug"),
      DATABASE_URL: `file:${dbPath}`,
      PLAYWRIGHT_BROWSERS_PATH: join(tempDir, "pw-browsers")
    },
    {
      cwd: process.cwd(),
      platform: process.platform
    }
  );
  const env = createTestEnv({
    APP_CODE_DIR: runtimePaths.codeDir,
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
    PLAYWRIGHT_BROWSERS_PATH: runtimePaths.playwrightBrowsersPath,
    RUNTIME_PATHS: runtimePaths
  });
  const context = await createDatabase(env);

  return {
    ...context,
    env,
    dbPath,
    async cleanup() {
      context.client.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}
