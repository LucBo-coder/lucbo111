import { randomTeraType, traitSeed, validTeraType } from './pokemonTraits';
import { rollAbilitySlot } from './abilities';
import cache from '../data/pokeapi/pokeapi-cache.json';
import { Individual, individualFromSeed, randomIndividual, Stats } from './stats';

// Permanent (cross-mode) Pokémon progression. Uses the real growth-rate EXP tables from PokéAPI.
// Survivor run levels/upgrades never touch these values.

type Cache = {
  species: Record<string, { growthRate: string; baseExperience: number; captureRate: number; baseHappiness?: number }>;
  growthRates: Record<string, number[]>;
};
const C = cache as unknown as Cache;

export const MAX_LEVEL = 100;

export function growthRateOf(species: string): string {
  return C.species[species]?.growthRate ?? 'medium';
}

/** Total EXP required to *reach* `level` (PokéAPI table, index = level-1). */
export function expForLevel(species: string, level: number): number {
  const table = C.growthRates[growthRateOf(species)] ?? C.growthRates.medium;
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  return table[l - 1];
}

export function levelForExp(species: string, exp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && exp >= expForLevel(species, l + 1)) l++;
  return l;
}

export function captureRateOf(species: string): number {
  return C.species[species]?.captureRate ?? 45;
}

/** Gen V-style EXP yield: base_experience × level / 5 (trainer-owned ×1.5). */
export function expYield(species: string, level: number, trainerOwned = false): number {
  const base = C.species[species]?.baseExperience ?? 50;
  return Math.max(1, Math.floor(((base * level) / 5) * (trainerOwned ? 1.5 : 1)));
}

export interface OwnedPokemon {
  uid: string;
  species: string;
  level: number;
  exp: number;
  origin: 'starter' | 'wild' | 'gift' | 'survivor';
  caughtAt: number;
  hpFrac?: number;
  /** Equipped held item id (equipment) */
  held?: string;
  /** Level at which the player declined the last evolution prompt (re-asks next level) */
  evoDeclined?: number;
  /** Individual values 0..31 (fixed for life, kept through evolution) */
  ivs?: Stats;
  nature?: string;
  /** Effort values earned in Adventure battles / vitamins (core/ev.ts); absent = all 0 */
  evs?: Stats;
  /** 0..255, starts at the species' base happiness */
  friendship?: number;
  nickname?: string;
  /** Shiny individual (kept through evolution) */
  shiny?: boolean;
  /** Skills (ids) the player keeps for the skill bar: the AI does not use them. Ids, not slots, so they survive new moves / evolution */
  keptSkills?: string[];
  /** Poké Ball it was caught in (wild / legendary captures) */
  ball?: string;
  /** Lasting status kept while recalled into its ball (kind, seconds left) */
  status?: { kind: string; t: number };
  /** Locked / favourite in the PC: protected against accidental release and sorted first */
  favorite?: boolean;
  /** Permanent random Tera type, changeable with Tera Shards. */
  teraType?: string;
  /** Ordinary ability slot 0/1 or Hidden Ability slot 2; preserved through evolution. */
  abilitySlot?: number;
  /** Gigantamax Factor (Max Soup): Dynamax turns it into its Gigantamax form — V31 */
  gmax?: boolean;
}

export const MAX_FRIENDSHIP = 255;

export function baseHappinessOf(species: string): number {
  return C.species[species]?.baseHappiness ?? 70;
}

export function makeOwned(species: string, level: number, origin: OwnedPokemon['origin'], now = Date.now(), rand: () => number = Math.random): OwnedPokemon {
  const ind = randomIndividual(rand);
  return {
    uid: `${species}-${now.toString(36)}-${Math.floor(rand() * 1e6).toString(36)}`,
    species, level, exp: expForLevel(species, level), origin, caughtAt: now,
    ivs: ind.ivs, nature: ind.nature, friendship: baseHappinessOf(species),
    teraType: randomTeraType(rand), abilitySlot: rollAbilitySlot(species, rand),
  };
}

/** Fills individual data missing from older saves (deterministic from the uid, so it never re-rolls). */
export function ensureIndividual(p: OwnedPokemon): OwnedPokemon {
  if (!p.ivs || !p.nature) {
    const ind = individualFromSeed(p.uid);
    p.ivs = p.ivs ?? ind.ivs;
    p.nature = p.nature ?? ind.nature;
  }
  if (!validTeraType(p.teraType)) p.teraType = randomTeraType(() => traitSeed(p.uid, 'tera'));
  if (![0, 1, 2].includes(p.abilitySlot ?? -1)) p.abilitySlot = rollAbilitySlot(p.species, () => traitSeed(p.uid, 'ability'));
  if (p.friendship == null) p.friendship = baseHappinessOf(p.species);
  return p;
}

export function individualOf(p: OwnedPokemon): Individual {
  ensureIndividual(p);
  return { ivs: p.ivs!, nature: p.nature!, evs: p.evs };
}

/** Main-series style friendship gain (smaller as it grows). */
export function friendshipGain(current: number, kind: 'levelup' | 'battle' | 'faint' | 'item'): number {
  if (kind === 'faint') return -1;
  const table = { levelup: [5, 3, 2], battle: [3, 2, 1], item: [10, 5, 2] }[kind];
  return current < 100 ? table[0] : current < 200 ? table[1] : table[2];
}

export function addFriendship(p: OwnedPokemon, kind: Parameters<typeof friendshipGain>[1]): number {
  ensureIndividual(p);
  p.friendship = Math.max(0, Math.min(MAX_FRIENDSHIP, p.friendship! + friendshipGain(p.friendship!, kind)));
  return p.friendship;
}

/** Adds EXP and returns the number of levels gained. */
export function addExp(p: OwnedPokemon, amount: number): number {
  if (p.level >= MAX_LEVEL) return 0;
  p.exp += amount;
  const before = p.level;
  p.level = levelForExp(p.species, p.exp);
  return p.level - before;
}

/** Progress (0..1) from the current level to the next. */
export function levelProgress(p: OwnedPokemon): number {
  if (p.level >= MAX_LEVEL) return 1;
  const a = expForLevel(p.species, p.level), b = expForLevel(p.species, p.level + 1);
  return Math.max(0, Math.min(1, (p.exp - a) / Math.max(1, b - a)));
}
