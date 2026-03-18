import { createSourceAdapter } from "../core/adapters/create-adapter.js";
import type { AdapterServices } from "../core/adapters/base/base-source-adapter.js";
import { loadYamlFile } from "../core/config/config-loader.js";
import { loadEnv } from "../core/config/env.js";
import { ensureRuntimeDirectories } from "../core/config/runtime-paths.js";
import { searchProfileSchema, type SearchProfile } from "../core/config/search-profile.js";
import { sourcesConfigSchema, type SourceDefinition } from "../core/config/sources.js";
import { CrawlerService } from "../core/crawl/crawler.service.js";
import { NotificationDispatcher } from "../core/notifications/notification-dispatcher.js";
import { FixedIntervalRateLimiter } from "../core/notifications/rate-limiter.js";
import { TelegramService } from "../core/notifications/telegram.service.js";
import { DebugDumpService } from "../core/observability/debug-dump.js";
import { createLogger } from "../core/observability/logger.js";
import { createDatabase } from "../core/storage/db.js";
import { AppStateRepository } from "../core/storage/repositories/app-state-repository.js";
import { NotificationQueueRepository } from "../core/storage/repositories/notification-queue-repository.js";
import { NotificationRepository } from "../core/storage/repositories/notification-repository.js";
import { PropertyRepository } from "../core/storage/repositories/property-repository.js";
import { RunRepository } from "../core/storage/repositories/run-repository.js";
import { SourceRepository } from "../core/storage/repositories/source-repository.js";

export interface AppContext {
  env: ReturnType<typeof loadEnv>;
  logger: ReturnType<typeof createLogger>;
  profile: SearchProfile;
  sources: SourceDefinition[];
  crawlerService: CrawlerService;
  telegramService: TelegramService;
  notificationDispatcher: NotificationDispatcher;
  appStateRepository: AppStateRepository;
  notificationQueueRepository: NotificationQueueRepository;
  notificationRepository: NotificationRepository;
  sourceRepository: SourceRepository;
  adapterServices: AdapterServices;
  createAdapter: (source: SourceDefinition) => ReturnType<typeof createSourceAdapter>;
  close: () => Promise<void>;
}

export async function bootstrap(): Promise<AppContext> {
  const env = loadEnv();
  await ensureRuntimeDirectories(env.RUNTIME_PATHS);
  const logger = createLogger(env);
  const [profileRaw, sourcesRaw] = await Promise.all([
    loadYamlFile<unknown>(env.RUNTIME_PATHS.searchProfilePath),
    loadYamlFile<unknown>(env.RUNTIME_PATHS.sourcesConfigPath)
  ]);

  const profile = searchProfileSchema.parse(profileRaw);
  const sources = sourcesConfigSchema.parse(sourcesRaw).sources.filter((source) => source.enabled);
  const debugDumps = new DebugDumpService(env.RUNTIME_PATHS.artifactsDir);
  const database = await createDatabase(env);
  const propertyRepository = new PropertyRepository(database.db);
  const runRepository = new RunRepository(database.db);
  const sourceRepository = new SourceRepository(database.db);
  const notificationRepository = new NotificationRepository(database.db);
  const notificationQueueRepository = new NotificationQueueRepository(database.db);
  const appStateRepository = new AppStateRepository(database.db, database.client);
  const telegramService = new TelegramService(env, profile, logger);
  const rateLimiter = new FixedIntervalRateLimiter(env.TELEGRAM_MIN_INTERVAL_MS);

  const adapterServices: AdapterServices = {
    env,
    logger,
    debugDumps
  };

  const crawlerService = new CrawlerService(
    sources,
    profile,
    adapterServices,
    propertyRepository,
    sourceRepository,
    runRepository,
    notificationQueueRepository,
    logger
  );

  const notificationDispatcher = new NotificationDispatcher(
    notificationQueueRepository,
    notificationRepository,
    appStateRepository,
    telegramService,
    rateLimiter,
    logger
  );

  await sourceRepository.syncFromConfig(sources, new Date().toISOString());

  return {
    env,
    logger,
    profile,
    sources,
    crawlerService,
    telegramService,
    notificationDispatcher,
    appStateRepository,
    notificationQueueRepository,
    notificationRepository,
    sourceRepository,
    adapterServices,
    createAdapter: (source) => createSourceAdapter(source, adapterServices),
    close: async () => {
      database.client.close();
    }
  };
}
