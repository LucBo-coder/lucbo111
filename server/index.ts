import { GameServer, GameServerConfig } from './gameServer';

// Authoritative Adventure server entry point.
//   npm run server
//   PORT=8787 HOST=0.0.0.0 DB_PATH=server/data/game.db npm run server
//
// The browser client keeps working offline with local saves; when it connects here the canonical
// save lives in SQLite and every mutation goes through this process (see server/actions.ts).

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

const config: Partial<GameServerConfig> = {
  host: process.env.HOST || '0.0.0.0',
  port: num('PORT', 8787),
  dbPath: process.env.DB_PATH || 'server/data/game.db',
  enabledRegions: (process.env.REGIONS || 'ca-mau,an-giang,can-tho').split(',').map((r) => r.trim()).filter(Boolean),
  eventIntervalMs: num('EVENT_INTERVAL_MS', 600_000),
  eventDurationMs: num('EVENT_DURATION_MS', 480_000),
  alphaRespawnMs: num('ALPHA_RESPAWN_MS', 45_000),
  authTimeoutMs: num('AUTH_TIMEOUT_MS', 10_000),
  presenceIntervalMs: num('PRESENCE_INTERVAL_MS', 100),
  authPerMinute: num('AUTH_PER_MINUTE', 12),
  maxPerChannel: num('MAX_PER_CHANNEL', 30),
  relevanceRadius: num('RELEVANCE_RADIUS', 1600),
  eventAnnounceMs: num('EVENT_ANNOUNCE_MS', 60_000),
  switchCooldownMs: num('SWITCH_COOLDOWN_MS', 1_500),
  verbose: bool('VERBOSE', true),
};

const server = new GameServer(config);

server.ready.then((port) => {
  console.log(`[server] ready: http://${config.host}:${port}/healthz · ws://${config.host}:${port}/ws`);
  console.log(`[server] db=${config.dbPath} regions=${config.enabledRegions!.join(',')} events=${config.eventIntervalMs}ms/${config.eventDurationMs}ms`);
}).catch((e: unknown) => {
  console.error('[server] failed to start:', e);
  process.exit(1);
});

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.log(`[server] ${signal} — shutting down`);
  try {
    await server.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => console.error('[server] unhandled rejection:', e));
process.on('uncaughtException', (e) => console.error('[server] uncaught exception:', e));
