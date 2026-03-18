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
