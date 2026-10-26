import type { NetMsg } from './protocol';
import { cloudBase } from './cloud';
import { LatencySeries } from './netStats';

// Two-player links. 'relay' = WebSocket through the Cloudflare backend (one Durable Object per room code relays
// the messages; works on every network). 'peer' = WebRTC through PeerJS (direct browser-to-browser; fails behind
// symmetric NAT — 4G, company networks — because there is no TURN server: the "hết thời gian chờ" timeout).
// 'local' = BroadcastChannel between tabs of the same browser (offline play on one machine, and the e2e tests).
// Whatever the link, the host stays authoritative and the messages are the same.

export type LinkKind = 'relay' | 'peer' | 'local';

export interface Link {
  readonly kind: LinkKind;
  send(m: NetMsg): void;
  /** set by the session */
  onMessage: (m: NetMsg) => void;
  onClose: (reason: string) => void;
  close(): void;
}

export interface HostHandle {
  readonly code: string;
  /** resolves when a guest has joined (only the first guest is accepted) */
  guest: Promise<Link>;
  close(): void;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const PREFIX = 'pkmsurv-v1-';

export function newRoomCode(rand: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return c;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/**
 * Which transport the page uses: `?net=local` forces BroadcastChannel (tests, same-machine play), `?net=peer` forces
 * WebRTC; otherwise the Cloudflare relay when a backend is configured, else WebRTC.
 */
export function defaultLinkKind(): LinkKind {
  const forced = new URLSearchParams(location.search).get('net');
  if (forced === 'local' || forced === 'peer') return forced;
  return cloudBase() ? 'relay' : 'peer';
}

// ───────────────────────────── BroadcastChannel ─────────────────────────────

interface LocalFrame { from: string; to?: string; join?: boolean; accept?: boolean; msg?: NetMsg; close?: boolean }

class LocalLink implements Link {
  readonly kind = 'local';
  onMessage: (m: NetMsg) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private closed = false;
  constructor(private ch: BroadcastChannel, private me: string, private peer: string) {
    ch.addEventListener('message', (e: MessageEvent<LocalFrame>) => {
      const f = e.data;
      if (f.from !== this.peer || f.to !== this.me) return;
      if (f.close) { this.shut('Đối thủ đã rời phòng'); return; }
      if (f.msg) this.onMessage(f.msg);
    });
  }
  send(m: NetMsg): void {
    if (!this.closed) this.ch.postMessage({ from: this.me, to: this.peer, msg: m } satisfies LocalFrame);
  }
  close(): void {
    if (this.closed) return;
    this.ch.postMessage({ from: this.me, to: this.peer, close: true } satisfies LocalFrame);
    this.shut('Đã rời phòng');
  }
  private shut(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose(reason);
    setTimeout(() => this.ch.close(), 50);
  }
}

function localHost(code: string): HostHandle {
  const ch = new BroadcastChannel(PREFIX + code);
  const me = 'host-' + Math.random().toString(36).slice(2);
  let taken = false;
  const guest = new Promise<Link>((resolve) => {
    ch.addEventListener('message', (e: MessageEvent<LocalFrame>) => {
      const f = e.data;
      if (!f.join || f.to !== undefined) return;
      if (taken) { ch.postMessage({ from: me, to: f.from, accept: false } satisfies LocalFrame); return; }
      taken = true;
      ch.postMessage({ from: me, to: f.from, accept: true } satisfies LocalFrame);
      resolve(new LocalLink(ch, me, f.from));
    });
  });
  return { code, guest, close: () => { if (!taken) ch.close(); } };
}

function localJoin(code: string, timeoutMs: number): Promise<Link> {
  const ch = new BroadcastChannel(PREFIX + code);
  const me = 'guest-' + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { ch.close(); reject(new Error('Không tìm thấy phòng ' + code)); }, timeoutMs);
    ch.addEventListener('message', function onAccept(e: MessageEvent<LocalFrame>) {
      const f = e.data;
      if (f.to !== me || f.accept === undefined) return;
      clearTimeout(t);
      ch.removeEventListener('message', onAccept);
      if (!f.accept) { ch.close(); reject(new Error('Phòng đã đủ người')); return; }
      resolve(new LocalLink(ch, me, f.from));
    });
    ch.postMessage({ from: me, join: true } satisfies LocalFrame);
  });
}

// ───────────────────────────── PeerJS (WebRTC) ─────────────────────────────

type PeerCtor = typeof import('peerjs').default;
type DataConnection = import('peerjs').DataConnection;
let peerCtor: Promise<PeerCtor> | null = null;
/** PeerJS is only downloaded when the player goes online. */
const loadPeer = () => (peerCtor ??= import('peerjs').then((m) => m.default));

class PeerLink implements Link {
  readonly kind = 'peer';
  onMessage: (m: NetMsg) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private closed = false;
  constructor(private conn: DataConnection, private owner: { destroy(): void }) {
    conn.on('data', (d) => { if (!this.closed) this.onMessage(d as NetMsg); });
    conn.on('close', () => this.shut('Mất kết nối với đối thủ'));
    conn.on('error', () => this.shut('Lỗi kết nối'));
  }
  send(m: NetMsg): void {
    if (!this.closed && this.conn.open) void this.conn.send(m);
  }
  close(): void {
    if (this.closed) return;
    try { this.conn.send({ t: 'bye' } satisfies NetMsg); } catch { /* already gone */ }
    setTimeout(() => this.owner.destroy(), 200);
    this.shut('Đã rời phòng');
  }
  private shut(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose(reason);
  }
}

const PEER_ERRORS: Record<string, string> = {
  'peer-unavailable': 'Không tìm thấy phòng (sai mã hoặc chủ phòng đã thoát)',
  'unavailable-id': 'Mã phòng đang được dùng',
  network: 'Không kết nối được máy chủ mai mối PeerJS (kiểm tra mạng)',
  'server-error': 'Máy chủ mai mối PeerJS đang lỗi, thử lại sau',
  'browser-incompatible': 'Trình duyệt không hỗ trợ WebRTC',
  'socket-error': 'Mất kết nối tới máy chủ mai mối',
};
const peerError = (e: { type?: string; message?: string }) => new Error(PEER_ERRORS[e.type ?? ''] ?? e.message ?? 'Lỗi kết nối');

async function peerHost(): Promise<HostHandle> {
  const Peer = await loadPeer();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newRoomCode();
    const peer = new Peer(PREFIX + code, { debug: 0 });
    const opened = await new Promise<Error | null>((resolve) => {
      peer.on('open', () => resolve(null));
      peer.on('error', (e) => resolve(peerError(e)));
    });
    if (opened) {
      peer.destroy();
      if (opened.message === PEER_ERRORS['unavailable-id']) continue; // code collision: try another
      throw opened;
    }
    let taken = false;
    const guest = new Promise<Link>((resolve) => {
      peer.on('connection', (conn) => {
        if (taken) { conn.on('open', () => { conn.send({ t: 'bye', reason: 'Phòng đã đủ người' } satisfies NetMsg); setTimeout(() => conn.close(), 200); }); return; }
        taken = true;
        conn.on('open', () => resolve(new PeerLink(conn, peer)));
      });
    });
    return { code, guest, close: () => { if (!taken) peer.destroy(); } };
  }
  throw new Error('Không tạo được mã phòng, thử lại');
}

async function peerJoin(code: string, timeoutMs: number): Promise<Link> {
  const Peer = await loadPeer();
  const peer = new Peer({ debug: 0 });
  return new Promise((resolve, reject) => {
    const fail = (e: Error) => { clearTimeout(t); peer.destroy(); reject(e); };
    const t = setTimeout(() => fail(new Error('Hết thời gian chờ — mạng của một trong hai người có thể chặn kết nối trực tiếp (WebRTC)')), timeoutMs);
    peer.on('error', (e) => fail(peerError(e)));
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => { clearTimeout(t); resolve(new PeerLink(conn, peer)); });
      conn.on('error', () => fail(new Error('Không kết nối được tới phòng')));
    });
  });
}

// ───────────────────────────── Cloudflare relay (WebSocket) ─────────────────────────────

interface RelayFrame { r?: 'ready' | 'peer' | 'gone' | 'error'; token?: string; on?: boolean; reason?: string; code?: string; message?: string; m?: NetMsg[]; pp?: number }
type RelayError = Error & { code?: string };

/** Outgoing messages are batched per window: one WebSocket frame instead of one per message (Free-plan budget). */
const FLUSH_MS = 50;
/**
 * Messages whose delay is felt (co-op snapshots / inputs, duel state, ping) leave at once, taking whatever is queued
 * with them; the rest waits for the batch window. Each of these already has its own fixed rate (≤ 15 / s).
 */
const URGENT = new Set<NetMsg['t']>(['ping', 'pong', 'coopSnap', 'coopInput', 'snap', 'input', 'act', 'pos']);
/** relay-only round trip (me → room server → me), measured every 2 s */
const ECHO_MS = 2000;
/** reconnect delays (≈ 40 s in total, inside the room's 60 s grace period) */
const RETRY_MS = [500, 1000, 2000, 4000, 8000, 8000, 8000, 8000];
const MAX_QUEUE = 400;
/** Superseded by the next one of their kind: dropped first when the outgoing queue overflows during a drop */
const EPHEMERAL = new Set<NetMsg['t']>(['ping', 'pong', 'coopSnap', 'coopInput', 'snap', 'input', 'pos']);

/**
 * Keeps an outgoing queue within `max` while the socket is down. Oldest ephemeral messages (snapshots, inputs, pings,
 * positions) go first, so one-off messages (loot, joins, chat, lobby) survive a long drop; only a queue made of
 * one-off messages loses its oldest.
 */
export function trimQueue(queue: NetMsg[], max = MAX_QUEUE): void {
  let excess = queue.length - max;
  if (excess <= 0) return;
  for (let i = 0; i < queue.length && excess > 0;) {
    if (EPHEMERAL.has(queue[i].t)) { queue.splice(i, 1); excess--; } else i++;
  }
  if (excess > 0) queue.splice(0, excess);
}
const OPEN_TIMEOUT_MS = 10_000;

/** One room socket: same slot after a drop (reconnect token), queued + batched sends. */
class RelaySocket {
  private ws: WebSocket | null = null;
  private token = '';
  private queue: NetMsg[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private done = false;
  private echoTimer: ReturnType<typeof setInterval> | null = null;
  readonly echo = new LatencySeries(60);
  onFrame: (f: RelayFrame) => void = () => {};
  onLost: (reason: string) => void = () => {};

  constructor(private base: string, readonly code: string, readonly role: 'host' | 'guest') {}

  /** Opens the socket; resolves on `ready`, rejects with the room's error (`code` set) or a network error. */
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${this.base}/room/${this.code}?role=${this.role}${this.token ? `&token=${this.token}` : ''}`);
      } catch {
        reject(new Error('Địa chỉ máy chủ online không hợp lệ'));
        return;
      }
      this.ws = ws;
      let ready = false;
      const timer = setTimeout(() => { if (!ready) { reject(new Error('Hết thời gian chờ máy chủ online — kiểm tra mạng rồi thử lại')); ws.close(); } }, OPEN_TIMEOUT_MS);
      ws.onmessage = (e) => {
        let f: RelayFrame;
        try { f = JSON.parse(String(e.data)); } catch { return; }
        if (typeof f.pp === 'number') { this.echo.add(performance.now() - f.pp); return; }
        if (f.r === 'ready') {
          ready = true;
          clearTimeout(timer);
          this.token = f.token ?? this.token;
          this.retries = 0;
          resolve();
          this.flush();
          this.echoTimer ??= setInterval(() => { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(`{"p":${performance.now()}}`); }, ECHO_MS);
          return;
        }
        if (f.r === 'error' && !ready) {
          clearTimeout(timer);
          reject(Object.assign(new Error(f.message ?? 'Lỗi phòng'), { code: f.code }));
          return;
        }
        this.onFrame(f);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (this.ws !== ws) return;
        this.ws = null;
        if (!ready) reject(new Error('Không kết nối được máy chủ online — kiểm tra mạng rồi thử lại'));
        else if (!this.done) this.reconnect();
      };
    });
  }

  private reconnect(): void {
    if (this.done) return;
    if (this.retries >= RETRY_MS.length) { this.lost('Mất kết nối tới máy chủ online'); return; }
    setTimeout(() => {
      if (this.done) return;
      this.open().catch((e: RelayError) => { if (e.code) this.lost(e.message); else this.reconnect(); });
    }, RETRY_MS[this.retries++]);
  }

  private lost(reason: string): void {
    if (this.done) return;
    this.done = true;
    this.stopEcho();
    this.onLost(reason);
  }

  private stopEcho(): void {
    if (this.echoTimer) clearInterval(this.echoTimer);
    this.echoTimer = null;
  }

  send(m: NetMsg): void {
    if (this.done) return;
    this.queue.push(m);
    trimQueue(this.queue);
    if (URGENT.has(m.t)) this.flush();
    else this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.queue.length || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ m: this.queue }));
    this.queue = [];
  }

  /** Test hook: drop the socket as if the network failed (the socket reconnects with its token). */
  simulateDrop(): void {
    this.ws?.close();
  }

  /** Leaves for good: the room tells the other player and closes. */
  close(): void {
    if (this.done) return;
    this.done = true;
    this.stopEcho();
    this.flush();
    const ws = this.ws;
    this.ws = null;
    if (ws?.readyState === WebSocket.OPEN) { ws.send('{"bye":1}'); setTimeout(() => ws.close(), 100); } else ws?.close();
  }
}

class RelayLink implements Link {
  readonly kind = 'relay';
  onMessage: (m: NetMsg) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private closed = false;
  constructor(private sock: RelaySocket) {
    sock.onFrame = (f) => {
      if (this.closed) return;
      if (Array.isArray(f.m)) for (const m of f.m) this.onMessage(m);
      else if (f.r === 'gone') this.shut(f.reason ?? 'Đối thủ đã rời phòng');
    };
    sock.onLost = (reason) => this.shut(reason);
  }
  send(m: NetMsg): void {
    if (!this.closed) this.sock.send(m);
  }
  simulateDrop(): void {
    this.sock.simulateDrop();
  }
  /** RTT to the room server alone (p50 / p95 / jitter) */
  relayStats() {
    return this.sock.echo.summary();
  }
  close(): void {
    if (this.closed) return;
    this.sock.close();
    this.shut('Đã rời phòng');
  }
  private shut(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose(reason);
  }
}

async function relayHost(base: string): Promise<HostHandle> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const sock = new RelaySocket(base, newRoomCode(), 'host');
    try {
      await sock.open();
    } catch (e) {
      if ((e as RelayError).code === 'TAKEN') continue; // code collision: try another
      throw e;
    }
    let taken = false;
    // the room says "peer on" once the guest has joined
    const guest = new Promise<Link>((resolve) => {
      sock.onFrame = (f) => { if (f.r === 'peer' && f.on && !taken) { taken = true; resolve(new RelayLink(sock)); } };
    });
    return { code: sock.code, guest, close: () => { if (!taken) sock.close(); } };
  }
  throw new Error('Không tạo được mã phòng, thử lại');
}

async function relayJoin(base: string, code: string): Promise<Link> {
  const sock = new RelaySocket(base, code, 'guest');
  await sock.open();
  return new RelayLink(sock);
}

// ───────────────────────────── API ─────────────────────────────

export function hostRoom(kind: LinkKind = defaultLinkKind()): Promise<HostHandle> {
  if (kind === 'local') return Promise.resolve(localHost(newRoomCode()));
  return kind === 'relay' ? relayHost(cloudBase()) : peerHost();
}

export function joinRoom(code: string, kind: LinkKind = defaultLinkKind(), timeoutMs = 15_000): Promise<Link> {
  const c = normalizeCode(code);
  if (c.length !== 6) return Promise.reject(new Error('Mã phòng gồm 6 ký tự'));
  if (kind === 'local') return localJoin(c, Math.min(timeoutMs, 4000));
  return kind === 'relay' ? relayJoin(cloudBase(), c) : peerJoin(c, timeoutMs);
}
