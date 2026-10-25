// Storage contract of the authoritative server. The Node build backs it with node:sqlite (db.ts); the
// Cloudflare build backs it with the Durable Object's SQLite storage. Same SQL, same migrations.

export type Row = Record<string, unknown>;

export interface SqlDb {
  one<T = Row>(sql: string, ...params: unknown[]): T | undefined;
  all<T = Row>(sql: string, ...params: unknown[]): T[];
  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  /** Runs fn inside a write transaction. */
  tx<T>(fn: () => T): T;
  close(): void;
}
