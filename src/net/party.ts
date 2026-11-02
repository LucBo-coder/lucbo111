import { cleanAvatarId, DEFAULT_AVATAR } from '../core/avatars';
import { cloudBase } from './cloud';
import { newRoomCode, normalizeCode, RelaySocket, type RelayFrame } from './transport';
import { PROTOCOL_VERSION } from './protocol';

// Party room (co-op "thế giới chung", up to 4 players): nobody hosts. Every member plays their own Adventure /
// Vietnam Odyssey save; this session only carries messages between them — to everyone (`to` unset) or to one member.
// Links: the Cloudflare relay (/party/<CODE>, PartyDO) or BroadcastChannel between tabs (`?net=local`, tests).
// The session outlives scenes: map changes keep the room; leaving goes through `leave()`.

export const PARTY_MAX = 4;
/** game-level announcement of who a member is and where they play (re-sent on every change and to newcomers) */
export interface PartyHi { t: 'hi'; v: number; name: string; avatar: string; campaign: string; map: string }
/** any party message: a `t` tag, optional recipient */
export interface PartyMsg { t: string; to?: string; [k: string]: unknown }
export interface PartyMember { id: string; name: string; avatar: string; campaign: string; map: string; online: boolean; known: boolean }
export type PartyStatus = 'idle' | 'connecting' | 'online' | 'closed';

interface PartyLink {
  send(m: PartyMsg): void;
  close(): void;
  simulateDrop?(): void;
  /** round trip to the room server (ms), null before the first measure / on local tabs */
  ping?(): number | null;
}
interface LinkEvents {
  message(from: string, m: PartyMsg): void;
  join(id: string): void;
  away(id: string, away: boolean): void;
  left(id: string): void;
  lost(reason: string): void;
}

// ───────────────────────────── BroadcastChannel (tabs of one browser) ─────────────────────────────

const LOCAL_PREFIX = 'pkmparty-v1-';
interface LocalFrame { k: 'hello' | 'here' | 'msg' | 'bye' | 'beat'; from: string; to?: string; m?: PartyMsg; n?: number }
/** a tab that stops beating (closed without a bye) leaves after this */
const LOCAL_TIMEOUT = 6000;

function localLink(code: string, create: boolean, ev: LinkEvents): Promise<{ id: string; link: PartyLink }> {
  const ch = new BroadcastChannel(LOCAL_PREFIX + code);
  const id = `${Date.now().toString(36).padStart(9, '0')}${Math.random().toString(36).slice(2, 6)}`;
  const seen = new Map<string, number>();
  let open = false, closed = false;
  /** messages that arrive while the join is being decided (the members' hello replies): delivered once open */
  const early: [string, PartyMsg][] = [];
  const post = (f: LocalFrame) => { if (!closed) ch.postMessage(f); };
  const touch = (from: string) => {
    const was = seen.has(from);
    seen.set(from, performance.now());
    if (!was && open) ev.join(from);
  };
  ch.onmessage = (e: MessageEvent<LocalFrame>) => {
    const f = e.data;
    if (!f || f.from === id || (f.to && f.to !== id)) return;
    if (f.k === 'bye') { if (seen.delete(f.from) && open) ev.left(f.from); return; }
    if (f.k === 'hello') {
      // a newcomer: tell it we are here (and how many we are, for the room limit)
      post({ k: 'here', from: id, to: f.from, n: seen.size + 1 });
      if (open && seen.size + 1 < PARTY_MAX) touch(f.from);
      return;
    }
    touch(f.from);
    if (f.k === 'msg' && f.m) { if (open) ev.message(f.from, f.m); else early.push([f.from, f.m]); }
  };
  const beat = setInterval(() => {
    post({ k: 'beat', from: id });
    const now = performance.now();
    for (const [m, at] of seen) if (now - at > LOCAL_TIMEOUT) { seen.delete(m); ev.left(m); }
  }, 1500);
  const shut = () => { closed = true; clearInterval(beat); setTimeout(() => ch.close(), 50); };
  const link: PartyLink = {
    send: (m) => post({ k: 'msg', from: id, to: m.to, m }),
    close: () => { post({ k: 'bye', from: id }); shut(); },
  };
  return new Promise((resolve, reject) => {
    post({ k: 'hello', from: id });
    setTimeout(() => {
      const n = seen.size;
      if (create && n > 0) { shut(); reject(Object.assign(new Error('Mã phòng đang được dùng'), { code: 'TAKEN' })); return; }
      if (!create && n === 0) { shut(); reject(new Error('Không tìm thấy phòng ' + code)); return; }
      if (n >= PARTY_MAX) { post({ k: 'bye', from: id }); shut(); reject(new Error(`Phòng đã đủ ${PARTY_MAX} người`)); return; }
      open = true;
      resolve({ id, link });
      // after the session has the link: members first, then what they already said (their hi)
      queueMicrotask(() => { for (const m of seen.keys()) ev.join(m); for (const [from, m] of early.splice(0)) ev.message(from, m); });
    }, create ? 500 : 1500);
  });
}

// ───────────────────────────── Cloudflare relay (PartyDO) ─────────────────────────────

async function relayLink(code: string, create: boolean, ev: LinkEvents): Promise<{ id: string; link: PartyLink }> {
  const base = cloudBase();
  if (!base) throw new Error('Chưa cấu hình máy chủ online');
  let id = '';
  const sock = new RelaySocket<PartyMsg>(base, code, (token) =>
    `${base}/party/${code}?${token ? `token=${token}` : create ? 'create=1' : 'join=1'}`);
  sock.onReady = (f) => {
    id = f.id ?? id;
    // the first ready lists who is already in; a reconnect re-lists them (the room kept our slot)
    for (const m of f.members ?? []) if (m.id !== id) { ev.join(m.id); if (!m.on) ev.away(m.id, true); }
  };
  sock.onFrame = (f: RelayFrame) => {
    if (Array.isArray(f.m) && f.f) { for (const m of f.m) ev.message(f.f, m as unknown as PartyMsg); return; }
    if (!f.id) { if (f.r === 'gone') ev.lost(f.reason ?? 'Phòng đã đóng'); return; }
    if (f.r === 'join') ev.join(f.id);
    else if (f.r === 'away' || f.r === 'back') ev.away(f.id, f.r === 'away');
    else if (f.r === 'left') ev.left(f.id);
  };
  sock.onLost = (reason) => ev.lost(reason);
  await sock.open();
  return { id, link: { send: (m) => sock.send(m), close: () => sock.close(), simulateDrop: () => sock.simulateDrop(), ping: () => (sock.echo.summary().n ? Math.round(sock.echo.last) : null) } };
}

// ───────────────────────────── session ─────────────────────────────

/** `?net=local` = BroadcastChannel; otherwise the relay */
const localMode = () => { try { return new URLSearchParams(location.search).get('net') === 'local'; } catch { return false; } };

export class PartySession {
  /** link used by the next create / join: 'auto' = `?net=local` → tabs, else the relay */
  linkKind: 'auto' | 'local' | 'relay' = 'auto';
  status: PartyStatus = 'idle';
  code = '';
  /** my member id ('' when not in a room) */
  me = '';
  error = '';
  readonly members = new Map<string, PartyMember>();
  profile = { name: 'Huấn luyện viên', avatar: DEFAULT_AVATAR, campaign: '', map: '' };
  private link: PartyLink | null = null;
  private listeners = new Set<(m: PartyMsg, from: string) => void>();
  private changeListeners = new Set<() => void>();

  get active(): boolean { return this.status === 'online'; }

  /** Opens a new room with a fresh code. */
  async create(): Promise<string> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newRoomCode();
      try { await this.open(code, true); return code; } catch (e) {
        if ((e as { code?: string }).code === 'TAKEN') continue;
        throw e;
      }
    }
    throw new Error('Không tạo được mã phòng, thử lại');
  }

  async join(raw: string): Promise<void> {
    const code = normalizeCode(raw);
    if (code.length !== 6) throw new Error('Mã phòng gồm 6 ký tự');
    await this.open(code, false);
  }

  private async open(code: string, create: boolean): Promise<void> {
    this.leave();
    this.setStatus('connecting');
    const ev: LinkEvents = {
      message: (from, m) => this.receive(from, m),
      join: (id) => { this.upsert(id).online = true; this.sendHi(id); this.changed(); },
      away: (id, away) => { const m = this.members.get(id); if (m) { m.online = !away; this.changed(); } },
      left: (id) => { if (this.members.delete(id)) { this.emitLocal({ t: 'left' }, id); this.changed(); } },
      lost: (reason) => { if (this.link) { this.link = null; this.error = reason; this.reset('closed'); } },
    };
    try {
      const local = this.linkKind === 'local' || (this.linkKind === 'auto' && localMode());
      const r = await (local ? localLink(code, create, ev) : relayLink(code, create, ev));
      this.link = r.link; this.me = r.id; this.code = code;
      this.setStatus('online');
      this.sendHi();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.reset('closed');
      throw e;
    }
  }

  private upsert(id: string): PartyMember {
    let m = this.members.get(id);
    if (!m) { m = { id, name: 'Người chơi', avatar: DEFAULT_AVATAR, campaign: '', map: '', online: true, known: false }; this.members.set(id, m); }
    return m;
  }

  private receive(from: string, m: PartyMsg): void {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string' || !from || from === this.me) return; // never trust the wire
    if (m.t === 'hi') {
      const h = m as unknown as PartyHi;
      if (h.v !== PROTOCOL_VERSION) { this.error = 'Một người trong phòng dùng phiên bản game khác — cập nhật rồi thử lại'; }
      const mem = this.upsert(from);
      mem.name = String(h.name ?? '').slice(0, 24) || 'Người chơi';
      mem.avatar = cleanAvatarId(h.avatar);
      mem.campaign = String(h.campaign ?? '').slice(0, 24);
      mem.map = String(h.map ?? '').slice(0, 48);
      mem.online = true;
      const fresh = !mem.known;
      mem.known = true;
      this.changed();
      if (fresh) this.emitLocal({ t: 'joined' }, from);
      return;
    }
    if (!this.members.has(from)) this.upsert(from);
    this.emitLocal(m, from);
  }

  private emitLocal(m: PartyMsg, from: string): void {
    for (const l of [...this.listeners]) l(m, from);
  }

  /** Name / avatar / campaign / map changed: everyone's list updates (and same-map play starts or stops). */
  setProfile(p: Partial<PartySession['profile']>): void {
    const before = JSON.stringify(this.profile);
    Object.assign(this.profile, p);
    if (JSON.stringify(this.profile) !== before) { this.sendHi(); this.changed(); }
  }

  private sendHi(to?: string): void {
    if (!this.link) return;
    const hi: PartyHi = { t: 'hi', v: PROTOCOL_VERSION, ...this.profile };
    this.link.send(to ? { ...hi, to } : { ...hi });
  }

  send(m: PartyMsg, to?: string): void {
    if (this.status === 'online') this.link?.send(to ? { ...m, to } : m);
  }

  on(cb: (m: PartyMsg, from: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  onChange(cb: () => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }
  private changed(): void { for (const l of [...this.changeListeners]) l(); }

  /** Members other than me, in join order (ids sort by join time). */
  others(): PartyMember[] {
    return [...this.members.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  /** Members on the same map of the same campaign, me excluded. */
  sameMap(): PartyMember[] {
    const { campaign, map } = this.profile;
    return map ? this.others().filter((m) => m.online && m.known && m.campaign === campaign && m.map === map) : [];
  }
  nameOf(id: string): string { return this.members.get(id)?.name ?? 'Người chơi'; }

  /** Test hook: drop the socket as if the network failed (the relay keeps the slot and reconnects). */
  simulateDrop(): void { this.link?.simulateDrop?.(); }
  /** My round trip to the room server in ms (≈ the delay to the other players), null on local tabs. */
  ping(): number | null { return this.link?.ping?.() ?? null; }

  leave(): void {
    const had = !!this.link;
    this.link?.close();
    this.link = null;
    this.error = had ? '' : this.error;
    this.reset('idle');
  }

  private reset(s: PartyStatus): void {
    const others = [...this.members.keys()];
    this.members.clear();
    this.code = ''; this.me = '';
    this.setStatus(s);
    for (const id of others) this.emitLocal({ t: 'left' }, id);
  }

  private setStatus(s: PartyStatus): void {
    this.status = s;
    this.changed();
  }
}

export const party = new PartySession();
(globalThis as unknown as { __party: PartySession }).__party = party;
