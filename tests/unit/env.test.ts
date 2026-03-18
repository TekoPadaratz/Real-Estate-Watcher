import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/core/config/env.js";

describe("env", () => {
  it("parseia o env de produção e resolve DATABASE_URL para path absoluto Linux", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      TZ: "America/Sao_Paulo",
      APP_CODE_DIR: "/opt/real-estate-watcher",
      APP_CONFIG_DIR: "/opt/real-estate-watcher/config",
      APP_ENV_FILE: "/etc/real-estate-watcher/real-estate-watcher.env",
      APP_DATA_DIR: "/var/lib/real-estate-watcher",
      APP_CACHE_DIR: "/var/cache/real-estate-watcher",
      APP_DEBUG_DIR: "/var/lib/real-estate-watcher/debug",
      DATABASE_URL: "file:/var/lib/real-estate-watcher/app.db",
      PLAYWRIGHT_BROWSERS_PATH: "/var/lib/real-estate-watcher/pw-browsers",
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_CHAT_ID: "chat",
      TELEGRAM_RATE_LIMIT_PER_MINUTE: "10",
      BOOTSTRAP_ON_START: "true",
      ENABLE_LIVE_SMOKE: "false"
    });

    expect(env.NODE_ENV).toBe("production");
    expect(env.DATABASE_URL).toBe("file:/var/lib/real-estate-watcher/app.db");
    expect(env.DATABASE_PATH).toBe("/var/lib/real-estate-watcher/app.db");
    expect(env.RUNTIME_PATHS.stateDir).toBe("/var/lib/real-estate-watcher");
    expect(env.TELEGRAM_MIN_INTERVAL_MS).toBe(6_000);
    expect(env.BOOTSTRAP_ON_START).toBe(true);
    expect(env.ENABLE_LIVE_SMOKE).toBe(false);
  });
});
