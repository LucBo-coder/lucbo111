import evYieldJson from '../data/pokeapi/ev-yield.json';
import { ITEM_DEFS } from './evolution';
import { STAT_KEYS, StatKey, Stats } from './stats';

// Effort Values (main-series rules, Gen 6+ caps): every beaten Pokémon gives its species' EV yield
// (PokéAPI `stats[].effort`) to each party member that took part. ≤ 252 per stat, ≤ 510 in total;
// a stat gets +1 point per 4 EVs at level 100 (see calcStat). Survivor runs never touch EVs.

export const EV_MAX_STAT = 252;
export const EV_MAX_TOTAL = 510;

const YIELD = evYieldJson as Record<string, Partial<Stats>>;

export const zeroEvs = (): Stats => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
export const evTotal = (evs: Stats): number => STAT_KEYS.reduce((s, k) => s + evs[k], 0);

/** EV yield of a species (a Mega / boss form id falls back to its base species). */
export function evYieldOf(species: string): Partial<Stats> {
  return YIELD[species] ?? YIELD[species.replace(/-mega(-[xy])?$/, '')] ?? {};
}

/** Adds `delta` (may be negative) to one stat, respecting both caps. Returns the change actually applied. */
export function addEv(evs: Stats, stat: StatKey, delta: number): number {
  const room = Math.max(0, EV_MAX_TOTAL - evTotal(evs));
  const next = Math.max(0, Math.min(EV_MAX_STAT, evs[stat] + Math.min(delta, room)));
  const applied = next - evs[stat];
  evs[stat] = next;
  return applied;
}

/**
 * EVs a holder of `heldItem` earns for beating `species`: the species yield, +8 in the Power item's stat,
 * then ×2 with the Macho Brace.
 */
export function evGain(species: string, heldItem?: string | null): Partial<Stats> {
  const out: Partial<Stats> = { ...evYieldOf(species) };
  const e = heldItem ? ITEM_DEFS.get(heldItem)?.effect : undefined;
  if (e?.type === 'evPower') {
    if (e.stat) out[e.stat as StatKey] = (out[e.stat as StatKey] ?? 0) + (e.value ?? 8);
    if (e.mult) for (const k of STAT_KEYS) if (out[k]) out[k] = out[k]! * e.mult;
  }
  return out;
}

/** Applies a gain to an EV spread; returns the points actually added per stat. */
export function applyEvGain(evs: Stats, gain: Partial<Stats>): Partial<Stats> {
  const added: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    if (!gain[k]) continue;
    const a = addEv(evs, k, gain[k]!);
    if (a) added[k] = a;
  }
  return added;
}
