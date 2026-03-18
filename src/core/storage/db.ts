import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { AppEnv } from "../config/env.js";
import * as schema from "./schema.js";

interface TableInfoRow {
  name: string;
}

export interface SqliteClient {
  pragma(statement: string): unknown;
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes?: number };
  };
  close(): void;
}

export interface DatabaseContext {
  client: SqliteClient;
  db: BetterSQLite3Database<typeof schema>;
}

export type AppDatabase = BetterSQLite3Database<typeof schema>;

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, "\"\"")}"`;
}

function listColumns(client: SqliteClient, tableName: string): Set<string> {
  const rows = client.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as TableInfoRow[];
  return new Set(rows.map((row) => row.name));
}

function ensureColumn(client: SqliteClient, tableName: string, columnName: string, columnSql: string): void {
  const columns = listColumns(client, tableName);
  if (columns.has(columnName)) {
    return;
  }

  client.exec(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnSql}`);
}

function migrateLegacySchema(client: SqliteClient): void {
  client.exec(schema.schemaSql);

  ensureColumn(client, "properties", "match_score", 'match_score INTEGER');
  ensureColumn(client, "properties", "score_reasons_json", 'score_reasons_json TEXT NOT NULL DEFAULT "[]"');

  ensureColumn(client, "property_snapshots", "match_score", 'match_score INTEGER');
  ensureColumn(client, "property_snapshots", "score_reasons_json", 'score_reasons_json TEXT NOT NULL DEFAULT "[]"');
}

export async function createDatabase(env: AppEnv): Promise<DatabaseContext> {
  const dbPath = env.DATABASE_PATH;
  await mkdir(dirname(dbPath), { recursive: true });

  const client = new Database(dbPath) as unknown as SqliteClient;
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  client.pragma("busy_timeout = 5000");
  client.pragma("synchronous = NORMAL");
  migrateLegacySchema(client);

  const db = drizzle(client as never, { schema });
  return { client, db };
}
