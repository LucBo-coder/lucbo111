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
  pokemon?: { species: string; level: number; shiny?: boolean; ball?: string };
  /** short label shown on the guest's HUD ("Rương báu", "Thưởng hỗ trợ sinh tồn"…) */
  note?: string;
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
    if (pk.shiny) p.shiny = true;
    if (typeof pk.ball === 'string' && ITEMS[pk.ball]?.kind === 'ball') p.ball = pk.ball;
    save.collection.push(p);
    registerCaught(save, pk.species, !!pk.shiny);
    lines.push(`${POKEMON.get(pk.species)!.name} (Lv${level}) vào bộ sưu tập`);
  }

  return lines;
}
