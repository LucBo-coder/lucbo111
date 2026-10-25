import { randomUUID } from 'node:crypto';
import { AdventureState } from '../src/adventure/AdventureState';
import { POKEMON } from '../src/core/data';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { RegionDef, ValleyMap } from '../src/core/map/valley';
import { TILE_PX } from '../src/core/map/tiles';
import { calcStats } from '../src/core/stats';
import { addFriendship, expForLevel, expYield, individualOf, levelForExp, MAX_LEVEL } from '../src/core/progression';
import type {
  AlphaReward, ClientMsg, EmoteKind, PetState, ServerAccount, ServerAlphaView, ServerChatMessage, ServerEventIncoming,
  ServerEventView, ServerFriend, ServerMsg, ServerPartyView, ServerPlayerView,
} from '../src/net/serverProtocol';
import { EMOTES, SERVER_PROTOCOL } from '../src/net/serverProtocol';
import { ActionError, hasCachedAction, performAction } from './actions';
import { AuthError, changePassword, login, logout, logoutAll, purgeExpiredSessions, recover, regenerateRecovery, register, resume } from './auth';
import type { SqlDb } from './sql';
import { activePokemon, playerLevel, readSave, writeSave } from './playerSave';
import { eventDef, eventObjectiveLabel, ONLINE_BADGE_LEVEL, pickEvent, REGION_ALPHA, RegionalEventDef } from './eventCatalog';

export interface GameServerConfig {
  host: string;
  port: number;
  dbPath: string;
  enabledRegions: string[];
  eventIntervalMs: number;
  eventDurationMs: number;
  alphaRespawnMs: number;
  authTimeoutMs: number;
  presenceIntervalMs: number;
  /** login/register attempts allowed per IP per minute */
  authPerMinute: number;
  /** players per channel of a region; extra players open the next channel (V7 §2.3) */
  maxPerChannel: number;
  /** presence/emote/summon effects only reach players within this distance (interest management) */
  relevanceRadius: number;
  /** WORLD EVENT INCOMING lead time before each 10-minute cycle starts */
  eventAnnounceMs: number;
  /** deposit / withdraw / box edits only within this distance of a Pokémon Center / lab PC terminal */
  pcRange: number;
  /** server-enforced cooldown between summon / recall / switch */
  switchCooldownMs: number;
  /** length of the summon / recall animation; the Pokémon cannot attack meanwhile */
  summonMs: number;
  /** how often moved players' positions are written to the database */
  flushIntervalMs: number;
  verbose: boolean;
}

export const DEFAULT_CONFIG: GameServerConfig = {
  host: '0.0.0.0',
  port: 8787,
  dbPath: 'server/data/game.db',
  enabledRegions: ['ca-mau'],
  eventIntervalMs: 600_000,
  eventDurationMs: 480_000,
  alphaRespawnMs: 45_000,
  authTimeoutMs: 10_000,
  presenceIntervalMs: 100,
  authPerMinute: 12,
  maxPerChannel: 30,
  relevanceRadius: 1600,
  eventAnnounceMs: 60_000,
  pcRange: 130,
  switchCooldownMs: 1_500,
  summonMs: 700,
  flushIntervalMs: 2_000,
  verbose: true,
};

/** largest client frame (characters) */
export const MAX_FRAME = 16 * 1024;
const ALPHA_EXP_MULT = 1.5;
const PORTAL_RANGE = 150;
const PC_ACTIONS = new Set(['party.deposit', 'party.withdraw', 'pc.move', 'pc.favorite', 'pc.rename', 'pc.boxName', 'pc.sort']);
const PARTY_BONUS_PER_MEMBER = 0.1;
const PARTY_BONUS_MAX = 0.3;

/** One connection as the world sees it: the Node host wraps `ws`, the Cloudflare host wraps a hibernatable socket. */
export interface WorldSocket {
  readonly open: boolean;
  send(data: string): void;
  close(): void;
  /** keep-alive probe (Cloudflare answers pings itself) */
  ping?(): void;
}

type Timer = ReturnType<typeof setTimeout>;

interface Client {
  ws: WorldSocket;
  account: ServerAccount;
  token: string;
  save: ReturnType<typeof readSave>;
  region: string;
  channel: number;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  lastMoveAt: number;
  lastChatAt: number;
  lastAlphaAt: number;
  lastSwitchAt: number;
  lastEmoteAt: number;
  pet: PetState;
  petUntil: number;
  emote: { kind: EmoteKind; at: number } | null;
  lastSeen: number;
  tokens: number;
  lastRefill: number;
  /** what this client last received per visible player (delta presence) */
  seen: Map<string, string> | null;
  alive: boolean;
  authTimer: Timer | null;
}

interface AlphaRow {
  id: string; region: string; species: string; level: number; hp: number; max_hp: number;
  x: number; y: number; status: 'active' | 'defeated'; spawned_at: number; defeated_at: number | null; event_id: string | null;
}

interface EventRow {
  id: string; type: string; name: string; region: string; starts_at: number; ends_at: number;
  goal: number; progress: number; status: 'active' | 'completed' | 'expired';
  legendary: number; min_level: number; data_json: string | null;
}

const BAD_WORDS = ['dm', 'đm', 'dmm', 'cc', 'vcl', 'vl', 'fuck', 'shit', 'bitch', 'nigger'];

function sanitizeBody(raw: unknown, max = 200): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function moderate(body: string): { body: string; moderated: boolean } {
  let moderated = false;
  let out = body;
  for (const w of BAD_WORDS) {
    const re = new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'gi');
    if (re.test(out)) { moderated = true; out = out.replace(re, '$1***'); }
  }
  return { body: out, moderated };
}

function nowMs(): number { return Date.now(); }

/**
 * The authoritative world: accounts, presence, Alpha, regional events, party, chat, PC and actions. It knows nothing
 * about the network: a host feeds it sockets (`attach` / `receive` / `detach`) and decides when its clocks run.
 */
export class WorldServer {
  readonly db: SqlDb;
  readonly config: GameServerConfig;
  private readonly clients = new Map<WorldSocket, Client>();
  private readonly byAccount = new Map<string, Client>();
  private readonly maps = new Map<string, ValleyMap>();
  private presenceTimer: Timer | null = null;
  private tickTimer: Timer | null = null;
  private flushTimer: Timer | null = null;
  private alphaTimers = new Map<string, Timer>();
  private lastEventStart = new Map<string, number>();
  private incoming = new Map<string, { def: RegionalEventDef; startsAt: number }>();
  /** alphaId → accountId → uid of the Pokémon that last hit it (it receives the EXP) */
  private alphaAttackers = new Map<string, Map<string, string>>();
  private tickLagMs = 0;
  private lastTickAt = nowMs();
  private eventTimer: Timer | null = null;
  private authAttempts = new Map<string, { n: number; at: number }>();
  private readonly startedAt = nowMs();
  private readonly ips = new Map<WorldSocket, string | undefined>();
  private closed = false;
  private running = false;

  constructor(overrides: Partial<GameServerConfig>, db: SqlDb) {
    this.config = { ...DEFAULT_CONFIG, ...overrides };
    this.db = db;
    for (const id of this.config.enabledRegions) {
      const def = REGION_DEFS[id] as unknown as RegionDef | undefined;
      if (def) this.maps.set(id, new ValleyMap(def));
    }
    for (const region of this.config.enabledRegions) {
      const last = this.db.one<{ start: number }>('SELECT MAX(starts_at) AS start FROM world_events WHERE region = ?', region);
      this.lastEventStart.set(region, Number(last?.start ?? nowMs()));
    }
  }

  /** Signed-in players / open connections. */
  get online(): number { return this.byAccount.size; }
  get connections(): number { return this.clients.size; }
  get schedulersRunning(): boolean { return this.running; }

  /** Body of /healthz (the host may add process figures). */
  health(): Record<string, unknown> {
    return {
      ok: true, protocol: SERVER_PROTOCOL, uptimeMs: nowMs() - this.startedAt,
      online: this.byAccount.size, regions: this.config.enabledRegions, channels: this.channelCounts(), tickLagMs: this.tickLagMs,
    };
  }

  private log(...args: unknown[]): void {
    if (this.config.verbose) console.log('[server]', ...args);
  }

  /** Starts the world clocks (idempotent). A host that sleeps when empty calls it when the first player arrives. */
  startSchedulers(): void {
    if (this.running || this.closed) return;
    this.running = true;
    this.lastTickAt = nowMs();
    for (const region of this.config.enabledRegions) this.spawnAlpha(region);
    this.presenceTimer = setInterval(() => this.broadcastPresence(), this.config.presenceIntervalMs);
    this.tickTimer = setInterval(() => this.tickWorld(), 1_000);
    this.flushTimer = setInterval(() => this.flushPositions(), this.config.flushIntervalMs);
    this.eventTimer = setInterval(() => void purgeExpiredSessions(this.db), 10 * 60_000);
    this.tickWorld(); // catch up on an event schedule that fell due while the clocks were stopped
  }

  /** Stops every clock; state lives in SQLite, so `startSchedulers` resumes where the world left off. */
  stopSchedulers(): void {
    if (!this.running) return;
    this.running = false;
    this.flushPositions();
    for (const t of [this.presenceTimer, this.tickTimer, this.flushTimer, this.eventTimer, ...this.alphaTimers.values()]) if (t) clearTimeout(t);
    this.presenceTimer = this.tickTimer = this.flushTimer = this.eventTimer = null;
    this.alphaTimers.clear();
  }

  private regionMap(region: string): ValleyMap | undefined { return this.maps.get(region); }

  /** A new connection: it must authenticate within `authTimeoutMs`. */
  attach(ws: WorldSocket, ip?: string): void {
    const c = {
      ws, account: null as unknown as ServerAccount, token: '', save: null as never,
      region: this.config.enabledRegions[0] ?? 'ca-mau', channel: 1, x: 0, y: 0, facing: 0, moving: false,
      lastMoveAt: 0, lastChatAt: 0, lastAlphaAt: 0, lastSwitchAt: 0, lastEmoteAt: 0, pet: 'none', petUntil: 0, emote: null,
      lastSeen: nowMs(), tokens: 40, lastRefill: nowMs(), seen: null,
      alive: true, authTimer: null as Timer | null,
    } as Client;
    this.clients.set(ws, c);
    c.authTimer = setTimeout(() => { if (!c.account) this.closeWithError(c, 'AUTH_TIMEOUT', 'Hết thời gian đăng nhập.'); }, this.config.authTimeoutMs);
    this.ips.set(ws, ip);
  }

  /** One text frame from `ws`. */
  receive(ws: WorldSocket, raw: string): Promise<void> {
    const c = this.clients.get(ws);
    return c ? this.onMessage(c, raw, this.ips.get(ws)) : Promise.resolve();
  }

  /** The connection closed (or errored). */
  detach(ws: WorldSocket): void {
    const c = this.clients.get(ws);
    if (c) this.onClose(c);
    this.ips.delete(ws);
  }

  /** Keep-alive answer from `ws`. */
  alive(ws: WorldSocket): void {
    const c = this.clients.get(ws);
    if (c) { c.alive = true; c.lastSeen = nowMs(); }
  }

  private onClose(c: Client): void {
    if (!this.clients.has(c.ws)) return;
    if (c.authTimer) clearTimeout(c.authTimer);
    this.clients.delete(c.ws);
    if (c.account && this.byAccount.get(c.account.id) === c) {
      this.byAccount.delete(c.account.id);
      this.db.run('UPDATE players SET x = ?, y = ?, facing = ?, moving = 0, last_seen = ? WHERE account_id = ?',
        c.x, c.y, c.facing, nowMs(), c.account.id);
      this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
        c.account.id, 'session.disconnect', JSON.stringify({ region: c.region }), nowMs());
      this.broadcastPresence();
    }
  }

  private closeWithError(c: Client, code: string, message: string): void {
    this.send(c, { t: 'error', code, message });
    setTimeout(() => { try { c.ws.close(); } catch { /* already closed */ } }, 30);
  }

  private send(c: Client, msg: ServerMsg): void {
    if (c.ws.open) c.ws.send(JSON.stringify(msg));
  }

  private sendTo(accountId: string, msg: ServerMsg): void {
    const c = this.byAccount.get(accountId);
    if (c) this.send(c, msg);
  }

  /** Region-wide world state (Alpha, events): every channel of the region shares it. */
  private broadcast(region: string, msg: ServerMsg, except?: string): void {
    for (const c of this.byAccount.values()) {
      if (c.region !== region || c.account.id === except) continue;
      this.send(c, msg);
    }
  }

  /** Local effects (emotes, summon/recall): same channel and within the relevance radius only. */
  private broadcastNear(from: Client, msg: ServerMsg): void {
    for (const c of this.byAccount.values()) {
      if (c !== from && !this.relevant(from, c)) continue;
      this.send(c, msg);
    }
  }

  private relevant(a: Client, b: Client): boolean {
    return a.region === b.region && a.channel === b.channel && Math.hypot(a.x - b.x, a.y - b.y) <= this.config.relevanceRadius;
  }

  private channelCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of this.byAccount.values()) out[`${c.region}#${c.channel}`] = (out[`${c.region}#${c.channel}`] ?? 0) + 1;
    return out;
  }

  /** Lowest channel of the region that still has room. */
  private pickChannel(region: string, except?: Client): number {
    const counts = new Map<number, number>();
    for (const c of this.byAccount.values()) if (c !== except && c.region === region) counts.set(c.channel, (counts.get(c.channel) ?? 0) + 1);
    for (let ch = 1; ; ch++) if ((counts.get(ch) ?? 0) < this.config.maxPerChannel) return ch;
  }

  /** Local chat is stored per channel; the client keeps addressing it as `region:<id>`. */
  private localChannel(c: Client): string { return `region:${c.region}#${c.channel}`; }

  private rateLimited(c: Client, now: number): boolean {
    if (now - c.lastRefill > 1000) {
      c.tokens = Math.min(40, c.tokens + Math.floor((now - c.lastRefill) / 50));
      c.lastRefill = now;
    }
    if (c.tokens <= 0) {
      this.send(c, { t: 'notice', message: 'Bạn thao tác quá nhanh, thử lại sau.', level: 'warn' });
      return true;
    }
    c.tokens--;
    return false;
  }

  private authLimit(ip: string): boolean {
    const now = nowMs();
    const a = this.authAttempts.get(ip);
    if (!a || now - a.at > 60_000) { this.authAttempts.set(ip, { n: 1, at: now }); return false; }
    a.n++;
    return a.n > this.config.authPerMinute;
  }

  private async onMessage(c: Client, raw: string, ip?: string): Promise<void> {
    let msg: ClientMsg;
    try {
      if (raw.length > MAX_FRAME) { this.closeWithError(c, 'PAYLOAD_TOO_LARGE', 'Gói tin quá lớn.'); return; }
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      this.send(c, { t: 'error', code: 'BAD_JSON', message: 'Gói tin không hợp lệ.' });
      return;
    }
    const now = nowMs();
    if (!msg || typeof (msg as { t?: unknown }).t !== 'string') return;
    if (!c.account) {
      if (msg.t === 'login' || msg.t === 'register' || msg.t === 'resume' || msg.t === 'recover') {
        if (this.authLimit(ip ?? 'unknown')) { this.closeWithError(c, 'AUTH_RATE_LIMIT', 'Quá nhiều lần đăng nhập, thử lại sau 1 phút.'); return; }
        this.authenticate(c, msg, ip);
      } else {
        this.closeWithError(c, 'AUTH_REQUIRED', 'Hãy đăng nhập trước.');
      }
      return;
    }
    if (this.rateLimited(c, now)) return;
    switch (msg.t) {
      case 'ping': this.send(c, { t: 'pong', at: msg.at, serverTime: now }); return;
      case 'resync': this.send(c, { t: 'welcome', token: c.token, account: c.account, save: c.save, protocol: SERVER_PROTOCOL, serverTime: now }); return;
      case 'logout':
        logout(this.db, c.token);
        c.token = '';
        this.closeWithError(c, 'LOGGED_OUT', 'Đã đăng xuất.');
        return;
      case 'enter': this.enterRegion(c, msg.region); return;
      case 'travel': this.travel(c, msg.portal); return;
      case 'account': this.accountOp(c, msg); return;
      case 'move': this.move(c, msg.x, msg.y, msg.facing, msg.moving, now); return;
      case 'action': this.handleAction(c, msg, now); return;
      case 'alpha.attack': this.alphaAttack(c, msg.actionId, now); return;
      case 'chat': this.chat(c, msg.actionId, msg.channel, msg.body, now); return;
      case 'friend': this.friendOp(c, msg.actionId, msg.op, msg.target, msg.reason); return;
      case 'party': this.partyOp(c, msg.actionId, msg.op, msg.target); return;
      case 'whisper': this.whisper(c, msg.actionId, msg.target, msg.body, now); return;
      case 'emote': this.emote(c, msg.kind, now); return;
      default: this.send(c, { t: 'error', code: 'UNKNOWN_MESSAGE', message: 'Loại tin nhắn không hỗ trợ.' });
    }
  }

  private authenticate(c: Client, msg: Extract<ClientMsg, { t: 'login' | 'register' | 'resume' | 'recover' }>, ip?: string): void {
    try {
      const result = msg.t === 'register'
        ? register(this.db, msg.username, msg.password, msg.displayName, msg.starter, ip)
        : msg.t === 'login'
          ? login(this.db, msg.username, msg.password, ip)
          : msg.t === 'recover'
            ? recover(this.db, msg.username, msg.code, msg.newPassword, ip)
            : resume(this.db, msg.token);
      const old = this.byAccount.get(result.account.id);
      if (old && old !== c) {
        // an error code (not a notice) so the old tab stops auto-reconnecting instead of kicking this one
        this.send(old, { t: 'error', code: 'SESSION_REPLACED', message: 'Tài khoản được đăng nhập từ thiết bị khác.' });
        try { old.ws.close(); } catch { /* closed */ }
      }
      c.account = result.account;
      c.token = result.token;
      c.save = result.save;
      c.region = result.save.adventure?.region && this.maps.has(result.save.adventure.region)
        ? result.save.adventure.region
        : (this.config.enabledRegions[0] ?? 'ca-mau');
      const pos = result.save.adventure?.pos ?? { x: 2304, y: 3008 };
      const pr = this.db.one<{ x: number; y: number; facing: number }>('SELECT x, y, facing FROM players WHERE account_id = ?', result.account.id);
      c.x = pr?.x ?? pos.x;
      c.y = pr?.y ?? pos.y;
      c.facing = pr?.facing ?? 0;
      c.lastMoveAt = nowMs(); // the first move after login is speed-checked too
      c.lastSeen = nowMs();
      if (c.authTimer) { clearTimeout(c.authTimer); c.authTimer = null; }
      c.channel = this.pickChannel(c.region, c);
      c.pet = activePokemon(c.save) ? 'active' : 'none';
      this.byAccount.set(result.account.id, c);
      c.save.adventure!.pos = { x: c.x, y: c.y };
      c.save.adventure!.region = c.region;
      this.send(c, {
        t: 'welcome', token: result.token, account: result.account, save: result.save,
        protocol: SERVER_PROTOCOL, serverTime: nowMs(), ...(result.recoveryCode ? { recoveryCode: result.recoveryCode } : {}),
      });
      this.db.run('UPDATE players SET region = ?, x = ?, y = ?, last_seen = ? WHERE account_id = ?',
        c.region, c.x, c.y, nowMs(), result.account.id);
      this.log('login', result.account.username, 'region', c.region);
      this.sendPresence(c);
      this.send(c, { t: 'alpha', alpha: this.alphaView(this.activeAlpha(c.region)) });
      const ev = this.activeEvent(c.region);
      if (ev) this.send(c, { t: 'event', event: this.eventView(ev, c.account.id) });
      this.send(c, { t: 'eventIncoming', incoming: this.incomingView(c.region) });
      this.sendChatHistory(c);
      this.sendFriends(c);
      this.sendParty(c);
      this.broadcastPresence();
    } catch (e) {
      const err = e as AuthError;
      this.send(c, { t: 'error', code: err.code ?? 'AUTH_FAILED', message: err.message ?? 'Đăng nhập thất bại.' });
    }
  }

  /** Re-sends the current region's world state. Changing region is only possible through a portal (travel). */
  private enterRegion(c: Client, region: string): void {
    if (region !== c.region) {
      this.send(c, { t: 'error', code: 'USE_PORTAL', message: 'Hãy đi qua cổng để sang vùng khác.' });
      return;
    }
    this.placeInRegion(c, region, c.x, c.y);
  }

  private placeInRegion(c: Client, region: string, x: number, y: number): void {
    c.region = region;
    c.x = x; c.y = y;
    c.lastMoveAt = nowMs();
    c.save.adventure!.pos = { x, y };
    c.channel = this.pickChannel(region, c);
    c.seen = null;
    c.save.adventure!.region = region;
    this.db.run('UPDATE players SET region = ?, x = ?, y = ?, save_json = ?, updated_at = ? WHERE account_id = ?',
      region, x, y, JSON.stringify(c.save), nowMs(), c.account.id);
    this.send(c, { t: 'alpha', alpha: this.alphaView(this.activeAlpha(region)) });
    const ev = this.activeEvent(region);
    this.send(c, { t: 'event', event: ev ? this.eventView(ev, c.account.id) : null });
    this.send(c, { t: 'eventIncoming', incoming: this.incomingView(region) });
    this.sendChatHistory(c);
    this.broadcastPresence();
  }

  private move(c: Client, x: unknown, y: unknown, facing: unknown, moving: unknown, now: number): void {
    const nx = Number(x), ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    const map = this.regionMap(c.region);
    if (!map) return;
    const maxX = map.widthTiles * TILE_PX, maxY = map.heightTiles * TILE_PX;
    if (nx < 0 || ny < 0 || nx > maxX || ny > maxY) return;
    const dt = Math.max(0.02, (now - c.lastMoveAt) / 1000);
    const dist = Math.hypot(nx - c.x, ny - c.y);
    // 420 px/s + a generous snapshot tolerance; teleports/hacks are rejected with a correction.
    if (c.lastMoveAt && dist > 420 * dt + 120) {
      this.send(c, { t: 'notice', message: 'Máy chủ từ chối di chuyển bất thường.', level: 'warn' });
      this.send(c, { t: 'position', region: c.region, x: c.x, y: c.y });
      return;
    }
    const tx = Math.floor(nx / TILE_PX), ty = Math.floor(ny / TILE_PX);
    if (map.solidAt(tx, ty) && !map.solidAt(Math.floor(c.x / TILE_PX), Math.floor(c.y / TILE_PX))) {
      this.send(c, { t: 'position', region: c.region, x: c.x, y: c.y });
      return;
    }
    c.x = nx; c.y = ny;
    c.facing = Number.isFinite(Number(facing)) ? Number(facing) : c.facing;
    c.moving = !!moving;
    c.lastMoveAt = now;
  }

  private sendPresence(c: Client): void {
    const players = this.presenceList(c.region, c.account.id);
    c.seen = new Map(players.map((p) => [p.accountId, presenceKey(p)]));
    this.send(c, { t: 'presence', region: c.region, players, full: true });
  }

  private playerView(c: Client): ServerPlayerView {
    const p = activePokemon(c.save);
    const now = nowMs();
    return {
      accountId: c.account.id, username: c.account.username, displayName: c.account.displayName, avatar: c.account.avatar, region: c.region,
      x: Math.round(c.x), y: Math.round(c.y), facing: c.facing, activeUid: p?.uid ?? null,
      species: p?.species ?? null, shiny: !!p?.shiny, level: p?.level ?? 1,
      moving: c.moving && now - c.lastMoveAt < 600, updatedAt: now,
      petState: this.petState(c, now), emote: c.emote && now - c.emote.at < 4_000 ? c.emote : null,
      partyId: this.partyOf(c.account.id)?.id ?? null,
    };
  }

  /** STORED/IN_PARTY live in the save; SUMMONING/ACTIVE/RECALLING are timed here so every client agrees. */
  private petState(c: Client, now = nowMs()): PetState {
    if (c.petUntil && now >= c.petUntil) {
      c.pet = c.pet === 'recalling' ? 'none' : c.pet === 'summoning' ? 'active' : c.pet;
      c.petUntil = 0;
    }
    if (c.pet === 'recalling') return 'recalling';
    if (!activePokemon(c.save)) return 'none';
    return c.pet === 'none' ? 'active' : c.pet;
  }

  private presenceList(region: string, exceptId?: string): ServerPlayerView[] {
    const me = exceptId ? this.byAccount.get(exceptId) : undefined;
    const out: ServerPlayerView[] = [];
    for (const c of this.byAccount.values()) {
      if (c.region !== region || c.account.id === exceptId) continue;
      if (me && !this.relevant(me, c)) continue;
      out.push(this.playerView(c));
    }
    return out;
  }

  private broadcastPresence(): void {
    if (!this.byAccount.size) return;
    const byRegion = new Map<string, Client[]>();
    for (const c of this.byAccount.values()) {
      const list = byRegion.get(c.region) ?? [];
      list.push(c); byRegion.set(c.region, list);
    }
    for (const [region, list] of byRegion) {
      const views = new Map(list.map((o) => { const v = this.playerView(o); return [o, { v, key: presenceKey(v) }]; }));
      for (const c of list) {
        // Deltas only: players whose state changed, plus those who left the view. Idle crowds cost nothing.
        if (!c.seen) { this.sendPresence(c); continue; }
        const players: ServerPlayerView[] = [];
        const visible = new Set<string>();
        for (const o of list) {
          if (o === c || !this.relevant(c, o)) continue;
          const { v, key } = views.get(o)!;
          visible.add(v.accountId);
          if (c.seen.get(v.accountId) !== key) { players.push(v); c.seen.set(v.accountId, key); }
        }
        const gone = [...c.seen.keys()].filter((id) => !visible.has(id));
        for (const id of gone) c.seen.delete(id);
        if (players.length || gone.length) this.send(c, { t: 'presence', region, players, gone });
      }
    }
  }

  private flushPositions(): void {
    for (const c of this.byAccount.values()) {
      this.db.run('UPDATE players SET x = ?, y = ?, facing = ?, moving = ?, last_seen = ? WHERE account_id = ?',
        c.x, c.y, c.facing, c.moving ? 1 : 0, nowMs(), c.account.id);
    }
  }

  private handleAction(c: Client, msg: Extract<ClientMsg, { t: 'action' }>, now: number): void {
    const fieldChange = msg.type === 'party.setActive' || msg.type === 'party.switch' || msg.type === 'party.recall';
    try {
      const replay = hasCachedAction(this.db, c.account.id, msg.actionId);
      if (!replay && PC_ACTIONS.has(msg.type) && !this.nearPc(c)) {
        throw new ActionError('NOT_AT_PC', 'Hãy đến máy PC ở Trung tâm Pokémon (hoặc phòng thí nghiệm) để dùng PC.');
      }
      if (fieldChange && !replay) {
        const left = this.config.switchCooldownMs - (now - c.lastSwitchAt);
        if (left > 0) throw new ActionError('SWITCH_COOLDOWN', `Chờ ${Math.ceil(left / 100) / 10}s rồi mới đổi Pokémon.`);
        const state = this.petState(c, now);
        if (state === 'summoning' || state === 'recalling') throw new ActionError('SWITCH_BUSY', 'Pokémon đang được gọi ra / thu về.');
      }
      const before = activePokemon(c.save);
      const out = performAction(this.db, c.account.id, msg.actionId, msg.type, msg.data);
      // A retried action may have an old cached result. Never rewind the live session to it.
      c.save = readSave(this.db, c.account.id);
      const after = activePokemon(c.save);
      if (!replay && before?.uid !== after?.uid) this.fieldChanged(c, before?.species ?? null, after?.species ?? null, now);
      this.send(c, { t: 'actionResult', actionId: msg.actionId, ok: true, save: c.save, result: out.result });
      // active Pokémon changed: other players see the new lead immediately
      this.broadcastPresence();
    } catch (e) {
      if (e instanceof ActionError) this.send(c, { t: 'actionError', actionId: msg.actionId, ok: false, code: e.code, message: e.message });
      else {
        this.log('action error', e);
        this.send(c, { t: 'actionError', actionId: msg.actionId, ok: false, code: 'SERVER_ERROR', message: 'Máy chủ không xử lý được hành động.' });
      }
    }
  }

  private nearPc(c: Client): boolean {
    const map = this.regionMap(c.region);
    return !!map && map.pcTerminalTiles().some((t) => Math.hypot(t.x * TILE_PX - c.x, t.y * TILE_PX - c.y) <= this.config.pcRange);
  }

  /** Portal travel: must stand at the portal; target region enabled; story flag or the online level gate. */
  private travel(c: Client, portalId: unknown): void {
    const fail = (code: string, message: string) => this.send(c, { t: 'error', code, message });
    const map = this.regionMap(c.region);
    const portal = map?.portals().find((p) => p.id === portalId);
    if (!portal) return fail('NO_PORTAL', 'Không có cổng này.');
    if (Math.hypot((portal.x + 0.5) * TILE_PX - c.x, (portal.y + 0.5) * TILE_PX - c.y) > PORTAL_RANGE) return fail('TOO_FAR', 'Hãy đến gần cổng.');
    if (!this.maps.has(portal.to)) return fail('REGION_NOT_AVAILABLE', 'Vùng này chưa mở trên máy chủ.');
    const st = new AdventureState(c.save, 'adventure');
    const level = playerLevel(c.save);
    const locked = (portal.requires ?? []).filter((f) => !st.hasFlag(f) && !(ONLINE_BADGE_LEVEL[f] != null && level >= ONLINE_BADGE_LEVEL[f]));
    if (locked.length) {
      const need = locked.map((f) => ONLINE_BADGE_LEVEL[f] != null ? `đội đạt Lv${ONLINE_BADGE_LEVEL[f]}` : 'mở theo cốt truyện').join(', ');
      return fail('PORTAL_LOCKED', `Cổng ${portal.name} còn khóa: cần ${need}.`);
    }
    const x = (portal.toX + 0.5) * TILE_PX, y = (portal.toY + 0.5) * TILE_PX;
    const changed = portal.to !== c.region;
    this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
      c.account.id, 'world.travel', JSON.stringify({ from: c.region, to: portal.to, portal: portal.id }), nowMs());
    if (changed) {
      const st2 = new AdventureState(c.save, 'adventure');
      st2.adv.visited = { ...(st2.adv.visited ?? {}), [portal.to]: st2.adv.visited?.[portal.to] ?? nowMs() };
    }
    // the client reloads the map first, then receives the new region's Alpha / event / chat state
    c.save.adventure!.region = portal.to;
    c.save.adventure!.pos = { x, y };
    this.send(c, { t: 'region', region: portal.to, x, y, save: c.save });
    this.placeInRegion(c, portal.to, x, y);
  }

  private accountOp(c: Client, msg: Extract<ClientMsg, { t: 'account' }>): void {
    try {
      if (msg.op === 'changePassword') {
        changePassword(this.db, c.account.id, c.token, String(msg.password ?? ''), String(msg.newPassword ?? ''));
        this.send(c, { t: 'actionResult', actionId: msg.actionId, ok: true, save: c.save, result: { op: msg.op } });
        this.send(c, { t: 'notice', message: 'Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.' });
      } else if (msg.op === 'recoveryCode') {
        const code = regenerateRecovery(this.db, c.account.id, String(msg.password ?? ''));
        this.send(c, { t: 'recoveryCode', code });
      } else if (msg.op === 'logoutAll') {
        logoutAll(this.db, c.account.id);
        c.token = '';
        this.closeWithError(c, 'LOGGED_OUT', 'Đã đăng xuất khỏi mọi thiết bị.');
      }
    } catch (e) {
      const err = e as AuthError;
      this.send(c, { t: 'actionError', actionId: msg.actionId, ok: false, code: err.code ?? 'SERVER_ERROR', message: err.message ?? 'Lỗi tài khoản.' });
    }
  }

  /** Switch = recall the old Pokémon, wait for it, then summon the new one; never two on the field. */
  private fieldChanged(c: Client, oldSpecies: string | null, newSpecies: string | null, now: number): void {
    c.lastSwitchAt = now;
    if (oldSpecies) this.broadcastNear(c, { t: 'petFx', accountId: c.account.id, kind: 'recall', species: oldSpecies, x: c.x, y: c.y });
    if (newSpecies) {
      this.broadcastNear(c, { t: 'petFx', accountId: c.account.id, kind: 'summon', species: newSpecies, x: c.x, y: c.y });
      c.pet = 'summoning';
      c.petUntil = now + this.config.summonMs * (oldSpecies ? 2 : 1);
    } else {
      c.pet = 'recalling';
      c.petUntil = now + this.config.summonMs;
    }
  }

  private emote(c: Client, kind: unknown, now: number): void {
    if (!(EMOTES as readonly unknown[]).includes(kind)) return;
    if (now - c.lastEmoteAt < 1_500) return;
    c.lastEmoteAt = now;
    c.emote = { kind: kind as EmoteKind, at: now };
    this.broadcastNear(c, { t: 'emote', accountId: c.account.id, kind: kind as EmoteKind, at: now });
  }

  /** Private messages only between accepted friends, never through a block. */
  private whisper(c: Client, actionId: string, targetRaw: unknown, bodyRaw: unknown, now: number): void {
    const fail = (code: string, message: string) => this.send(c, { t: 'actionError', actionId, ok: false, code, message });
    if (now - c.lastChatAt < 2_000) return fail('CHAT_RATE_LIMIT', 'Chat chậm thôi: 1 tin / 2 giây.');
    const target = this.db.one<{ id: string; display_name: string }>('SELECT id, display_name FROM accounts WHERE username = ?', sanitizeBody(targetRaw, 20));
    if (!target || target.id === c.account.id) return fail('NO_PLAYER', 'Không tìm thấy người chơi.');
    const friends = this.db.one("SELECT 1 AS x FROM friends WHERE account_id = ? AND friend_id = ? AND status = 'accepted'", c.account.id, target.id);
    if (!friends || this.blockedBetween(c.account.id, target.id)) return fail('NOT_FRIENDS', 'Chỉ nhắn riêng được cho bạn bè.');
    const to = this.byAccount.get(target.id);
    if (!to) return fail('OFFLINE', 'Người chơi đang offline.');
    const body = moderate(sanitizeBody(bodyRaw, 200));
    if (!body.body) return fail('EMPTY_MESSAGE', 'Tin nhắn trống.');
    c.lastChatAt = now;
    const channel = 'dm:' + [c.account.id, target.id].sort().join(':');
    this.db.run('INSERT INTO chat_messages (channel, from_id, body, created_at, moderated) VALUES (?, ?, ?, ?, ?)',
      channel, c.account.id, body.body, now, body.moderated ? 1 : 0);
    const msg: ServerMsg = { t: 'whisper', from: c.account.id, fromName: c.account.displayName, to: target.id, toName: target.display_name, body: body.body, at: now };
    this.send(c, msg); this.send(to, msg);
  }

  // ───────────────────────────── shared Alpha raids ─────────────────────────────

  private alphaSpot(region: string): { x: number; y: number } {
    const map = this.regionMap(region);
    if (!map) return { x: 72 * TILE_PX, y: 78 * TILE_PX };
    const baseX = 72, baseY = 78;
    for (let r = 0; r < 12; r++) {
      for (let i = 0; i < 24; i++) {
        const x = baseX + Math.round(Math.cos(i / 24 * Math.PI * 2) * r);
        const y = baseY + Math.round(Math.sin(i / 24 * Math.PI * 2) * r);
        if (!map.solidAt(x, y)) return { x: (x + 0.5) * TILE_PX, y: (y + 0.5) * TILE_PX };
      }
    }
    return { x: (baseX + 0.5) * TILE_PX, y: (baseY + 0.5) * TILE_PX };
  }

  private spawnAlpha(region = this.config.enabledRegions[0] ?? 'ca-mau'): AlphaRow | null {
    const existing = this.activeAlpha(region);
    if (existing) return existing;
    const map = this.regionMap(region);
    if (!map) return null;
    const spot = this.alphaSpot(region);
    const ev = this.activeEvent(region);
    const cfg = REGION_ALPHA[region] ?? REGION_ALPHA['ca-mau'];
    const species = ev ? eventDef(ev.type).species : cfg.species[Math.floor(Math.random() * cfg.species.length)];
    const level = ev ? cfg.eventLevel : cfg.level;
    const maxHp = 900 + level * 80 + (ev?.legendary ? 3000 : 0);
    const id = randomUUID();
    this.db.run(
      'INSERT INTO alpha_spawns (id, region, species, level, hp, max_hp, x, y, status, spawned_at, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, region, species, level, maxHp, maxHp, spot.x, spot.y, 'active', nowMs(), ev?.id ?? null,
    );
    this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (NULL, ?, ?, ?)',
      'world.alpha_spawn', JSON.stringify({ id, region, species, level, maxHp }), nowMs());
    const row = this.db.one<AlphaRow>('SELECT * FROM alpha_spawns WHERE id = ?', id)!;
    this.broadcast(region, { t: 'alpha', alpha: this.alphaView(row) });
    this.broadcast(region, { t: 'notice', message: `Alpha ${POKEMON.get(species)?.name ?? species} Lv${level} xuất hiện gần trung tâm!` });
    this.log('alpha spawn', species, level, maxHp, 'in', region);
    return row;
  }

  private activeAlpha(region: string): AlphaRow | undefined {
    return this.db.one<AlphaRow>(
      "SELECT * FROM alpha_spawns WHERE region = ? AND status = 'active' ORDER BY spawned_at DESC LIMIT 1", region,
    );
  }

  private alphaView(row: AlphaRow | undefined): ServerAlphaView | null {
    if (!row) return null;
    const parts = this.db.all<{ account_id: string; display_name: string; damage: number }>(
      `SELECT c.account_id, a.display_name, c.damage FROM alpha_contributions c
         JOIN accounts a ON a.id = c.account_id WHERE c.alpha_id = ? ORDER BY c.damage DESC`, row.id,
    );
    return {
      id: row.id, region: row.region, species: row.species, level: row.level, hp: Math.max(0, row.hp),
      maxHp: row.max_hp, x: row.x, y: row.y, status: row.status, spawnedAt: row.spawned_at,
      participants: parts.slice(0, 8).map((p) => ({ accountId: p.account_id, displayName: p.display_name, damage: p.damage })),
      participantCount: parts.length,
    };
  }

  private alphaAttack(c: Client, actionId: string, now: number): void {
    if (now - c.lastAlphaAt < 900) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'COOLDOWN', message: 'Chiêu đang hồi.' });
      return;
    }
    const alpha = this.activeAlpha(c.region);
    if (!alpha) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'NO_ALPHA', message: 'Không có Alpha nào trong vùng.' });
      return;
    }
    const active = activePokemon(c.save);
    if (!active || (active.hpFrac ?? 1) <= 0) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'NO_ACTIVE', message: 'Hãy gọi một Pokémon còn khỏe ra trước.' });
      return;
    }
    if (Math.hypot(alpha.x - c.x, alpha.y - c.y) > 320) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'OUT_OF_RANGE', message: 'Alpha ở quá xa.' });
      return;
    }
    if (!c.save.adventure?.party.includes(active.uid)) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'NOT_IN_PARTY', message: 'Pokémon không có trong đội.' });
      return;
    }
    if (this.petState(c, now) !== 'active') {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'SUMMONING', message: 'Pokémon chưa ra sân xong.' });
      return;
    }
    c.lastAlphaAt = now;
    let attackers = this.alphaAttackers.get(alpha.id);
    if (!attackers) this.alphaAttackers.set(alpha.id, attackers = new Map());
    attackers.set(c.account.id, active.uid);
    const def = POKEMON.get(active.species)!;
    const stats = calcStats(def.baseStats, active.level, individualOf(active));
    const damage = Math.min(alpha.hp, Math.max(8, Math.round((stats.atk * 0.55 + stats.spa * 0.4 + active.level * 2.5) * (0.9 + Math.random() * 0.2))));
    let defeated: AlphaRow | null = null;
    let view: ServerAlphaView | null = null;
    const rewards: AlphaReward[] = [];
    try {
      this.db.tx(() => {
        const fresh = this.db.one<AlphaRow>('SELECT * FROM alpha_spawns WHERE id = ?', alpha.id);
        if (!fresh || fresh.status !== 'active') return;
        const newHp = Math.max(0, fresh.hp - damage);
        this.db.run('UPDATE alpha_spawns SET hp = ? WHERE id = ?', newHp, alpha.id);
        this.db.run(
          `INSERT INTO alpha_contributions (alpha_id, account_id, damage, rewarded) VALUES (?, ?, ?, 0)
           ON CONFLICT(alpha_id, account_id) DO UPDATE SET damage = damage + excluded.damage`,
          alpha.id, c.account.id, damage,
        );
        this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
          c.account.id, 'alpha.attack', JSON.stringify({ alphaId: alpha.id, damage, hp: newHp }), now);
        if (newHp <= 0) {
          this.db.run("UPDATE alpha_spawns SET status = 'defeated', defeated_at = ? WHERE id = ?", now, alpha.id);
          defeated = this.db.one<AlphaRow>('SELECT * FROM alpha_spawns WHERE id = ?', alpha.id)!;
          rewards.push(...this.grantAlphaRewards(alpha, now));
        }
      });
      const fresh = this.db.one<AlphaRow>('SELECT * FROM alpha_spawns WHERE id = ?', alpha.id)!;
      view = this.alphaView(fresh);
      if (view) this.broadcast(c.region, { t: 'alphaHit', alpha: view, damage, contribution: this.contribution(alpha.id, c.account.id) });
      if (defeated) {
        this.broadcast(c.region, { t: 'alphaDefeated', alpha: view!, rewards });
        // each participant also receives their own updated canonical save
        for (const r of rewards) {
          const pc = this.byAccount.get(r.accountId);
          if (pc) {
            pc.save = readSave(this.db, r.accountId);
            this.send(pc, { t: 'alphaDefeated', alpha: view!, rewards, save: pc.save });
          }
        }
        this.scheduleAlphaRespawn(c.region);
      }
      this.advanceEvent(c.region, damage, c.account.id, !!defeated);
    } catch (e) {
      this.log('alpha attack failed', e);
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'SERVER_ERROR', message: 'Không thể xử lý đòn đánh.' });
    }
  }

  private contribution(alphaId: string, accountId: string): number {
    return Number(this.db.one<{ damage: number }>('SELECT damage FROM alpha_contributions WHERE alpha_id = ? AND account_id = ?', alphaId, accountId)?.damage ?? 0);
  }

  private grantAlphaRewards(alpha: AlphaRow, now: number): AlphaReward[] {
    const rows = this.db.all<{ account_id: string; damage: number }>(
      'SELECT account_id, damage FROM alpha_contributions WHERE alpha_id = ? AND rewarded = 0 ORDER BY damage DESC', alpha.id,
    );
    const out: AlphaReward[] = [];
    const top = rows[0]?.account_id;
    const attackers = this.alphaAttackers.get(alpha.id);
    this.alphaAttackers.delete(alpha.id);
    const contributors = new Set(rows.map((r) => r.account_id));
    const baseExp = Math.round(expYield(alpha.species, alpha.level) * ALPHA_EXP_MULT);
    for (const r of rows) {
      const tier = r.damage >= alpha.max_hp * 0.25 ? 'l' : r.damage >= alpha.max_hp * 0.1 ? 'm' : 's';
      const candy = `exp-candy-${tier}`;
      const money = tier === 'l' ? 800 : tier === 'm' ? 450 : 180;
      const items: Record<string, number> = { [candy]: 1 };
      if (r.account_id === top) items['rare-candy'] = 1;
      // Party bonus: only party mates who actually hit this Alpha count (no AFK farming), capped.
      const party = this.partyOf(r.account_id);
      const mates = party ? this.db.all<{ account_id: string }>('SELECT account_id FROM party_members WHERE party_id = ?', party.id)
        .filter((m) => m.account_id !== r.account_id && contributors.has(m.account_id)).length : 0;
      const partyBonus = Math.min(PARTY_BONUS_MAX, mates * PARTY_BONUS_PER_MEMBER);
      let exp = 0, levels = 0;
      try {
        const save = readSave(this.db, r.account_id);
        const st = new AdventureState(save, 'adventure');
        st.addItems(items);
        st.earn(money);
        const uid = attackers?.get(r.account_id);
        const p = uid ? st.owned(uid) : undefined;
        if (p && p.level < MAX_LEVEL) {
          const cap = expForLevel(p.species, MAX_LEVEL);
          exp = Math.max(0, Math.min(cap - p.exp, Math.round(baseExp * (1 + partyBonus))));
          const before = p.level;
          p.exp += exp;
          p.level = levelForExp(p.species, p.exp);
          levels = p.level - before;
          for (let i = 0; i < levels; i++) addFriendship(p, 'levelup');
        }
        writeSave(this.db, r.account_id, st.save);
      } catch (e) {
        this.log('reward save failed', r.account_id, e);
        continue;
      }
      this.db.run('UPDATE alpha_contributions SET rewarded = 1 WHERE alpha_id = ? AND account_id = ?', alpha.id, r.account_id);
      this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
        r.account_id, 'alpha.reward', JSON.stringify({ alphaId: alpha.id, damage: r.damage, candy, money, exp, levels, partyBonus }), now);
      out.push({ accountId: r.account_id, money, items, expCandy: candy, contribution: r.damage, exp, levels, partyBonus });
    }
    return out;
  }

  private scheduleAlphaRespawn(region: string): void {
    clearTimeout(this.alphaTimers.get(region));
    this.alphaTimers.set(region, setTimeout(() => {
      this.alphaTimers.delete(region);
      if (!this.closed) this.spawnAlpha(region);
    }, this.config.alphaRespawnMs));
  }

  // ───────────────────────────── 10-minute regional events ─────────────────────────────

  private tickWorld(): void {
    const now = nowMs();
    this.tickLagMs = Math.max(0, now - this.lastTickAt - 1_000);
    this.lastTickAt = now;
    for (const region of this.config.enabledRegions) {
      let ev = this.activeEvent(region);
      if (ev && now >= ev.ends_at) { this.finishEvent(ev.id, 'expired'); ev = undefined; }
      // One scheduler per region on the server (never per client): start-to-start every eventIntervalMs,
      // announced eventAnnounceMs ahead; an event still running pushes the next cycle back.
      const due = (this.lastEventStart.get(region) ?? now) + this.config.eventIntervalMs;
      const lead = Math.min(this.config.eventAnnounceMs, this.config.eventIntervalMs);
      let pending = this.incoming.get(region);
      if (!ev && !pending && now >= due - lead) {
        pending = { def: this.chooseEvent(region), startsAt: Math.max(due, now) };
        this.incoming.set(region, pending);
        this.broadcast(region, { t: 'eventIncoming', incoming: this.incomingView(region) });
        this.broadcast(region, { t: 'notice', message: `SỰ KIỆN SẮP DIỄN RA: ${pending.def.name} (${pending.def.difficulty}, gợi ý Lv${pending.def.recommendedLevel}).` });
      }
      if (!ev && pending && now >= pending.startsAt) {
        this.incoming.delete(region);
        this.startEvent(region, pending.def);
      }
      if (!this.activeAlpha(region) && !this.alphaTimers.has(region)) this.spawnAlpha(region);
    }
    for (const c of this.byAccount.values()) c.ws.ping?.();
  }

  private chooseEvent(region: string): RegionalEventDef {
    const last = this.db.one<{ type: string }>('SELECT type FROM world_events WHERE region = ? ORDER BY starts_at DESC LIMIT 1', region);
    const maxPlayerLevel = Math.max(0, ...[...this.byAccount.values()].filter((c) => c.region === region).map((c) => playerLevel(c.save)));
    return pickEvent(region, { lastType: last?.type, maxPlayerLevel });
  }

  private incomingView(region: string): ServerEventIncoming | null {
    const p = this.incoming.get(region);
    if (!p) return null;
    return {
      region, type: p.def.type, name: p.def.name, startsAt: p.startsAt, difficulty: p.def.difficulty,
      recommendedLevel: p.def.recommendedLevel, rewards: p.def.rewards, objective: eventObjectiveLabel(p.def.type), legendary: p.def.legendary,
    };
  }

  /** Event updates carry each player's own contribution. */
  private broadcastEvent(row: EventRow, message?: string): void {
    for (const c of this.byAccount.values()) {
      if (c.region !== row.region) continue;
      this.send(c, { t: 'event', event: this.eventView(row, c.account.id), ...(message ? { message } : {}) });
    }
  }

  private activeEvent(region: string): EventRow | undefined {
    return this.db.one<EventRow>(
      "SELECT * FROM world_events WHERE region = ? AND status = 'active' ORDER BY starts_at DESC LIMIT 1", region,
    );
  }

  private eventView(row: EventRow, viewer?: string): ServerEventView {
    const def = eventDef(row.type);
    const stats = this.db.one<{ n: number; mine: number | null }>(
      'SELECT COUNT(*) AS n, SUM(CASE WHEN account_id = ? THEN contribution END) AS mine FROM event_participants WHERE event_id = ?', viewer ?? '', row.id,
    );
    return {
      id: row.id, type: row.type, name: row.name, region: row.region, startsAt: row.starts_at, endsAt: row.ends_at,
      goal: row.goal, progress: row.progress, status: row.status, legendary: !!row.legendary, minLevel: row.min_level,
      objective: eventObjectiveLabel(row.type), difficulty: def.difficulty, recommendedLevel: def.recommendedLevel, rewards: def.rewards,
      participants: Number(stats?.n ?? 0), myContribution: Number(stats?.mine ?? 0),
    };
  }

  private startEvent(region: string, def: RegionalEventDef = this.chooseEvent(region)): void {
    const id = randomUUID();
    const start = nowMs(), end = start + this.config.eventDurationMs;
    this.db.run(
      'INSERT INTO world_events (id, type, name, region, starts_at, ends_at, goal, progress, status, legendary, min_level, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
      id, def.type, def.name, region, start, end, def.goal, 'active', def.legendary ? 1 : 0, def.minLevel, null,
    );
    this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (NULL, ?, ?, ?)',
      'world.event_start', JSON.stringify({ id, type: def.type, region, goal: def.goal, legendary: def.legendary }), start);
    this.lastEventStart.set(region, start);
    const row = this.db.one<EventRow>('SELECT * FROM world_events WHERE id = ?', id)!;
    this.broadcast(region, { t: 'eventIncoming', incoming: null });
    this.broadcastEvent(row, `${def.name}: ${eventObjectiveLabel(def.type)} (${def.goal}). Alpha tiếp theo: ${def.species}.`);
    this.log('event start', def.type, region, def.goal);
  }

  private advanceEvent(region: string, damage: number, accountId: string, defeated: boolean): void {
    const ev = this.activeEvent(region);
    if (!ev) return;
    if (nowMs() >= ev.ends_at) { this.finishEvent(ev.id, 'expired'); return; }
    const objective = eventDef(ev.type).objective;
    const progress = objective === 'damage' ? damage : objective === 'hits' ? 1 : defeated ? 1 : 0;
    this.db.tx(() => {
      this.db.run(`INSERT INTO event_participants (event_id, account_id, contribution, rewarded, joined_at) VALUES (?, ?, ?, 0, ?)
        ON CONFLICT(event_id, account_id) DO UPDATE SET contribution = contribution + excluded.contribution`, ev.id, accountId, damage, nowMs());
      this.db.run('UPDATE world_events SET progress = MIN(goal, progress + ?) WHERE id = ?', progress, ev.id);
    });
    const after = this.db.one<EventRow>('SELECT * FROM world_events WHERE id = ?', ev.id)!;
    this.broadcastEvent(after);
    if (after.progress >= after.goal) this.finishEvent(after.id, 'completed');
  }

  private finishEvent(eventId: string, status: 'completed' | 'expired'): void {
    const ev = this.db.one<EventRow>('SELECT * FROM world_events WHERE id = ?', eventId);
    if (!ev || ev.status !== 'active') return;
    const now = nowMs();
    const rewards = new Map<string, { candy: string; money: number }>();
    this.db.tx(() => {
      this.db.run('UPDATE world_events SET status = ?, ends_at = ? WHERE id = ?', status, Math.min(now, ev.ends_at), eventId);
      const rows = this.db.all<{ account_id: string; contribution: number; rewarded: number }>(
        'SELECT account_id, contribution, rewarded FROM event_participants WHERE event_id = ?', eventId,
      );
      for (const r of rows) {
        if (r.rewarded) continue;
        const tier = r.contribution >= 1000 ? 'l' : r.contribution >= 300 ? 'm' : 's';
        const candy = `exp-candy-${tier}`;
        const money = tier === 'l' ? 1200 : tier === 'm' ? 600 : 250;
        try {
          const save = readSave(this.db, r.account_id);
          const st = new AdventureState(save, 'adventure');
          st.addItems({ [candy]: 1 });
          st.earn(money);
          writeSave(this.db, r.account_id, st.save);
        } catch (e) { this.log('event reward failed', r.account_id, e); continue; }
        this.db.run('UPDATE event_participants SET rewarded = 1 WHERE event_id = ? AND account_id = ?', eventId, r.account_id);
        this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
          r.account_id, 'event.reward', JSON.stringify({ eventId, contribution: r.contribution, candy, money }), now);
        rewards.set(r.account_id, { candy, money });
      }
    });
    this.broadcastEvent(this.db.one<EventRow>('SELECT * FROM world_events WHERE id = ?', eventId)!,
      status === 'completed' ? `Sự kiện ${ev.name} hoàn thành! Phần thưởng đã trao theo đóng góp.` : `Sự kiện ${ev.name} kết thúc. Phần thưởng đã trao theo đóng góp.`);
    for (const accountId of rewards.keys()) {
      const c = this.byAccount.get(accountId);
      if (!c) continue;
      c.save = readSave(this.db, accountId);
      this.send(c, { t: 'saveSync', save: c.save });
      this.send(c, { t: 'notice', message: `Thưởng sự kiện: ${rewards.get(accountId)!.candy} + ${rewards.get(accountId)!.money} xu.`, level: 'info' });
    }
    this.log('event finish', ev.type, status);
  }

  // ───────────────────────────── chat / friends / party ─────────────────────────────

  private sendChatHistory(c: Client): void {
    const region = 'region:' + c.region;
    const rows = this.db.all<ChatRow>(
      'SELECT m.*, a.display_name FROM chat_messages m JOIN accounts a ON a.id = m.from_id WHERE m.channel = ? ORDER BY m.id DESC LIMIT 30', this.localChannel(c),
    ).reverse().filter((r) => !this.blockedBetween(c.account.id, r.from_id));
    this.send(c, { t: 'chatHistory', channel: region, messages: rows.map((r) => ({ ...chatView(r), channel: region })) });
    const party = this.partyOf(c.account.id);
    if (party) {
      const prows = this.db.all<ChatRow>(
        'SELECT m.*, a.display_name FROM chat_messages m JOIN accounts a ON a.id = m.from_id WHERE m.channel = ? ORDER BY m.id DESC LIMIT 30', 'party:' + party.id,
      ).reverse();
      this.send(c, { t: 'chatHistory', channel: 'party:' + party.id, messages: prows.map(chatView) });
    }
  }

  private chat(c: Client, actionId: string, channelRaw: string, bodyRaw: unknown, now: number): void {
    const channel = sanitizeBody(channelRaw, 40);
    if (now - c.lastChatAt < 2_000) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'CHAT_RATE_LIMIT', message: 'Chat chậm thôi: 1 tin / 2 giây.' });
      return;
    }
    const body = sanitizeBody(bodyRaw, 200);
    if (body.length < 1) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'EMPTY_MESSAGE', message: 'Tin nhắn trống.' });
      return;
    }
    if (channel !== 'region:' + c.region && !channel.startsWith('party:')) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'BAD_CHANNEL', message: 'Kênh chat không hợp lệ.' });
      return;
    }
    if (channel.startsWith('party:')) {
      const party = this.partyOf(c.account.id);
      if (!party || 'party:' + party.id !== channel) {
        this.send(c, { t: 'actionError', actionId, ok: false, code: 'NOT_IN_PARTY', message: 'Bạn không ở trong nhóm này.' });
        return;
      }
    }
    c.lastChatAt = now;
    const m = moderate(body);
    const stored = channel.startsWith('party:') ? channel : this.localChannel(c);
    const id = Number(this.db.run(
      'INSERT INTO chat_messages (channel, from_id, body, created_at, moderated) VALUES (?, ?, ?, ?, ?)',
      stored, c.account.id, m.body, now, m.moderated ? 1 : 0,
    ).lastInsertRowid);
    this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
      c.account.id, 'chat.send', JSON.stringify({ channel, id, moderated: m.moderated }), now);
    const message: ServerChatMessage = { id, channel, from: c.account.id, fromName: c.account.displayName, body: m.body, at: now, moderated: m.moderated };
    if (channel.startsWith('party:')) {
      const party = this.partyOf(c.account.id)!;
      for (const member of this.partyMembers(party.id)) this.sendTo(member.accountId, { t: 'chat', message });
    } else {
      for (const other of this.byAccount.values()) {
        if (other.region !== c.region || other.channel !== c.channel) continue;
        if (this.blockedBetween(c.account.id, other.account.id)) continue;
        this.send(other, { t: 'chat', message });
      }
    }
  }

  private friendOp(c: Client, actionId: string, op: string, targetRaw: string, reasonRaw?: string): void {
    const targetName = sanitizeBody(targetRaw, 20);
    const target = this.db.one<{ id: string; display_name: string }>('SELECT id, display_name FROM accounts WHERE username = ?', targetName);
    if (!target) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'NO_PLAYER', message: 'Không tìm thấy người chơi.' });
      return;
    }
    if (target.id === c.account.id) {
      this.send(c, { t: 'actionError', actionId, ok: false, code: 'SELF', message: 'Không thể tự kết bạn với chính mình.' });
      return;
    }
    const now = nowMs();
    try {
      this.db.tx(() => {
        switch (op) {
          case 'request': {
            const blocked = this.db.one("SELECT 1 AS x FROM friends WHERE account_id = ? AND friend_id = ? AND status = 'blocked'", target.id, c.account.id);
            if (blocked) throw new ActionError('BLOCKED', 'Người chơi đã chặn bạn.');
            const existing = this.db.one<{ status: string }>('SELECT status FROM friends WHERE account_id = ? AND friend_id = ?', c.account.id, target.id);
            if (existing?.status === 'accepted') throw new ActionError('ALREADY_FRIEND', 'Hai người đã là bạn.');
            this.db.run(
              `INSERT INTO friends (account_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)
               ON CONFLICT(account_id, friend_id) DO UPDATE SET status = 'pending', created_at = excluded.created_at`,
              c.account.id, target.id, now,
            );
            break;
          }
          case 'accept': {
            const pending = this.db.one<{ status: string }>('SELECT status FROM friends WHERE account_id = ? AND friend_id = ? AND status = ?', target.id, c.account.id, 'pending');
            if (!pending) throw new ActionError('NO_REQUEST', 'Không có lời mời kết bạn.');
            this.db.run("UPDATE friends SET status = 'accepted' WHERE account_id = ? AND friend_id = ?", target.id, c.account.id);
            this.db.run(
              `INSERT INTO friends (account_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', ?)
               ON CONFLICT(account_id, friend_id) DO UPDATE SET status = 'accepted'`,
              c.account.id, target.id, now,
            );
            break;
          }
          case 'remove':
            this.db.run('DELETE FROM friends WHERE (account_id = ? AND friend_id = ?) OR (account_id = ? AND friend_id = ?)',
              c.account.id, target.id, target.id, c.account.id);
            break;
          case 'block':
            this.db.run('DELETE FROM friends WHERE (account_id = ? AND friend_id = ?) OR (account_id = ? AND friend_id = ?)',
              c.account.id, target.id, target.id, c.account.id);
            this.db.run(
              `INSERT INTO friends (account_id, friend_id, status, created_at) VALUES (?, ?, 'blocked', ?)
               ON CONFLICT(account_id, friend_id) DO UPDATE SET status = 'blocked'`,
              c.account.id, target.id, now,
            );
            break;
          case 'unblock':
            this.db.run("DELETE FROM friends WHERE account_id = ? AND friend_id = ? AND status = 'blocked'", c.account.id, target.id);
            break;
          case 'report': {
            const reason = sanitizeBody(reasonRaw ?? '', 200) || 'Không có lý do';
            this.db.run('INSERT INTO reports (reporter_id, target_id, reason, created_at) VALUES (?, ?, ?, ?)',
              c.account.id, target.id, reason, now);
            this.send(c, { t: 'notice', message: 'Đã gửi báo cáo tới quản trị viên.' });
            break;
          }
          default:
            throw new ActionError('BAD_OP', 'Thao tác bạn bè không hợp lệ.');
        }
        this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
          c.account.id, 'friend.' + op, JSON.stringify({ target: target.id, reason: reasonRaw ?? null }), now);
      });
      this.sendFriends(c);
      if (this.byAccount.has(target.id)) this.sendFriends(this.byAccount.get(target.id)!);
      this.send(c, { t: 'actionResult', actionId, ok: true, save: c.save, result: { op } });
    } catch (e) {
      const err = e as ActionError;
      this.send(c, { t: 'actionError', actionId, ok: false, code: err.code ?? 'SERVER_ERROR', message: err.message ?? 'Lỗi bạn bè.' });
    }
  }

  private blockedBetween(a: string, b: string): boolean {
    return !!this.db.one(
      "SELECT 1 AS x FROM friends WHERE status = 'blocked' AND ((account_id = ? AND friend_id = ?) OR (account_id = ? AND friend_id = ?))",
      a, b, b, a,
    );
  }

  private sendFriends(c: Client): void {
    const rows = this.db.all<{ friend_id: string; username: string; display_name: string; status: string; created_at: number }>(
      `SELECT f.friend_id, a.username, a.display_name, f.status, f.created_at FROM friends f
         JOIN accounts a ON a.id = f.friend_id WHERE f.account_id = ? ORDER BY f.status DESC, a.display_name`, c.account.id,
    );
    const map = (r: typeof rows[number]): ServerFriend => ({
      accountId: r.friend_id, username: r.username, displayName: r.display_name,
      online: this.byAccount.has(r.friend_id), status: r.status as ServerFriend['status'], incoming: false,
    });
    const friends = rows.filter((r) => r.status !== 'pending').map(map);
    const requests = rows.filter((r) => r.status === 'pending').map(map);
    const incoming = this.db.all<{ account_id: string; username: string; display_name: string; created_at: number }>(
      `SELECT f.account_id, a.username, a.display_name, f.created_at FROM friends f
         JOIN accounts a ON a.id = f.account_id WHERE f.friend_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`, c.account.id,
    );
    for (const r of incoming) {
      requests.push({ accountId: r.account_id, username: r.username, displayName: r.display_name, online: this.byAccount.has(r.account_id), status: 'pending', incoming: true });
    }
    this.send(c, { t: 'friends', friends, requests });
  }

  private partyOf(accountId: string): { id: string; leader_id: string } | undefined {
    return this.db.one<{ id: string; leader_id: string }>(
      'SELECT p.id, p.leader_id FROM parties p JOIN party_members m ON m.party_id = p.id WHERE m.account_id = ?', accountId,
    );
  }

  private partyMembers(partyId: string, viewer?: Client): ServerPartyView['members'] {
    return this.db.all<{ account_id: string; username: string; display_name: string }>(
      'SELECT m.account_id, a.username, a.display_name FROM party_members m JOIN accounts a ON a.id = m.account_id WHERE m.party_id = ? ORDER BY m.joined_at', partyId,
    ).map((m) => {
      const c = this.byAccount.get(m.account_id);
      let level = 1;
      let save: ReturnType<typeof readSave> | undefined;
      try { save = c ? c.save : readSave(this.db, m.account_id); level = playerLevel(save); } catch { /* ignore */ }
      const pet = save ? activePokemon(save) : null;
      return {
        accountId: m.account_id, username: m.username, displayName: m.display_name, online: !!c, level,
        species: pet?.species ?? null, hpFrac: pet ? (pet.hpFrac ?? 1) : 0, region: c?.region ?? null,
        distance: c && viewer && c.region === viewer.region ? Math.round(Math.hypot(c.x - viewer.x, c.y - viewer.y)) : null,
      };
    });
  }

  private partyView(partyId: string, viewer?: Client): ServerPartyView | null {
    const p = this.db.one<{ id: string; leader_id: string }>('SELECT * FROM parties WHERE id = ?', partyId);
    if (!p) return null;
    return { id: p.id, leaderId: p.leader_id, members: this.partyMembers(p.id, viewer) };
  }

  private pendingInvite(accountId: string): { id: string; party_id: string; from_id: string; expires_at: number } | undefined {
    return this.db.one(
      "SELECT id, party_id, from_id, expires_at FROM party_invites WHERE to_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
      accountId, nowMs(),
    );
  }

  private sendParty(c: Client): void {
    const p = this.partyOf(c.account.id);
    const inv = p ? undefined : this.pendingInvite(c.account.id);
    const invite = inv ? { partyId: inv.party_id, fromName: this.db.one<{ display_name: string }>('SELECT display_name FROM accounts WHERE id = ?', inv.from_id)?.display_name ?? '?' } : null;
    this.send(c, { t: 'party', party: p ? this.partyView(p.id, c) : null, invite });
  }

  private partyOp(c: Client, actionId: string, op: string, targetRaw?: string): void {
    const targetName = targetRaw ? sanitizeBody(targetRaw, 20) : '';
    const target = targetName
      ? this.db.one<{ id: string; display_name: string }>('SELECT id, display_name FROM accounts WHERE username = ?', targetName)
      : undefined;
    const now = nowMs();
    const formerMates: string[] = [];
    try {
      this.db.tx(() => {
        const current = this.partyOf(c.account.id);
        switch (op) {
          case 'create': {
            if (current) throw new ActionError('ALREADY_IN_PARTY', 'Bạn đã ở trong một nhóm.');
            const id = randomUUID();
            this.db.run('INSERT INTO parties (id, leader_id, created_at) VALUES (?, ?, ?)', id, c.account.id, now);
            this.db.run('INSERT INTO party_members (party_id, account_id, joined_at) VALUES (?, ?, ?)', id, c.account.id, now);
            break;
          }
          case 'invite': {
            if (!target) throw new ActionError('NO_PLAYER', 'Không tìm thấy người chơi.');
            if (!current) throw new ActionError('NO_PARTY', 'Hãy tạo nhóm trước.');
            if (current.leader_id !== c.account.id) throw new ActionError('NOT_LEADER', 'Chỉ trưởng nhóm được mời.');
            if (this.partyMembers(current.id).length >= 4) throw new ActionError('PARTY_FULL', 'Nhóm đã đủ 4 người.');
            if (this.partyOf(target.id)) throw new ActionError('TARGET_IN_PARTY', 'Người chơi đã ở nhóm khác.');
            if (this.blockedBetween(c.account.id, target.id)) throw new ActionError('BLOCKED', 'Không thể mời người chơi này.');
            const recent = this.db.one<{ created_at: number }>("SELECT created_at FROM party_invites WHERE party_id = ? AND to_id = ? AND status = 'pending'", current.id, target.id);
            if (recent && now - recent.created_at < 10_000) throw new ActionError('INVITE_SPAM', 'Đã mời rồi, chờ người chơi trả lời.');
            const id = randomUUID();
            this.db.run(
              `INSERT INTO party_invites (id, party_id, from_id, to_id, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')
               ON CONFLICT(party_id, to_id) DO UPDATE SET created_at = excluded.created_at, expires_at = excluded.expires_at, status = 'pending'`,
              id, current.id, c.account.id, target.id, now, now + 5 * 60_000,
            );
            this.sendTo(target.id, { t: 'notice', message: `${c.account.displayName} mời bạn vào nhóm. Mở mục Bạn bè & nhóm để đồng ý.` });
            break;
          }
          case 'accept': {
            if (current) throw new ActionError('ALREADY_IN_PARTY', 'Bạn đã ở trong một nhóm.');
            const inv = this.db.one<{ id: string; party_id: string; status: string; expires_at: number }>(
              'SELECT * FROM party_invites WHERE to_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1', c.account.id, 'pending',
            );
            if (!inv || inv.expires_at < now) throw new ActionError('NO_INVITE', 'Không có lời mời nhóm còn hiệu lực.');
            if (this.partyMembers(inv.party_id).length >= 4) throw new ActionError('PARTY_FULL', 'Nhóm đã đủ 4 người.');
            this.db.run('INSERT INTO party_members (party_id, account_id, joined_at) VALUES (?, ?, ?)', inv.party_id, c.account.id, now);
            this.db.run("UPDATE party_invites SET status = 'accepted' WHERE id = ?", inv.id);
            this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
              c.account.id, 'party.join', JSON.stringify({ partyId: inv.party_id }), now);
            break;
          }
          case 'decline': {
            const inv = this.pendingInvite(c.account.id);
            if (!inv) throw new ActionError('NO_INVITE', 'Không có lời mời nhóm.');
            this.db.run("UPDATE party_invites SET status = 'declined' WHERE id = ?", inv.id);
            this.sendTo(inv.from_id, { t: 'notice', message: `${c.account.displayName} đã từ chối lời mời nhóm.` });
            break;
          }
          case 'leave': {
            if (!current) throw new ActionError('NO_PARTY', 'Bạn không ở trong nhóm.');
            formerMates.push(...this.partyMembers(current.id).map((m) => m.accountId));
            this.db.run('DELETE FROM party_members WHERE party_id = ? AND account_id = ?', current.id, c.account.id);
            const next = this.db.one<{ account_id: string }>('SELECT account_id FROM party_members WHERE party_id = ? ORDER BY joined_at LIMIT 1', current.id);
            if (!next) this.db.run('DELETE FROM parties WHERE id = ?', current.id);
            else if (current.leader_id === c.account.id) this.db.run('UPDATE parties SET leader_id = ? WHERE id = ?', next.account_id, current.id);
            break;
          }
          case 'promote': {
            if (!current || current.leader_id !== c.account.id) throw new ActionError('NOT_LEADER', 'Chỉ trưởng nhóm được chuyển quyền.');
            if (!target || !this.partyMembers(current.id).some((m) => m.accountId === target.id) || target.id === c.account.id) {
              throw new ActionError('NOT_MEMBER', 'Người chơi không ở trong nhóm.');
            }
            this.db.run('UPDATE parties SET leader_id = ? WHERE id = ?', target.id, current.id);
            break;
          }
          case 'disband': {
            if (!current || current.leader_id !== c.account.id) throw new ActionError('NOT_LEADER', 'Chỉ trưởng nhóm được giải tán.');
            formerMates.push(...this.partyMembers(current.id).map((m) => m.accountId));
            this.db.run('DELETE FROM parties WHERE id = ?', current.id);
            break;
          }
          case 'kick': {
            if (!current || current.leader_id !== c.account.id) throw new ActionError('NOT_LEADER', 'Chỉ trưởng nhóm được mời ra.');
            if (!target) throw new ActionError('NO_PLAYER', 'Không tìm thấy người chơi.');
            if (target.id === c.account.id) throw new ActionError('SELF', 'Không thể tự mời ra.');
            formerMates.push(target.id);
            this.db.run('DELETE FROM party_members WHERE party_id = ? AND account_id = ?', current.id, target.id);
            break;
          }
          case 'info':
            break;
          default:
            throw new ActionError('BAD_OP', 'Thao tác nhóm không hợp lệ.');
        }
        this.db.run('INSERT INTO audit_log (account_id, action, detail_json, created_at) VALUES (?, ?, ?, ?)',
          c.account.id, 'party.' + op, JSON.stringify({ target: target?.id ?? null }), now);
      });
      this.send(c, { t: 'actionResult', actionId, ok: true, save: c.save, result: { op } });
      this.sendParty(c);
      const p = this.partyOf(c.account.id);
      if (p) for (const m of this.partyMembers(p.id)) if (m.accountId !== c.account.id) {
        const mc = this.byAccount.get(m.accountId);
        if (mc) this.sendParty(mc);
      }
      if (target && this.byAccount.has(target.id)) this.sendParty(this.byAccount.get(target.id)!);
      for (const id of formerMates) {
        const mc = this.byAccount.get(id);
        if (mc && mc !== c) this.sendParty(mc);
      }
    } catch (e) {
      const err = e as ActionError;
      this.send(c, { t: 'actionError', actionId, ok: false, code: err.code ?? 'SERVER_ERROR', message: err.message ?? 'Lỗi nhóm.' });
    }
  }

  /** Stops the clocks and closes every connection (the host closes its listener and the database). */
  shutdown(): void {
    this.stopSchedulers();
    this.closed = true;
    for (const c of this.clients.values()) { try { c.ws.close(); } catch { /* closed */ } }
  }
}

/** Presence identity without the timestamp, so unchanged players are not resent. */
function presenceKey(v: ServerPlayerView): string {
  return `${v.x},${v.y},${v.facing.toFixed(2)},${v.moving ? 1 : 0},${v.activeUid},${v.species},${v.level},${v.petState},${v.emote?.at ?? 0},${v.partyId},${v.shiny ? 1 : 0}`;
}

interface ChatRow { id: number; channel: string; from_id: string; body: string; created_at: number; moderated: number; display_name: string }
function chatView(r: ChatRow): ServerChatMessage {
  return { id: r.id, channel: r.channel, from: r.from_id, fromName: r.display_name, body: r.body, at: r.created_at, moderated: !!r.moderated };
}
