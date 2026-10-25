import { GAME_VERSION } from '../version';
import type { DuelMon, DuelRules, NetMsg, RosterUnit } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import { hostRoom, HostHandle, joinRoom, Link, LinkKind, defaultLinkKind } from './transport';
import { applyRules, buildDuel, RULESETS, validateParty } from './duel';

// One online session at a time. It outlives scenes: the lobby, a duel and the shared open world all use
// the same link. Listeners subscribe to messages and must unsubscribe when their scene shuts down.

export type NetStatus = 'idle' | 'hosting' | 'connecting' | 'connected' | 'closed';

export interface DuelStart {
  seed: number;
  rules: DuelRules;
  host: DuelMon[];
  guest: DuelMon[];
  hostName: string;
  guestName: string;
  roster: RosterUnit[];
}

export class NetSession {
  status: NetStatus = 'idle';
  role: 'host' | 'guest' | null = null;
  code = '';
  error = '';
  myName = 'Huấn luyện viên';
  peerName = '';
  /** round-trip time (ms), updated every 2 s; `pongs` counts the answers received */
  rtt = 0;
  pongs = 0;
  kind: LinkKind = 'peer';
  private link: Link | null = null;
  private hostHandle: HostHandle | null = null;
  private listeners = new Set<(m: NetMsg) => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private statusListeners = new Set<() => void>();

  get connected(): boolean {
    return this.status === 'connected';
  }

  /** Updates the local display name; if a link is already open, tells the peer so their labels update live. */
  setName(name: string): void {
    this.myName = name;
    if (this.connected) this.send({ t: 'hello', v: PROTOCOL_VERSION, name, game: GAME_VERSION });
  }

  /** Creates a room; resolves with its code once it is open (the guest may join any time later). */
  async host(kind: LinkKind = defaultLinkKind()): Promise<string> {
    this.leave();
    this.kind = kind;
    this.setStatus('connecting');
    try {
      const h = await hostRoom(kind);
      this.hostHandle = h;
      this.code = h.code;
      this.role = 'host';
      this.setStatus('hosting');
      void h.guest.then((link) => { if (this.hostHandle === h) this.attach(link); });
      return h.code;
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }

  async join(code: string, kind: LinkKind = defaultLinkKind()): Promise<void> {
    this.leave();
    this.kind = kind;
    this.setStatus('connecting');
    try {
      const link = await joinRoom(code, kind);
      this.code = code.toUpperCase();
      this.role = 'guest';
      this.attach(link);
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }

  private attach(link: Link): void {
    this.link = link;
    link.onMessage = (m) => this.receive(m);
    link.onClose = (reason) => {
      if (this.link !== link) return;
      this.link = null;
      this.error = reason;
      this.stopPing();
      this.setStatus('closed');
    };
    this.setStatus('connected');
    this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.myName, game: GAME_VERSION });
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ t: 'ping', at: performance.now() }), 2000);
  }

  private receive(m: NetMsg): void {
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return; // never trust the wire
    switch (m.t) {
      case 'hello':
        this.peerName = String(m.name ?? '').slice(0, 24) || 'Đối thủ';
        if (m.v !== PROTOCOL_VERSION) { this.error = 'Hai bên dùng phiên bản game khác nhau — cập nhật rồi thử lại'; this.leave(); return; }
        break;
      case 'ping': this.send({ t: 'pong', at: m.at }); return;
      case 'pong': this.rtt = Math.round(performance.now() - m.at); this.pongs++; return;
      case 'bye': this.error = m.reason ?? 'Đối thủ đã rời phòng'; this.leave(true); return;
    }
    for (const l of [...this.listeners]) l(m);
  }

  send(m: NetMsg): void {
    this.link?.send(m);
  }

  /** Subscribe to messages; returns the unsubscribe function. */
  on(cb: (m: NetMsg) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onStatus(cb: () => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  leave(keepError = false): void {
    this.stopPing();
    this.link?.close();
    this.link = null;
    this.hostHandle?.close();
    this.hostHandle = null;
    this.role = null;
    this.code = '';
    this.peerName = '';
    if (!keepError) this.error = '';
    this.setStatus(keepError ? 'closed' : 'idle');
  }

  private fail(e: unknown): void {
    this.error = e instanceof Error ? e.message : String(e);
    this.setStatus('closed');
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private setStatus(s: NetStatus): void {
    this.status = s;
    for (const l of [...this.statusListeners]) l();
  }
}

export const net = new NetSession();
(globalThis as unknown as { __net: NetSession }).__net = net;

/**
 * Duel handshake shared by the lobby and the open-world challenge: both players send their party
 * (`team`, ready); the host validates both, applies the rules and sends `start` with the seed.
 */
export class DuelHandshake {
  rules: DuelRules = RULESETS.standard;
  mine: DuelMon[] = [];
  theirs: DuelMon[] | null = null;
  theirsReady = false;
  myReady = false;
  rejected = '';
  private off: () => void;

  constructor(private onStart: (s: DuelStart) => void, private onChange: () => void = () => {}, private ses: NetSession = net) {
    this.off = ses.on((m) => this.receive(m));
  }

  dispose(): void {
    this.off();
  }

  setRules(r: DuelRules): void {
    this.rules = r;
    this.myReady = false;
    if (this.ses.role === 'host') this.ses.send({ t: 'rules', rules: r });
    this.onChange();
  }

  /** My party + readiness (re-sent on every change). */
  setTeam(party: DuelMon[], ready: boolean): string[] {
    this.mine = party;
    const errs = ready ? validateParty(party, this.rules) : [];
    this.myReady = ready && errs.length === 0;
    this.ses.send({ t: 'team', party, ready: this.myReady });
    this.onChange();
    this.tryStart();
    return errs;
  }

  private receive(m: NetMsg): void {
    if (m.t === 'rules' && this.ses.role === 'guest') {
      const r = RULESETS[m.rules?.id];
      if (r) { this.rules = r; this.myReady = false; this.ses.send({ t: 'team', party: this.mine, ready: false }); }
    } else if (m.t === 'team') {
      this.theirs = Array.isArray(m.party) ? m.party.slice(0, 6) : [];
      this.theirsReady = !!m.ready;
      this.rejected = '';
      this.tryStart();
    } else if (m.t === 'reject') {
      this.rejected = String(m.reason).slice(0, 200);
      this.myReady = false;
    } else if (m.t === 'start' && this.ses.role === 'guest') {
      this.onStart({ seed: m.seed, rules: RULESETS[m.rules.id] ?? this.rules, host: m.host, guest: m.guest, hostName: m.hostName, guestName: m.guestName, roster: m.roster });
      return;
    } else return;
    this.onChange();
  }

  private tryStart(): void {
    if (this.ses.role !== 'host' || !this.myReady || !this.theirsReady || !this.theirs) return;
    const errs = validateParty(this.theirs, this.rules);
    if (errs.length) {
      this.theirsReady = false;
      this.ses.send({ t: 'reject', reason: errs.join(' · ') });
      this.onChange();
      return;
    }
    const seed = (Math.random() * 0x7fffffff) | 0;
    const host = applyRules(this.mine, this.rules), guest = applyRules(this.theirs, this.rules);
    const roster = buildDuel(seed, this.rules, host, guest).roster;
    const start: DuelStart = { seed, rules: this.rules, host, guest, hostName: this.ses.myName, guestName: this.ses.peerName, roster };
    this.ses.send({ t: 'start', ...start, rules: this.rules });
    this.onStart(start);
  }
}
