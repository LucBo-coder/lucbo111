import { defaultSave, freshSave, isEmptySave, migrate, SaveData, slotSummary, SlotSummary } from './saveSchema';

const DB_NAME = 'pokemon-survivor';
const STORE = 'save';
/** Pre-slot single save (≤ v0.7.1) — moved into slot 1 on first load, then kept untouched as a backup. */
const LEGACY_KEY = 'main';
const META_KEY = 'meta';
export const SLOT_COUNT = 3;
const slotKey = (n: number) => `slot-${n}`;

/** Global (per-device) data: which slot is active + settings shared by every slot. */
interface SaveMeta { activeSlot: number; settings: SaveData['settings']; legacyMigrated?: boolean }

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
  private db: IDBDatabase | null = null;
  /** memory fallback when IndexedDB is unavailable */
  private mem = new Map<string, unknown>();

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
      const raw = await this.get(slotKey(this.slot));
      const settings = { ...defaultSave().settings, ...meta.settings };
      this.data = raw ? migrate(raw) : freshSave(settings);
      this.data.settings = settings;
    } catch (e) {
      console.warn('[save] load failed, starting empty', e);
      this.data = defaultSave();
    }
    return this.data;
  }

  /** Writes the active slot (only once it holds progress — toggling a setting never fills an empty slot) + the shared settings. */
  async save(next: SaveData = this.data): Promise<void> {
    this.data = next;
    try {
      if (!isEmptySave(next)) {
        next.savedAt = Date.now();
        await this.put(slotKey(this.slot), next);
      }
      await this.put(META_KEY, { activeSlot: this.slot, settings: next.settings, legacyMigrated: true } satisfies SaveMeta);
    } catch (e) {
      console.warn('[save] write failed', e);
    }
  }

  /** Summaries of every slot (null = empty) for the Load Game screen. */
  async listSlots(): Promise<(SlotSummary | null)[]> {
    const out: (SlotSummary | null)[] = [];
    for (let n = 1; n <= SLOT_COUNT; n++) {
      try {
        const raw = await this.get(slotKey(n));
        const d = raw ? migrate(raw) : null;
        out.push(d && !isEmptySave(d) ? slotSummary(d) : null);
      } catch { out.push(null); }
    }
    return out;
  }

  /** Makes slot n active and loads it (an empty slot loads as a brand-new save). */
  async loadSlot(n: number): Promise<SaveData> {
    const settings = this.data.settings;
    const raw = await this.get(slotKey(n)).catch(() => undefined);
    this.slot = n;
    this.data = raw ? migrate(raw) : freshSave(settings);
    this.data.settings = settings;
    await this.put(META_KEY, { activeSlot: n, settings, legacyMigrated: true } satisfies SaveMeta).catch(() => undefined);
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
    await this.del(slotKey(n)).catch(() => undefined);
    await this.put(META_KEY, { activeSlot: n, settings, legacyMigrated: true } satisfies SaveMeta).catch(() => undefined);
    return this.data;
  }

  async deleteSlot(n: number): Promise<void> {
    await this.del(slotKey(n)).catch(() => undefined);
    if (n === this.slot) this.data = freshSave(this.data.settings);
  }
}

export const saveStore = new SaveStore();
(globalThis as unknown as { __save?: SaveStore }).__save = saveStore;
