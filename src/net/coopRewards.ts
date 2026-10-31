import { validTeraType } from '../core/pokemonTraits';
import { abilityOptions } from '../core/abilities';
import { POKEMON } from '../core/data';
import { makeOwned } from '../core/progression';
import { registerCaught, type SaveData } from '../systems/saveSchema';
import { ITEMS } from '../adventure/AdventureState';
import { earnTo, fmtCoins, Wallet, WALLETS } from '../core/wallet';

// Co-op PvE loot sharing: the host owns the simulation, so only it decides what loot exists.
// Grants travel as plain data; the guest applies them to its OWN save, locally.

/** One host → guest loot grant (co-op PvE). All fields optional; bad data is ignored by `applyCoopLoot`. */
export interface CoopLoot {
  /** money, paid into `wallet` */
  currency?: number;
  /** which mode's currency (the host's mode); absent = Adventure xu */
  wallet?: Wallet;
  /** item id → quantity */
  items?: Record<string, number>;
  /** a captured wild Pokémon that joins the guest's collection too */
  pokemon?: { species: string; level: number; shiny?: boolean; ball?: string; teraType?: string; abilitySlot?: number };
  /** short label shown on the guest's HUD ("Rương báu", "Thưởng hỗ trợ sinh tồn"…) */
  note?: string;
}

/** Host side: loot sent with an id stays here until the guest acknowledges it, and is re-sent meanwhile. */
export class LootLedger {
  private pending = new Map<string, { loot: CoopLoot; sentAt: number; firstAt: number }>();
  /** the guest acknowledged at least one grant: only such guests get re-sends (older builds never ack) */
  peerAcks = false;
  constructor(readonly resendMs = 3000, readonly giveUpMs = 120_000, readonly max = 64) {}
  track(id: string, loot: CoopLoot, now: number): void {
    this.pending.set(id, { loot, sentAt: now, firstAt: now });
    while (this.pending.size > this.max) this.pending.delete(this.pending.keys().next().value!);
  }
  ack(id: string): void {
    this.peerAcks = true;
    this.pending.delete(id);
  }
  /** Grants to send again now (each at most every `resendMs`, dropped after `giveUpMs`). */
  due(now: number): { id: string; loot: CoopLoot }[] {
    if (!this.peerAcks) return [];
    const out: { id: string; loot: CoopLoot }[] = [];
    for (const [id, p] of this.pending) {
      if (now - p.firstAt > this.giveUpMs) { this.pending.delete(id); continue; }
      if (now - p.sentAt >= this.resendMs) { p.sentAt = now; out.push({ id, loot: p.loot }); }
    }
    return out;
  }
  get size(): number { return this.pending.size; }
}

/** Guest side: ids already applied to this save (kept in the save, so a re-send after a reload is not paid twice). */
const SEEN_KEEP = 200;
export function lootSeen(save: SaveData, id: string): boolean {
  return (save.coopLootIds ?? []).includes(id);
}
export function markLootSeen(save: SaveData, id: string): void {
  const ids = (save.coopLootIds ??= []);
  ids.push(id);
  if (ids.length > SEEN_KEEP) ids.splice(0, ids.length - SEEN_KEEP);
}

const MAX_GRANT_CURRENCY = 100_000;
const MAX_ITEM_QTY = 99;
const MAX_STACK = 9999;

/** Applies one loot grant to the guest's own save. Returns human-readable summary lines (empty = nothing applied). */
export function applyCoopLoot(save: SaveData, loot: CoopLoot | null | undefined): string[] {
  if (!loot || typeof loot !== 'object') return [];
  const lines: string[] = [];

  const currency = Math.min(MAX_GRANT_CURRENCY, Math.max(0, Math.round(Number(loot.currency) || 0)));
  if (currency > 0) {
    const w: Wallet = loot.wallet && loot.wallet in WALLETS ? loot.wallet : 'adventure';
    earnTo(save, w, currency);
    lines.push(`+${fmtCoins(currency, w)}`);
  }

  if (loot.items && typeof loot.items === 'object') {
    for (const [id, raw] of Object.entries(loot.items)) {
      const def = ITEMS[id];
      const qty = Math.min(MAX_ITEM_QTY, Math.floor(Number(raw)));
      if (!def || !Number.isFinite(qty) || qty <= 0) continue;
      save.inventory[id] = Math.min(MAX_STACK, Math.max(0, Math.floor(Number(save.inventory[id]) || 0)) + qty);
      lines.push(`+${qty} ${def.name}`);
    }
  }

  const pk = loot.pokemon;
  if (pk && typeof pk.species === 'string' && POKEMON.has(pk.species)) {
    const level = Math.min(100, Math.max(1, Math.round(Number(pk.level) || 5)));
    const p = makeOwned(pk.species, level, 'wild');
    if (validTeraType(pk.teraType)) p.teraType = pk.teraType;
    if (abilityOptions(pk.species).some(a => a.slot === pk.abilitySlot)) p.abilitySlot = pk.abilitySlot;
    if (pk.shiny) p.shiny = true;
    if (typeof pk.ball === 'string' && ITEMS[pk.ball]?.kind === 'ball') p.ball = pk.ball;
    save.collection.push(p);
    registerCaught(save, pk.species, !!pk.shiny);
    lines.push(`${POKEMON.get(pk.species)!.name} (Lv${level}) vào bộ sưu tập`);
  }

  return lines;
}
