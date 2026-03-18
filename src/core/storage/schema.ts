import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sourcesTable = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    enabled: integer("enabled").notNull().default(1),
    strategy: text("strategy").notNull(),
    platformFamily: text("platform_family").notNull(),
    baseUrl: text("base_url").notNull(),
    configJson: text("config_json").notNull(),
    lastCrawledAt: text("last_crawled_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    enabledIndex: index("sources_enabled_idx").on(table.enabled)
  })
);

export const propertiesTable = sqliteTable(
  "properties",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    externalId: text("external_id").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    fingerprint: text("fingerprint").notNull(),
    currentSnapshotHash: text("current_snapshot_hash").notNull(),
    title: text("title").notNull(),
    transactionType: text("transaction_type").notNull(),
    propertyType: text("property_type").notNull(),
    usageType: text("usage_type").notNull(),
    city: text("city"),
    state: text("state"),
    neighborhood: text("neighborhood"),
    address: text("address"),
    priceBrl: real("price_brl"),
    condoFeeBrl: real("condo_fee_brl"),
    iptuBrl: real("iptu_brl"),
    bedrooms: integer("bedrooms"),
    suites: integer("suites"),
    bathrooms: integer("bathrooms"),
    parkingSpaces: integer("parking_spaces"),
    areaBuiltM2: real("area_built_m2"),
    areaTotalM2: real("area_total_m2"),
    mainImageUrl: text("main_image_url"),
    imageUrlsJson: text("image_urls_json").notNull(),
    description: text("description"),
    featuresJson: text("features_json").notNull(),
    rawPayloadJson: text("raw_payload_json").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    isActive: integer("is_active").notNull().default(1),
    matchScore: integer("match_score"),
    scoreReasonsJson: text("score_reasons_json").notNull().default("[]"),
    lastRunId: text("last_run_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    fingerprintUnique: uniqueIndex("properties_fingerprint_uq").on(table.fingerprint),
    sourceIdIndex: index("properties_source_id_idx").on(table.sourceId),
    sourceExternalIndex: index("properties_source_external_idx").on(table.sourceId, table.externalId)
  })
);

export const propertySnapshotsTable = sqliteTable(
  "property_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyFingerprint: text("property_fingerprint").notNull(),
    sourceId: text("source_id").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    capturedAt: text("captured_at").notNull(),
    priceBrl: real("price_brl"),
    description: text("description"),
    isActive: integer("is_active").notNull().default(1),
    matchScore: integer("match_score"),
    scoreReasonsJson: text("score_reasons_json").notNull().default("[]"),
    propertyJson: text("property_json").notNull(),
    rawPayloadJson: text("raw_payload_json").notNull()
  },
  (table) => ({
    fingerprintSnapshotUnique: uniqueIndex("property_snapshots_fingerprint_hash_uq").on(
      table.propertyFingerprint,
      table.snapshotHash
    ),
    sourceIdIndex: index("property_snapshots_source_id_idx").on(table.sourceId)
  })
);

export const notificationsTable = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    queueId: integer("queue_id"),
    propertyId: integer("property_id").notNull(),
    sourceId: text("source_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadJson: text("payload_json").notNull(),
    telegramMethod: text("telegram_method"),
    telegramMessageId: text("telegram_message_id"),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at").notNull()
  },
  (table) => ({
    payloadHashUnique: uniqueIndex("notifications_payload_hash_uq").on(table.payloadHash),
    propertyIdIndex: index("notifications_property_id_idx").on(table.propertyId),
    sourceIdIndex: index("notifications_source_id_idx").on(table.sourceId)
  })
);

export const notificationQueueTable = sqliteTable(
  "notification_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id").notNull(),
    sourceId: text("source_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    eventType: text("event_type").notNull(),
    priority: integer("priority").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    availableAt: text("available_at").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at")
  },
  (table) => ({
    payloadHashUnique: uniqueIndex("notification_queue_payload_hash_uq").on(table.payloadHash),
    statusAvailableIndex: index("notification_queue_status_available_idx").on(table.status, table.availableAt),
    priorityIndex: index("notification_queue_priority_idx").on(table.priority),
    propertyIdIndex: index("notification_queue_property_id_idx").on(table.propertyId)
  })
);

export const crawlRunsTable = sqliteTable(
  "crawl_runs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    mode: text("mode").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status").notNull(),
    metricsJson: text("metrics_json").notNull(),
    errorMessage: text("error_message")
  },
  (table) => ({
    sourceIdIndex: index("crawl_runs_source_id_idx").on(table.sourceId),
    statusIndex: index("crawl_runs_status_idx").on(table.status)
  })
);

export const appStateTable = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const schemaSql = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  strategy TEXT NOT NULL,
  platform_family TEXT NOT NULL,
  base_url TEXT NOT NULL,
  config_json TEXT NOT NULL,
  last_crawled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sources_enabled_idx ON sources (enabled);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  external_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  current_snapshot_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  property_type TEXT NOT NULL,
  usage_type TEXT NOT NULL,
  city TEXT,
  state TEXT,
  neighborhood TEXT,
  address TEXT,
  price_brl REAL,
  condo_fee_brl REAL,
  iptu_brl REAL,
  bedrooms INTEGER,
  suites INTEGER,
  bathrooms INTEGER,
  parking_spaces INTEGER,
  area_built_m2 REAL,
  area_total_m2 REAL,
  main_image_url TEXT,
  image_urls_json TEXT NOT NULL,
  description TEXT,
  features_json TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  match_score INTEGER,
  score_reasons_json TEXT NOT NULL DEFAULT '[]',
  last_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS properties_fingerprint_uq ON properties (fingerprint);
CREATE INDEX IF NOT EXISTS properties_source_id_idx ON properties (source_id);
CREATE INDEX IF NOT EXISTS properties_source_external_idx ON properties (source_id, external_id);

CREATE TABLE IF NOT EXISTS property_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_fingerprint TEXT NOT NULL,
  source_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  price_brl REAL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  match_score INTEGER,
  score_reasons_json TEXT NOT NULL DEFAULT '[]',
  property_json TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS property_snapshots_fingerprint_hash_uq
  ON property_snapshots (property_fingerprint, snapshot_hash);
CREATE INDEX IF NOT EXISTS property_snapshots_source_id_idx ON property_snapshots (source_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER,
  property_id INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  telegram_method TEXT,
  telegram_message_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_payload_hash_uq ON notifications (payload_hash);
CREATE INDEX IF NOT EXISTS notifications_property_id_idx ON notifications (property_id);
CREATE INDEX IF NOT EXISTS notifications_source_id_idx ON notifications (source_id);

CREATE TABLE IF NOT EXISTS notification_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  event_type TEXT NOT NULL,
  priority INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_payload_hash_uq ON notification_queue (payload_hash);
CREATE INDEX IF NOT EXISTS notification_queue_status_available_idx
  ON notification_queue (status, available_at);
CREATE INDEX IF NOT EXISTS notification_queue_priority_idx ON notification_queue (priority);
CREATE INDEX IF NOT EXISTS notification_queue_property_id_idx ON notification_queue (property_id);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS crawl_runs_source_id_idx ON crawl_runs (source_id);
CREATE INDEX IF NOT EXISTS crawl_runs_status_idx ON crawl_runs (status);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
