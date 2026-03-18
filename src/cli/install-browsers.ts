import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadEnv } from "../core/config/env.js";
import { ensureRuntimeDirectories } from "../core/config/runtime-paths.js";

const require = createRequire(import.meta.url);

export async function runInstallBrowsersCommand(options: { withDeps?: boolean } = {}) {
  const env = loadEnv();
  await ensureRuntimeDirectories(env.RUNTIME_PATHS);

  const playwrightCliPath = require.resolve("playwright/cli.js");
  const args = [playwrightCliPath, "install"];
  if (options.withDeps) {
    args.push("--with-deps");
  }
  args.push("chromium");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: env.RUNTIME_PATHS.codeDir,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: env.RUNTIME_PATHS.playwrightBrowsersPath
      },
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Falha ao instalar browsers do Playwright. Exit code: ${code ?? "unknown"}`));
    });
  });
}
