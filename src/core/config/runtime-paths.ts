import { mkdir } from "node:fs/promises";
import { posix, win32 } from "node:path";

export interface RuntimePaths {
  mode: "local" | "production" | "test";
  codeDir: string;
  configDir: string;
  envFilePath: string;
  stateDir: string;
  cacheDir: string;
  debugDir: string;
  screenshotsDir: string;
  artifactsDir: string;
  tempDir: string;
  databasePath: string;
  databaseUrl: string;
  searchProfilePath: string;
  sourcesConfigPath: string;
  playwrightBrowsersPath: string;
}

export interface RuntimePathsInput {
  NODE_ENV?: string;
  APP_ENV_FILE?: string;
  APP_CODE_DIR?: string;
  APP_CONFIG_DIR?: string;
  APP_DATA_DIR?: string;
  APP_CACHE_DIR?: string;
  APP_DEBUG_DIR?: string;
  APP_SCREENSHOTS_DIR?: string;
  APP_ARTIFACTS_DIR?: string;
  APP_TMP_DIR?: string;
  SEARCH_PROFILE_PATH?: string;
  SOURCES_CONFIG_PATH?: string;
  DATABASE_URL?: string;
  PLAYWRIGHT_BROWSERS_PATH?: string;
}

type PathApi = typeof posix | typeof win32;

function getPathApi(platform: NodeJS.Platform): PathApi {
  return platform === "win32" ? win32 : posix;
}

function inferMode(nodeEnv: string | undefined): RuntimePaths["mode"] {
  if (nodeEnv === "production") {
    return "production";
  }

  if (nodeEnv === "test") {
    return "test";
  }

  return "local";
}

function resolvePath(pathApi: PathApi, cwd: string, value: string): string {
  if (pathApi.isAbsolute(value)) {
    return pathApi.normalize(value);
  }

  return pathApi.resolve(cwd, value);
}

function buildFileUrl(pathApi: PathApi, filePath: string, platform: NodeJS.Platform): string {
  const normalized = pathApi.normalize(filePath);
  if (platform === "win32") {
    return `file:/${normalized.replace(/\\/g, "/")}`;
  }

  return `file:${normalized}`;
}

export function parseDatabaseUrlToPath(input: {
  databaseUrl: string;
  cwd: string;
  platform?: NodeJS.Platform;
}): string {
  const platform = input.platform ?? process.platform;
  const pathApi = getPathApi(platform);
  const value = input.databaseUrl.trim();

  if (!value.startsWith("file:")) {
    throw new Error(`DATABASE_URL inválida para SQLite: ${value}`);
  }

  const rawPath = decodeURIComponent(value.slice("file:".length));
  if (!rawPath) {
    throw new Error(`DATABASE_URL sem caminho válido: ${value}`);
  }

  if (platform === "win32") {
    const normalized = rawPath.startsWith("/") && /^[A-Za-z]:/.test(rawPath.slice(1)) ? rawPath.slice(1) : rawPath;
    return resolvePath(pathApi, input.cwd, normalized);
  }

  return resolvePath(pathApi, input.cwd, rawPath);
}

export function resolveRuntimePaths(
  input: RuntimePathsInput = {},
  options: {
    cwd?: string;
    platform?: NodeJS.Platform;
  } = {}
): RuntimePaths {
  const platform =
    options.platform ??
    (process.platform === "win32" && input.NODE_ENV === "production" ? "linux" : process.platform);
  const pathApi = getPathApi(platform);
  const rawCwd = options.cwd ?? process.cwd();
  const cwd = pathApi.isAbsolute(rawCwd) ? pathApi.normalize(rawCwd) : pathApi.resolve(rawCwd);
  const mode = inferMode(input.NODE_ENV);
  const defaultCodeDir = mode === "production" ? "/opt/real-estate-watcher" : cwd;
  const codeDir = resolvePath(pathApi, cwd, input.APP_CODE_DIR ?? defaultCodeDir);
  const configDir = resolvePath(pathApi, cwd, input.APP_CONFIG_DIR ?? pathApi.join(codeDir, "config"));
  const defaultEnvFilePath = mode === "production" ? "/etc/real-estate-watcher/real-estate-watcher.env" : pathApi.join(codeDir, ".env");
  const envFilePath = resolvePath(pathApi, cwd, input.APP_ENV_FILE ?? defaultEnvFilePath);
  const defaultStateDir = mode === "production" ? "/var/lib/real-estate-watcher" : pathApi.join(codeDir, "data");
  const stateDir = resolvePath(pathApi, cwd, input.APP_DATA_DIR ?? defaultStateDir);
  const defaultCacheDir = mode === "production" ? "/var/cache/real-estate-watcher" : pathApi.join(codeDir, ".cache");
  const cacheDir = resolvePath(pathApi, cwd, input.APP_CACHE_DIR ?? defaultCacheDir);
  const debugDir = resolvePath(pathApi, cwd, input.APP_DEBUG_DIR ?? pathApi.join(stateDir, "debug"));
  const screenshotsDir = resolvePath(pathApi, cwd, input.APP_SCREENSHOTS_DIR ?? pathApi.join(debugDir, "screenshots"));
  const artifactsDir = resolvePath(pathApi, cwd, input.APP_ARTIFACTS_DIR ?? pathApi.join(debugDir, "artifacts"));
  const tempDir = resolvePath(pathApi, cwd, input.APP_TMP_DIR ?? pathApi.join(cacheDir, "tmp"));
  const fallbackDatabasePath = pathApi.join(stateDir, "app.db");
  const databaseUrl = input.DATABASE_URL ?? buildFileUrl(pathApi, fallbackDatabasePath, platform);
  const databasePath = parseDatabaseUrlToPath({
    databaseUrl,
    cwd,
    platform
  });
  const searchProfilePath = resolvePath(pathApi, cwd, input.SEARCH_PROFILE_PATH ?? pathApi.join(configDir, "search-profile.yaml"));
  const sourcesConfigPath = resolvePath(pathApi, cwd, input.SOURCES_CONFIG_PATH ?? pathApi.join(configDir, "sources.yaml"));
  const playwrightBrowsersPath = resolvePath(
    pathApi,
    cwd,
    input.PLAYWRIGHT_BROWSERS_PATH ?? pathApi.join(stateDir, "pw-browsers")
  );

  return {
    mode,
    codeDir,
    configDir,
    envFilePath,
    stateDir,
    cacheDir,
    debugDir,
    screenshotsDir,
    artifactsDir,
    tempDir,
    databasePath,
    databaseUrl,
    searchProfilePath,
    sourcesConfigPath,
    playwrightBrowsersPath
  };
}

export async function ensureRuntimeDirectories(paths: RuntimePaths): Promise<void> {
  for (const directory of [
    paths.stateDir,
    paths.cacheDir,
    paths.debugDir,
    paths.screenshotsDir,
    paths.artifactsDir,
    paths.tempDir
  ]) {
    await mkdir(directory, { recursive: true });
  }
}
