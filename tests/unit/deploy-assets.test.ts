import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(resolve(relativePath), "utf8");
}

describe("deploy assets", () => {
  it("expõe o unit systemd esperado para Ubuntu", async () => {
    const service = await readProjectFile("deploy/ubuntu/real-estate-watcher.service");

    expect(service).toContain("User=realestate");
    expect(service).toContain("Group=realestate");
    expect(service).toContain("WorkingDirectory=/opt/real-estate-watcher");
    expect(service).toContain("EnvironmentFile=/etc/real-estate-watcher/real-estate-watcher.env");
    expect(service).toContain("ExecStart=/usr/bin/env node /opt/real-estate-watcher/dist/src/index.js run-service");
    expect(service).toContain("Restart=on-failure");
    expect(service).toContain("StateDirectory=real-estate-watcher");
    expect(service).toContain("CacheDirectory=real-estate-watcher");
    expect(service).toContain("LogsDirectory=real-estate-watcher");
    expect(service).toContain("ProtectSystem=full");
    expect(service).toContain("ProtectHome=true");
    expect(service).toContain("PrivateTmp=true");
  });

  it("expõe o env example de produção com paths absolutos Linux", async () => {
    const envExample = await readProjectFile("deploy/ubuntu/real-estate-watcher.env.example");

    expect(envExample).toContain("NODE_ENV=production");
    expect(envExample).toContain("APP_DATA_DIR=/var/lib/real-estate-watcher");
    expect(envExample).toContain("APP_CACHE_DIR=/var/cache/real-estate-watcher");
    expect(envExample).toContain("APP_DEBUG_DIR=/var/lib/real-estate-watcher/debug");
    expect(envExample).toContain("DATABASE_URL=file:/var/lib/real-estate-watcher/app.db");
    expect(envExample).toContain("PLAYWRIGHT_BROWSERS_PATH=/var/lib/real-estate-watcher/pw-browsers");
    expect(envExample).toContain("BOOTSTRAP_ON_START=false");
    expect(envExample).toContain("ENABLE_LIVE_SMOKE=false");
  });

  it("entrega scripts bash sem resíduos de Windows", async () => {
    const installScript = await readProjectFile("deploy/ubuntu/install-ubuntu-24.04.sh");
    const postDeployScript = await readProjectFile("deploy/ubuntu/post-deploy-check.sh");

    for (const script of [installScript, postDeployScript]) {
      expect(script.startsWith("#!/usr/bin/env bash")).toBe(true);
      expect(script).toContain("set -euo pipefail");
      expect(script).not.toMatch(/Copy-Item|powershell|PowerShell|cmd \/c|C:\\\\/);
      expect(script).not.toMatch(/(^|[^\w-])npm ci\b/);
      expect(script).not.toMatch(/(^|[^\w-])npm install\b/);
      expect(script).not.toMatch(/(^|[^\w-])npm run\b/);
    }

    expect(installScript).toContain("pnpm install --frozen-lockfile");
    expect(installScript).toContain("pnpm build");
    expect(installScript).toContain("pnpm app install-browsers --with-deps");
    expect(installScript).toContain("pnpm-lock.yaml");
    expect(postDeployScript).toContain('run_app_command "healthcheck"');
    expect(postDeployScript).toContain('run_app_command "source-check"');
    expect(postDeployScript).toContain('PNPM_RUNNER=("pnpm")');
    expect(postDeployScript).toContain('PNPM_RUNNER=("corepack" "pnpm")');
  });
});
