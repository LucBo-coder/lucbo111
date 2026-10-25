import type { OwnedPokemon } from './progression';

// Pokémon PC storage (Adventure). Pure data + helpers, shared by the save migration, AdventureState,
// unit tests and the Node server. The Collection stays the single master list of owned Pokémon; a PC slot
// only *references* a collection uid. This is what makes "one Pokémon can never be in two places" easy to
// enforce: party, PC and "unplaced" are three disjoint sets over the same collection.

export const PC_DEFAULT_BOXES = 16;
export const PC_DEFAULT_SLOTS = 30;
/** Hard guards so a tampered save cannot make the UI allocate millions of slots. */
export const PC_MAX_BOXES = 64;
export const PC_MAX_SLOTS = 60;

export interface PcBox {
  name: string;
  /** collection uids; null = empty slot */
  slots: (string | null)[];
}

export interface PcStorage {
  /** number of boxes requested when the storage was created (boxes.length may be smaller in old saves) */
  boxCount: number;
  /** slots per box */
  boxSize: number;
  boxes: PcBox[];
}

export type PcLocation = { box: number; slot: number } | null;

const clampInt = (v: unknown, def: number, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.max(1, Math.min(max, n));
};

export function defaultBoxName(i: number): string {
  return `Box ${i + 1}`;
}

export function emptyPc(boxCount = PC_DEFAULT_BOXES, boxSize = PC_DEFAULT_SLOTS): PcStorage {
  const count = clampInt(boxCount, PC_DEFAULT_BOXES, PC_MAX_BOXES);
  const size = clampInt(boxSize, PC_DEFAULT_SLOTS, PC_MAX_SLOTS);
  return {
    boxCount: count,
    boxSize: size,
    boxes: Array.from({ length: count }, (_, i) => ({ name: defaultBoxName(i), slots: Array.from({ length: size }, () => null) })),
  };
}

/** Every uid currently referenced by a PC slot, in box/slot order. */
export function pcUids(pc: PcStorage | undefined | null): string[] {
  if (!pc) return [];
  const out: string[] = [];
  for (const box of pc.boxes) for (const uid of box.slots) if (uid) out.push(uid);
  return out;
}

export function pcLocationOf(pc: PcStorage | undefined | null, uid: string): PcLocation {
  if (!pc) return null;
  for (let b = 0; b < pc.boxes.length; b++) {
    const s = pc.boxes[b].slots.indexOf(uid);
    if (s >= 0) return { box: b, slot: s };
  }
  return null;
}

export function pcHasRoom(pc: PcStorage | undefined | null): boolean {
  return !!pc && pc.boxes.some((b) => b.slots.some((u) => !u));
}

/** First free slot, or null when the PC is full. */
export function firstFreePcSlot(pc: PcStorage | undefined | null): PcLocation {
  if (!pc) return null;
  for (let b = 0; b < pc.boxes.length; b++) {
    const s = pc.boxes[b].slots.indexOf(null);
    if (s >= 0) return { box: b, slot: s };
  }
  return null;
}

/** Removes a uid from every slot (used before placing it again); returns true if it was present. */
export function removeFromPc(pc: PcStorage, uid: string): boolean {
  let found = false;
  for (const box of pc.boxes) {
    for (let i = 0; i < box.slots.length; i++) if (box.slots[i] === uid) { box.slots[i] = null; found = true; }
  }
  return found;
}

/** Place uid in an exact slot. The slot must be free (callers swap explicitly). */
export function placeInPc(pc: PcStorage, uid: string, loc: PcLocation): boolean {
  if (!loc || !pc.boxes[loc.box] || loc.slot < 0 || loc.slot >= pc.boxes[loc.box].slots.length) return false;
  if (pc.boxes[loc.box].slots[loc.slot]) return false;
  pc.boxes[loc.box].slots[loc.slot] = uid;
  return true;
}

/**
 * Sanitises a storage object from a save/newer build:
 *  - resizes to the configured box count/size (never below a slot that is already used),
 *  - removes duplicate/unknown/party uids (party always wins: it is the active roster),
 *  - drops non-string / empty values.
 * It does **not** move unplaced collection Pokémon; the migration does that explicitly.
 */
export function normalizePc(
  raw: PcStorage | null | undefined,
  collection: OwnedPokemon[],
  party: string[],
  boxCount = raw?.boxCount ?? PC_DEFAULT_BOXES,
  boxSize = raw?.boxSize ?? PC_DEFAULT_SLOTS,
): PcStorage {
  const owned = new Set(collection.map((p) => p.uid));
  const partySet = new Set(party);
  const count = clampInt(boxCount, PC_DEFAULT_BOXES, PC_MAX_BOXES);
  const size = clampInt(boxSize, PC_DEFAULT_SLOTS, PC_MAX_SLOTS);
  const pc = emptyPc(count, size);
  const seen = new Set<string>();
  const rawBoxes = Array.isArray(raw?.boxes) ? raw.boxes : [];
  for (let b = 0; b < Math.min(count, rawBoxes.length); b++) {
    const rb = rawBoxes[b];
    if (!rb) continue;
    if (typeof rb.name === 'string' && rb.name.trim()) pc.boxes[b].name = rb.name.trim().slice(0, 24);
    const slots = Array.isArray(rb.slots) ? rb.slots : [];
    for (let s = 0; s < Math.min(size, slots.length); s++) {
      const uid = slots[s];
      if (typeof uid !== 'string' || !uid || seen.has(uid) || partySet.has(uid) || !owned.has(uid)) continue;
      pc.boxes[b].slots[s] = uid;
      seen.add(uid);
    }
  }
  return pc;
}

/**
 * Builds a valid storage from scratch: every collection member that is not in the party is stored in the
 * first free slot. Members beyond capacity stay in the Collection but unplaced (never lost).
 */
export function buildPcForCollection(
  collection: OwnedPokemon[],
  party: string[],
  existing?: PcStorage | null,
  boxCount = existing?.boxCount ?? PC_DEFAULT_BOXES,
  boxSize = existing?.boxSize ?? PC_DEFAULT_SLOTS,
): PcStorage {
  const pc = normalizePc(existing, collection, party, boxCount, boxSize);
  const partySet = new Set(party);
  const stored = new Set(pcUids(pc));
  for (const p of collection) {
    if (partySet.has(p.uid) || stored.has(p.uid)) continue;
    const loc = firstFreePcSlot(pc);
    if (!loc) break; // rest remain safely in the collection (unplaced); the UI reports them
    placeInPc(pc, p.uid, loc);
    stored.add(p.uid);
  }
  return pc;
}
