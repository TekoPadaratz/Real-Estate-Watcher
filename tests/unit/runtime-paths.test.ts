import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "../../src/core/config/runtime-paths.js";

describe("runtime-paths", () => {
  it("resolve paths absolutos de produção para Ubuntu 24.04", () => {
    const paths = resolveRuntimePaths(
      {
        NODE_ENV: "production"
      },
      {
        cwd: "/opt/real-estate-watcher",
        platform: "linux"
      }
    );

    expect(paths.mode).toBe("production");
    expect(paths.codeDir).toBe("/opt/real-estate-watcher");
    expect(paths.envFilePath).toBe("/etc/real-estate-watcher/real-estate-watcher.env");
    expect(paths.stateDir).toBe("/var/lib/real-estate-watcher");
    expect(paths.cacheDir).toBe("/var/cache/real-estate-watcher");
    expect(paths.debugDir).toBe("/var/lib/real-estate-watcher/debug");
    expect(paths.databaseUrl).toBe("file:/var/lib/real-estate-watcher/app.db");
    expect(paths.databasePath).toBe("/var/lib/real-estate-watcher/app.db");
    expect(paths.playwrightBrowsersPath).toBe("/var/lib/real-estate-watcher/pw-browsers");
  });

  it("faz fallback seguro para ambiente local", () => {
    const paths = resolveRuntimePaths(
      {
        NODE_ENV: "development"
      },
      {
        cwd: "/home/dev/real-estate-watcher",
        platform: "linux"
      }
    );

    expect(paths.mode).toBe("local");
    expect(paths.codeDir).toBe("/home/dev/real-estate-watcher");
    expect(paths.stateDir).toBe("/home/dev/real-estate-watcher/data");
    expect(paths.cacheDir).toBe("/home/dev/real-estate-watcher/.cache");
    expect(paths.debugDir).toBe("/home/dev/real-estate-watcher/data/debug");
  });
});
