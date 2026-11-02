import { POKEMON } from './data';
import type { OwnedPokemon } from './progression';
import { registerCaught, type SaveData } from '../systems/saveSchema';
import { firstFreePcSlot, placeInPc, removeFromPc } from './pc';

// Trading between players of a co-op room (pure): what one side may put on the table, the copy that travels, and
// applying a finished trade to one save. The handshake (both players confirm the same two offers) lives in
// adventure/TradeSession.ts; each game applies only its own half, so a trade never touches the other player's save.

export const MAX_PARTY_SIZE = 6;
/** item stacks per offer and units per stack */
export const MAX_STACKS = 6;
export const MAX_QTY = 999;

/** One side of a trade: at most one Pokémon and a few item stacks. */
export interface TradeOffer {
  mon: OwnedPokemon | null;
  items: Record<string, number>;
}

export const emptyOffer = (): TradeOffer => ({ mon: null, items: {} });

/** Why this Pokémon cannot be offered ('' = it can). */
export function monBlock(save: SaveData, uid: string): string {
  const adv = save.adventure!;
  const p = save.collection.find((c) => c.uid === uid);
  if (!p) return 'Không tìm thấy Pokémon';
  if (p.favorite) return 'Pokémon đang khóa (yêu thích) — bỏ khóa trong PC trước';
  if (adv.party.includes(uid) && adv.party.length <= 1) return 'Phải giữ lại ít nhất 1 Pokémon trong đội';
  if (adv.ride === uid) return 'Pokémon đang được cưỡi';
  return '';
}

/** Why this item stack cannot be offered ('' = it can). `kind` = the bag category of the item. */
export function itemBlock(save: SaveData, id: string, qty: number, kind: string | undefined): string {
  if (!kind) return 'Vật phẩm không xác định';
  if (kind === 'key') return 'Vật phẩm quan trọng không thể trao đổi';
  if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) return 'Số lượng không hợp lệ';
  if ((save.inventory[id] ?? 0) < qty) return 'Không đủ số lượng';
  return '';
}

/** The copy of an owned Pokémon that goes over the wire (no PC / party bookkeeping fields). */
export function tradeCopy(p: OwnedPokemon): OwnedPokemon {
  const c: OwnedPokemon = JSON.parse(JSON.stringify(p));
  delete c.favorite;
  delete c.status;
  delete c.evoDeclined;
  c.hpFrac = 1;
  return c;
}

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const statsOk = (s: unknown, max: number) => !!s && typeof s === 'object' && STAT_KEYS.every((k) => {
  const v = (s as Record<string, unknown>)[k];
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
});

/** A received Pokémon, validated and cleaned (never trust the wire). null = refused. */
export function sanitizeMon(raw: unknown): OwnedPokemon | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<OwnedPokemon>;
  if (typeof r.species !== 'string' || !POKEMON.has(r.species)) return null;
  if (typeof r.level !== 'number' || !Number.isInteger(r.level) || r.level < 1 || r.level > 100) return null;
  const p: OwnedPokemon = {
    uid: typeof r.uid === 'string' ? r.uid.slice(0, 80) : '',
    species: r.species, level: r.level,
    exp: typeof r.exp === 'number' && r.exp >= 0 && Number.isFinite(r.exp) ? Math.floor(r.exp) : 0,
    origin: r.origin === 'starter' || r.origin === 'wild' || r.origin === 'survivor' ? r.origin : 'gift',
    caughtAt: typeof r.caughtAt === 'number' && Number.isFinite(r.caughtAt) ? r.caughtAt : Date.now(),
    hpFrac: 1,
  };
  if (typeof r.held === 'string' && r.held.length <= 40) p.held = r.held;
  if (statsOk(r.ivs, 31)) p.ivs = { ...r.ivs! };
  if (statsOk(r.evs, 255)) p.evs = { ...r.evs! };
  if (typeof r.nature === 'string' && r.nature.length <= 20) p.nature = r.nature;
  if (typeof r.friendship === 'number' && r.friendship >= 0 && r.friendship <= 255) p.friendship = Math.floor(r.friendship);
  if (typeof r.nickname === 'string') p.nickname = r.nickname.slice(0, 16);
  if (r.shiny) p.shiny = true;
  if (Array.isArray(r.keptSkills)) p.keptSkills = r.keptSkills.filter((s): s is string => typeof s === 'string').slice(0, 4);
  if (typeof r.ball === 'string' && r.ball.length <= 30) p.ball = r.ball;
  if (typeof r.teraType === 'string' && r.teraType.length <= 12) p.teraType = r.teraType;
  if (r.abilitySlot === 0 || r.abilitySlot === 1 || r.abilitySlot === 2) p.abilitySlot = r.abilitySlot;
  if (r.gmax) p.gmax = true;
  return p;
}

/** Items received: known bag items only, within the limits. */
export function sanitizeItems(raw: unknown, kindOf: (id: string) => string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, q] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_STACKS)) {
    const kind = kindOf(id);
    if (!kind || kind === 'key' || typeof q !== 'number' || !Number.isInteger(q) || q <= 0 || q > MAX_QTY) continue;
    out[id] = q;
  }
  return out;
}

/** Same offer (the confirmation of one side must match what the other side shows). */
export function offerSig(o: TradeOffer): string {
  const items = Object.keys(o.items).sort().map((k) => `${k}:${o.items[k]}`).join(',');
  return `${o.mon ? `${o.mon.species}/${o.mon.level}/${o.mon.uid}` : '-'}|${items}`;
}

/**
 * Applies one side of a finished trade to `save`: what I gave leaves, what I got arrives (a fresh uid so it can never
 * collide with my own). Returns the new Pokémon, or null. Checks again first: nothing changes when my half is no
 * longer available (returns 'unavailable').
 */
export function applyTrade(save: SaveData, gave: TradeOffer, got: TradeOffer, kindOf: (id: string) => string | undefined, now = Date.now()): OwnedPokemon | null | 'unavailable' {
  const adv = save.adventure!;
  if (gave.mon && monBlock(save, gave.mon.uid)) return 'unavailable';
  for (const [id, q] of Object.entries(gave.items)) if (itemBlock(save, id, q, kindOf(id))) return 'unavailable';
  for (const [id, q] of Object.entries(gave.items)) save.inventory[id] = (save.inventory[id] ?? 0) - q;
  for (const [id, q] of Object.entries(got.items)) save.inventory[id] = (save.inventory[id] ?? 0) + q;
  if (gave.mon) {
    const uid = gave.mon.uid;
    save.collection = save.collection.filter((c) => c.uid !== uid);
    adv.party = adv.party.filter((u) => u !== uid);
    adv.recalled = adv.recalled.filter((u) => u !== uid);
    if (adv.activeUid === uid) adv.activeUid = adv.party.find((u) => !adv.recalled.includes(u)) ?? null;
    removeFromPc(adv.pc, uid);
  }
  let added: OwnedPokemon | null = null;
  if (got.mon) {
    const p = sanitizeMon(got.mon);
    if (p) {
      p.uid = `${p.species}-${now.toString(36)}-t${Math.floor(Math.random() * 1e6).toString(36)}`;
      save.collection.push(p);
      registerCaught(save, p.species, !!p.shiny);
      if (adv.party.length < MAX_PARTY_SIZE) {
        adv.party.push(p.uid);
        if (!adv.activeUid) adv.activeUid = p.uid;
        else if (!adv.recalled.includes(p.uid)) adv.recalled.push(p.uid);
      } else {
        const loc = firstFreePcSlot(adv.pc);
        if (loc) placeInPc(adv.pc, p.uid, loc);
      }
      added = p;
    }
  }
  return added;
}
