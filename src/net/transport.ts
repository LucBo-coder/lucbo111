import type { NetMsg } from './protocol';

// Two-player links. 'peer' = WebRTC through PeerJS (the public PeerJS broker only exchanges the connection
// offer; game data then flows directly between the two browsers). 'local' = BroadcastChannel between tabs
// of the same browser (offline play on one machine, and the e2e tests).

export type LinkKind = 'peer' | 'local';

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

/** Which transport the page uses: `?net=local` forces BroadcastChannel (tests, same-machine play). */
export function defaultLinkKind(): LinkKind {
  return new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'peer';
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

// ───────────────────────────── API ─────────────────────────────

export function hostRoom(kind: LinkKind = defaultLinkKind()): Promise<HostHandle> {
  return kind === 'local' ? Promise.resolve(localHost(newRoomCode())) : peerHost();
}

export function joinRoom(code: string, kind: LinkKind = defaultLinkKind(), timeoutMs = 15_000): Promise<Link> {
  const c = normalizeCode(code);
  if (c.length !== 6) return Promise.reject(new Error('Mã phòng gồm 6 ký tự'));
  return kind === 'local' ? localJoin(c, Math.min(timeoutMs, 4000)) : peerJoin(c, timeoutMs);
}
