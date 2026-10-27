import { cleanAvatarId, DEFAULT_AVATAR } from '../core/avatars';
import { defaultSave, freshSave, isEmptySave, migrate, SaveData, slotSummary, SlotSummary } from './saveSchema';

const DB_NAME = 'pokemon-survivor';
const STORE = 'save';
/** Pre-slot single save (≤ v0.7.1) — moved into slot 1 on first load, then kept untouched as a backup. */
const LEGACY_KEY = 'main';
const META_KEY = 'meta';
export const SLOT_COUNT = 3;
const slotKey = (n: number) => `slot-${n}`;
/**
 * Rescue copy (localStorage, written synchronously when the page is hidden / closed / reloaded): an IndexedDB
 * write started at that moment may never finish. It wins over the slot only if it is newer.
 */
const RESCUE_KEY = 'pokemon-survivor-rescue';

interface Rescue { slot: number; save: SaveData }

function readRescue(): Rescue | null {
  try {
    const raw = globalThis.localStorage?.getItem(RESCUE_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Rescue;
    return r && typeof r.slot === 'number' && r.save && typeof r.save === 'object' ? r : null;
  } catch { return null; }
}

function clearRescue(): void {
  try { globalThis.localStorage?.removeItem(RESCUE_KEY); } catch { /* storage blocked */ }
}

export const PLAYER_NAME_MAX = 16;
export const DEFAULT_PLAYER_NAME = 'Huấn luyện viên';

/** Player identity shown in the lobby and online. Device-wide, so it survives new games and empty slots. */
export interface PlayerProfile { name: string; avatar: string }

/** Single-line, trimmed, control characters removed; an empty result falls back to the default name. */
export function cleanPlayerName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PLAYER_NAME_MAX).trim();
  return clean || DEFAULT_PLAYER_NAME;
}

/** Global (per-device) data: which slot is active + settings shared by every slot. */
interface SaveMeta { activeSlot: number; settings: SaveData['settings']; profile?: PlayerProfile; legacyMigrated?: boolean }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * IndexedDB-backed save with SLOT_COUNT independent slots and an in-memory fallback
 * (private mode, blocked storage, etc.). `data` is always the active slot.
 */
class SaveStore {
  data: SaveData = defaultSave();
  /** active slot (1-based) */
  slot = 1;
  /** Player identity shared by every slot (name + avatar survive NEW GAME; older saves migrate their slot name). */
  profile: PlayerProfile = { name: DEFAULT_PLAYER_NAME, avatar: DEFAULT_AVATAR };
  private db: IDBDatabase | null = null;
  /** memory fallback when IndexedDB is unavailable */
  private mem = new Map<string, unknown>();

  /** Name to show online — always a clean 1–16 character string. */
  get playerName(): string {
    return cleanPlayerName(this.profile.name);
  }

  /** Saves the device-wide name and mirrors it into the active slot (for older builds / exports). */
  async setPlayerName(raw: string): Promise<string> {
    const name = cleanPlayerName(raw);
    this.profile = { ...this.profile, name };
    this.data.playerName = name;
    await this.save();
    return name;
  }

  /** Avatar id used by the profile cards — always one of the known drawings. */
  get avatar(): string {
    return cleanAvatarId(this.profile.avatar);
  }

  async setAvatar(raw: string): Promise<string> {
    const avatar = cleanAvatarId(raw);
    this.profile = { ...this.profile, avatar };
    await this.save();
    return avatar;
  }

  private async get(key: string): Promise<unknown> {
    if (!this.db) return this.mem.get(key);
    return new Promise<unknown>((resolve, reject) => {
      const req = this.db!.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async put(key: string, value: unknown): Promise<void> {
    if (!this.db) { this.mem.set(key, structuredClone(value)); return; }
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async del(key: string): Promise<void> {
    if (!this.db) { this.mem.delete(key); return; }
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async load(): Promise<SaveData> {
    try {
      this.db = await openDb();
    } catch (e) {
      console.warn('[save] IndexedDB unavailable, using memory only', e);
      this.db = null;
    }
    try {
      let meta = (await this.get(META_KEY)) as SaveMeta | undefined;
      if (!meta) {
        // first run with slots: an existing single save becomes slot 1
        const legacy = await this.get(LEGACY_KEY);
        const d = migrate(legacy);
        if (legacy) await this.put(slotKey(1), d);
        meta = { activeSlot: 1, settings: d.settings, legacyMigrated: !!legacy };
        await this.put(META_KEY, meta);
      }
      this.slot = Math.min(SLOT_COUNT, Math.max(1, meta.activeSlot | 0));
      const raw = await this.newest(this.slot, await this.get(slotKey(this.slot)));
      const settings = { ...defaultSave().settings, ...meta.settings };
      this.data = raw ? migrate(raw) : freshSave(settings);
      this.data.settings = settings;
      // migrate the name stored in older per-slot saves to the device profile (avatar defaults to the classic trainer)
      this.profile = { name: cleanPlayerName(meta.profile?.name ?? this.data.playerName), avatar: cleanAvatarId(meta.profile?.avatar) };
      this.data.playerName = this.profile.name;
    } catch (e) {
      console.warn('[save] load failed, starting empty', e);
      this.data = defaultSave();
    }
    return this.data;
  }

  /** Writes the active slot (only once it holds progress — toggling a setting never fills an empty slot) + the shared settings. */
  async save(next: SaveData = this.data): Promise<void> {
    this.data = next;
    next.playerName = this.profile.name;
    try {
      if (!isEmptySave(next)) {
        next.savedAt = Date.now();
        await this.put(slotKey(this.slot), next);
        const r = readRescue();
        if (r && r.slot === this.slot && (r.save.savedAt ?? 0) <= next.savedAt) clearRescue();
      }
      await this.put(META_KEY, { activeSlot: this.slot, settings: next.settings, profile: this.profile, legacyMigrated: true } satisfies SaveMeta);
    } catch (e) {
      console.warn('[save] write failed', e);
    }
  }

  /**
   * Synchronous copy of the active slot for the moment the page goes away (also starts the normal async save).
   * Never throws: a full / blocked localStorage only loses the rescue copy.
   */
  rescue(): void {
    const next = this.data;
    if (isEmptySave(next)) return;
    next.savedAt = Date.now();
    try {
      globalThis.localStorage?.setItem(RESCUE_KEY, JSON.stringify({ slot: this.slot, save: next } satisfies Rescue));
    } catch (e) {
      console.warn('[save] rescue copy failed', e);
    }
    void this.save(next);
  }

  /** The stored slot, or the rescue copy of that slot when it is newer (then written back to the slot). */
  private async newest(n: number, raw: unknown): Promise<unknown> {
    const r = readRescue();
    if (!r || r.slot !== n) return raw;
    const stored = (raw as { savedAt?: number } | undefined)?.savedAt ?? 0;
    if ((r.save.savedAt ?? 0) <= stored) { clearRescue(); return raw; }
    try {
      await this.put(slotKey(n), r.save);
      clearRescue();
    } catch (e) {
      console.warn('[save] could not restore the rescue copy', e);
    }
    return r.save;
  }

  /** Summaries of every slot (null = empty) for the Load Game screen. */
  async listSlots(): Promise<(SlotSummary | null)[]> {
    const out: (SlotSummary | null)[] = [];
    for (let n = 1; n <= SLOT_COUNT; n++) {
      try {
        const raw = await this.newest(n, await this.get(slotKey(n)));
        const d = raw ? migrate(raw) : null;
        out.push(d && !isEmptySave(d) ? slotSummary(d) : null);
      } catch { out.push(null); }
    }
    return out;
  }

  /** Makes slot n active and loads it (an empty slot loads as a brand-new save). */
  async loadSlot(n: number): Promise<SaveData> {
    const settings = this.data.settings;
    const raw = await this.newest(n, await this.get(slotKey(n)).catch(() => undefined));
    this.slot = n;
    this.data = raw ? migrate(raw) : freshSave(settings);
    this.data.settings = settings;
    this.data.playerName = this.profile.name;
    await this.put(META_KEY, { activeSlot: n, settings, profile: this.profile, legacyMigrated: true } satisfies SaveMeta).catch(() => undefined);
    return this.data;
  }

  /**
   * NEW GAME in slot n: everything is wiped — collection, Pokédex, bag, money, Survivor stats and unlocks,
   * permanent upgrades, achievements, quests, flags, legendaries, eggs, exploration. Only the device settings stay.
   */
  async newGame(n: number = this.slot): Promise<SaveData> {
    const settings = this.data.settings;
    this.slot = n;
    this.data = freshSave(settings);
    this.data.playerName = this.profile.name;
    if (readRescue()?.slot === n) clearRescue();
    await this.del(slotKey(n)).catch(() => undefined);
    await this.put(META_KEY, { activeSlot: n, settings, profile: this.profile, legacyMigrated: true } satisfies SaveMeta).catch(() => undefined);
    return this.data;
  }

  async deleteSlot(n: number): Promise<void> {
    if (readRescue()?.slot === n) clearRescue();
    await this.del(slotKey(n)).catch(() => undefined);
    if (n === this.slot) {
      this.data = freshSave(this.data.settings);
      this.data.playerName = this.profile.name;
    }
  }
}

export const saveStore = new SaveStore();
(globalThis as unknown as { __save?: SaveStore }).__save = saveStore;
