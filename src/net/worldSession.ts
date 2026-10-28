import { migrate, type SaveData } from '../systems/saveSchema';
import { ServerClient } from './serverClient';
import type { ClientMsg, ServerAccount, ServerChatMessage, ServerFriend, ServerMsg, ServerPartyView } from './serverProtocol';

// Thế giới online = the full Vietnam Odyssey campaign, played in the browser, with the account's progress kept on
// the server and other players around you. This session outlives scenes: it is opened by the login screen
// (ServerScene), used by every Adventure map (WorldOnline) and closed when the player goes back to the main menu.

/** base64 characters per `adv.save` frame (a client frame is at most 16 KB) */
const PART = 12_000;
/** upload at most this often while playing (each upload is one database write on the server) */
const UPLOAD_EVERY = 10_000;
const RESCUE = (accountId: string) => `pokemon-survivor-online-rescue-${accountId}`;
const CHAT_KEEP = 80;

export async function deflateToBase64(text: string): Promise<string> {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Splits an encoded save into `adv.save` frames. */
export function saveFrames(b64: string, seq: number): Extract<ClientMsg, { t: 'adv.save' }>[] {
  const parts = Math.max(1, Math.ceil(b64.length / PART));
  return Array.from({ length: parts }, (_, part) => ({ t: 'adv.save' as const, seq, part, parts, data: b64.slice(part * PART, (part + 1) * PART) }));
}

class WorldSession {
  client: ServerClient | null = null;
  account: ServerAccount | null = null;
  /** last connection status line */
  status = '';
  /** recent chat incl. whispers (channel 'whisper'), kept across map changes */
  chat: ServerChatMessage[] = [];
  /** social state the server pushes on sign-in and on changes (each map's panel shows the latest) */
  friends: ServerFriend[] = [];
  requests: ServerFriend[] = [];
  party: ServerPartyView | null = null;
  invite: { partyId: string; fromName: string } | null = null;
  /** leaving the world signs out of the account too (the "Đăng xuất" button) */
  signOut = false;
  private listeners = new Set<(m: ServerMsg) => void>();
  private statusListeners = new Set<(s: string) => void>();
  private pending: SaveData | null = null;
  /** newest save handed to queue() */
  private latest: SaveData | null = null;
  private uploading = false;
  private lastUpload = 0;
  private lastSeq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** seq → savedAt of uploads waiting for the server's answer */
  private inFlight = new Map<number, number>();
  /** savedAt of the newest save the server confirmed */
  confirmedAt = 0;

  /** Signed in and playing the online campaign. */
  get active(): boolean { return !!this.account; }
  get ready(): boolean { return !!this.client?.ready; }

  /** The socket used by the login screen and, once signed in, by the campaign. */
  connection(): ServerClient {
    if (!this.client) {
      this.client = new ServerClient((m) => this.dispatch(m), (s) => {
        this.status = s;
        for (const fn of this.statusListeners) fn(s);
        // reconnected after a drop (a new server session): anything not confirmed goes again
        if (this.client?.ready && this.account && !this.synced && this.latest) {
          this.inFlight.clear();
          this.pending = this.latest;
          this.flushSoon(0);
        }
      });
    }
    return this.client;
  }

  on(fn: (m: ServerMsg) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: string) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  send(msg: ClientMsg): boolean {
    return this.client?.send(msg) ?? false;
  }

  private dispatch(m: ServerMsg): void {
    if (m.t === 'saved') this.onSaved(m);
    if (m.t === 'chat') this.addChat(m.message);
    if (m.t === 'whisper') {
      const mine = m.from === this.account?.id;
      this.addChat({ id: -m.at - Math.random(), channel: 'whisper', from: m.from, fromName: mine ? `→ ${m.toName}` : m.fromName, body: m.body, at: m.at, moderated: false });
    }
    if (m.t === 'friends') { this.friends = m.friends; this.requests = m.requests; }
    if (m.t === 'party') { this.party = m.party; this.invite = m.invite ?? null; }
    if (m.t === 'chatHistory') {
      const ids = new Set(this.chat.map((c) => c.id));
      for (const c of m.messages) if (!ids.has(c.id)) this.chat.push(c);
      this.chat.sort((a, b) => a.at - b.at);
      if (this.chat.length > CHAT_KEEP) this.chat.splice(0, this.chat.length - CHAT_KEEP);
    }
    for (const fn of this.listeners) fn(m);
  }

  private addChat(c: ServerChatMessage): void {
    if (this.chat.some((x) => x.id === c.id)) return;
    this.chat.push(c);
    if (this.chat.length > CHAT_KEEP) this.chat.shift();
  }

  /**
   * Signed in: the save to play is the server's, unless this device kept a newer rescue copy (the page closed
   * before an upload finished). Returns the save to play.
   */
  begin(account: ServerAccount, serverSave: SaveData): SaveData {
    this.account = account;
    this.chat = [];
    this.signOut = false;
    this.confirmedAt = serverSave.savedAt ?? 0;
    const rescue = this.readRescue();
    if (rescue && (rescue.savedAt ?? 0) > (serverSave.savedAt ?? 0)) {
      this.queue(rescue, true);
      return rescue;
    }
    this.clearRescue();
    return serverSave;
  }

  /**
   * Leaves the online world (main menu): the last save goes up and is confirmed (at most ~3 s), then the socket
   * closes. Anything still unconfirmed stays in this device's rescue copy for the next sign-in.
   */
  async end(signOut = false): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.account && this.latest && !this.synced) this.writeRescue(this.latest);
    const deadline = performance.now() + 3000;
    while (!this.synced && this.client?.ready && performance.now() < deadline) {
      if (this.pending && !this.uploading) await this.flush();
      else await new Promise((r) => setTimeout(r, 50));
    }
    this.account = null;
    this.pending = this.latest = null;
    this.inFlight.clear();
    this.friends = []; this.requests = []; this.party = null; this.invite = null;
    if (signOut) this.client?.send({ t: 'logout' });
    this.client?.shutdown();
    this.client = null;
  }

  /**
   * The campaign saved: upload it (at most every UPLOAD_EVERY ms). `urgent` (page hidden / closed, leaving):
   * upload now and keep a synchronous copy on this device until the server confirms it.
   */
  queue(save: SaveData, urgent = false): void {
    if (!this.account) return;
    this.pending = this.latest = save;
    if (urgent) {
      this.writeRescue(save);
      this.flushSoon(0);
      return;
    }
    this.flushSoon(Math.max(0, UPLOAD_EVERY - (performance.now() - this.lastUpload)));
  }

  private flushSoon(ms: number): void {
    if (this.timer && ms > 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, ms);
  }

  private async flush(): Promise<void> {
    if (this.uploading || !this.pending) return;
    const client = this.client;
    if (!client?.ready) { this.flushSoon(2000); return; }
    const save = this.pending;
    this.pending = null;
    this.uploading = true;
    try {
      const b64 = await deflateToBase64(JSON.stringify(save));
      const seq = this.lastSeq = Math.max(Date.now(), this.lastSeq + 1);
      this.inFlight.set(seq, save.savedAt ?? Date.now());
      for (const frame of saveFrames(b64, seq)) {
        // the socket captured above: leaving the world (end) must not drop the last upload
        if (!client.send(frame)) { this.inFlight.delete(seq); if (this.account) this.pending ??= save; break; }
      }
    } catch (e) {
      console.warn('[online] save upload failed', e);
      if (this.account) this.pending ??= save;
    } finally {
      this.uploading = false;
      this.lastUpload = performance.now();
      if (this.pending && this.account) this.flushSoon(this.client?.ready ? UPLOAD_EVERY : 2000);
    }
  }

  private onSaved(m: Extract<ServerMsg, { t: 'saved' }>): void {
    const at = this.inFlight.get(m.seq);
    this.inFlight.delete(m.seq);
    if (!m.ok || at === undefined) return;
    this.confirmedAt = Math.max(this.confirmedAt, at);
    const rescue = this.readRescue();
    if (rescue && (rescue.savedAt ?? 0) <= this.confirmedAt) this.clearRescue();
  }

  /** Nothing waiting to reach the server. */
  get synced(): boolean { return !this.pending && !this.uploading && !this.inFlight.size; }

  private readRescue(): SaveData | null {
    if (!this.account) return null;
    try {
      const raw = localStorage.getItem(RESCUE(this.account.id));
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch { return null; }
  }

  private writeRescue(save: SaveData): void {
    if (!this.account) return;
    try { localStorage.setItem(RESCUE(this.account.id), JSON.stringify(save)); } catch (e) { console.warn('[online] rescue copy failed', e); }
  }

  private clearRescue(): void {
    if (!this.account) return;
    try { localStorage.removeItem(RESCUE(this.account.id)); } catch { /* storage blocked */ }
  }
}

export const worldSession = new WorldSession();
(globalThis as unknown as { __world?: WorldSession }).__world = worldSession;
