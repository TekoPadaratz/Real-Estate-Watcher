import { Command } from "commander";
import { runBootstrapCommand } from "./cli/bootstrap.js";
import { runCrawlCommand } from "./cli/crawl.js";
import { runHealthcheckCommand } from "./cli/healthcheck.js";
import { runInstallBrowsersCommand } from "./cli/install-browsers.js";
import { runNotifyTestCommand } from "./cli/notify-test.js";
import { runServiceCommand } from "./cli/run-service.js";
import { runSmokeTestCommand } from "./cli/smoke-test.js";
import { runSourceCheckCommand } from "./cli/source-check.js";
import { runWatchCommand } from "./cli/watch.js";

const program = new Command();

function parsePositiveIntegerOption(value: string, optionLabel: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Valor inválido para ${optionLabel}: ${value}`);
  }

  return parsed;
}

program.name("real-estate-watcher").description("Monitor de imóveis residenciais para locação.");

program.command("bootstrap").action(async () => {
  await runBootstrapCommand();
});

program
  .command("watch")
  .option("-s, --source <sourceId>", "Executa apenas uma fonte")
  .option("-i, --interval <minutes>", "Intervalo entre ciclos, em minutos")
  .action(async (options: { source?: string; interval?: string }) => {
    await runWatchCommand(
      options.source,
      options.interval ? parsePositiveIntegerOption(options.interval, "--interval") : undefined
    );
  });

program
  .command("run-service")
  .option("-s, --source <sourceId>", "Executa apenas uma fonte")
  .option("-i, --interval <minutes>", "Intervalo entre ciclos, em minutos")
  .action(async (options: { source?: string; interval?: string }) => {
    await runServiceCommand(
      options.source,
      options.interval ? parsePositiveIntegerOption(options.interval, "--interval") : undefined
    );
  });

program
  .command("crawl")
  .option("-s, --source <sourceId>", "Executa apenas uma fonte")
  .option("--max-listings <count>", "Limita imóveis processados por fonte")
  .option("--max-seeds <count>", "Limita seeds por fonte")
  .action(async (options: { source?: string; maxListings?: string; maxSeeds?: string }) => {
    await runCrawlCommand(options.source, {
      maxListings: options.maxListings ? parsePositiveIntegerOption(options.maxListings, "--max-listings") : undefined,
      maxSeeds: options.maxSeeds ? parsePositiveIntegerOption(options.maxSeeds, "--max-seeds") : undefined
    });
  });

program
  .command("source-check")
  .option("-s, --source <sourceId>", "Executa apenas uma fonte")
  .action(async (options: { source?: string }) => {
    await runSourceCheckCommand(options.source);
  });

program
  .command("smoke-test")
  .option("-s, --source <sourceId>", "Executa apenas uma fonte")
  .action(async (options: { source?: string }) => {
    await runSmokeTestCommand(options.source);
  });

program.command("notify-test").action(async () => {
  await runNotifyTestCommand();
});

program.command("healthcheck").action(async () => {
  await runHealthcheckCommand();
});

program
  .command("install-browsers")
  .option("--with-deps", "Instala browsers do Playwright com dependências do sistema")
  .action(async (options: { withDeps?: boolean }) => {
    await runInstallBrowsersCommand({
      withDeps: Boolean(options.withDeps)
    });
  });

await program.parseAsync(process.argv);
