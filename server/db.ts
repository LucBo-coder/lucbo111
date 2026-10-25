import { createRequire } from 'node:module';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqlDb } from './sql';

// SQLite is the single source of truth. Migrations are plain SQL files applied once, in filename order.
// We keep the canonical SaveData as JSON (same schema as the browser save, so the client can adopt it
// without a second model) and use relational tables for everything multiplayer/moderation-related.

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
// Runtime load also supports tooling whose built-in module list predates node:sqlite.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export type { Row } from './sql';
type Row = import('./sql').Row;

export class Db implements SqlDb {
  readonly raw: SqliteDatabase;
  constructor(readonly file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA foreign_keys = ON;');
    if (file !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  private migrate(): void {
    this.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
    const done = new Set((this.all('SELECT version FROM schema_migrations') as { version: number }[]).map((r) => Number(r.version)));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    for (const file of files) {
      const version = Number(file.split('_')[0]);
      if (done.has(version)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      this.raw.exec('BEGIN IMMEDIATE');
      try {
        this.raw.exec(sql);
        this.raw.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, Date.now());
        this.raw.exec('COMMIT');
      } catch (e) {
        this.raw.exec('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
  }

  one<T = Row>(sql: string, ...params: unknown[]): T | undefined {
    return this.raw.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  all<T = Row>(sql: string, ...params: unknown[]): T[] {
    return this.raw.prepare(sql).all(...(params as never[])) as T[];
  }

  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.raw.prepare(sql).run(...(params as never[])) as { changes: number; lastInsertRowid: number | bigint };
  }

  /** Runs fn inside a write transaction; nested calls reuse the outer transaction. */
  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      try { this.raw.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw e;
    }
  }

  close(): void {
    this.raw.close();
  }
}
