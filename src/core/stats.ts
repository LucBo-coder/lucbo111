import { BaseStats } from './types';

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export type StatKey = keyof Stats;
export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** Per-individual modifiers. EVs are not used in this game (documented in GAMEPLAY_AUDIT.md). */
export interface Individual {
  ivs: Stats;
  nature: string;
}

/** The 25 natures: +10% / -10% (neutral natures have neither). */
export const NATURES: Record<string, { name: string; plus?: StatKey; minus?: StatKey }> = {
  hardy: { name: 'Hardy' }, docile: { name: 'Docile' }, serious: { name: 'Serious' }, bashful: { name: 'Bashful' }, quirky: { name: 'Quirky' },
  lonely: { name: 'Lonely', plus: 'atk', minus: 'def' }, brave: { name: 'Brave', plus: 'atk', minus: 'spe' },
  adamant: { name: 'Adamant', plus: 'atk', minus: 'spa' }, naughty: { name: 'Naughty', plus: 'atk', minus: 'spd' },
  bold: { name: 'Bold', plus: 'def', minus: 'atk' }, relaxed: { name: 'Relaxed', plus: 'def', minus: 'spe' },
  impish: { name: 'Impish', plus: 'def', minus: 'spa' }, lax: { name: 'Lax', plus: 'def', minus: 'spd' },
  timid: { name: 'Timid', plus: 'spe', minus: 'atk' }, hasty: { name: 'Hasty', plus: 'spe', minus: 'def' },
  jolly: { name: 'Jolly', plus: 'spe', minus: 'spa' }, naive: { name: 'Naive', plus: 'spe', minus: 'spd' },
  modest: { name: 'Modest', plus: 'spa', minus: 'atk' }, mild: { name: 'Mild', plus: 'spa', minus: 'def' },
  quiet: { name: 'Quiet', plus: 'spa', minus: 'spe' }, rash: { name: 'Rash', plus: 'spa', minus: 'spd' },
  calm: { name: 'Calm', plus: 'spd', minus: 'atk' }, gentle: { name: 'Gentle', plus: 'spd', minus: 'def' },
  sassy: { name: 'Sassy', plus: 'spd', minus: 'spe' }, careful: { name: 'Careful', plus: 'spd', minus: 'spa' },
};
export const NATURE_IDS = Object.keys(NATURES);

export function natureMult(nature: string | undefined, stat: StatKey): number {
  const n = nature ? NATURES[nature] : undefined;
  if (!n) return 1;
  return n.plus === stat ? 1.1 : n.minus === stat ? 0.9 : 1;
}

/** Main-series stat formula (EV = 0): floor((floor((2B + IV) · L / 100) + 5) · Nature). */
export function calcStat(base: number, level: number, iv = 0, nature = 1): number {
  return Math.floor((Math.floor(((2 * base + iv) * level) / 100) + 5) * nature);
}

export function calcHp(base: number, level: number, iv = 0): number {
  return Math.floor(((2 * base + iv) * level) / 100) + level + 10;
}

/**
 * Calculated (persistent-equivalent) stats from base stats + level + individual modifiers.
 * Temporary combat buffs/debuffs are statuses on the Unit and are never folded into these values.
 */
export function calcStats(base: BaseStats, level: number, ind?: Individual | null): Stats {
  const iv = (k: StatKey) => ind?.ivs[k] ?? 0;
  const nm = (k: StatKey) => natureMult(ind?.nature, k);
  return {
    hp: calcHp(base.hp, level, iv('hp')),
    atk: calcStat(base.atk, level, iv('atk'), nm('atk')),
    def: calcStat(base.def, level, iv('def'), nm('def')),
    spa: calcStat(base.spa, level, iv('spa'), nm('spa')),
    spd: calcStat(base.spd, level, iv('spd'), nm('spd')),
    spe: calcStat(base.spe, level, iv('spe'), nm('spe')),
  };
}

/** Deterministic individual from a seed string (used to migrate old saves without IVs). */
export function individualFromSeed(seed: string): Individual {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const next = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h; };
  const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const k of STAT_KEYS) ivs[k] = next() % 32;
  return { ivs, nature: NATURE_IDS[next() % NATURE_IDS.length] };
}

export function randomIndividual(rand: () => number = Math.random): Individual {
  const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const k of STAT_KEYS) ivs[k] = Math.floor(rand() * 32);
  return { ivs, nature: NATURE_IDS[Math.floor(rand() * NATURE_IDS.length)] };
}

/** EXP needed to go from `level` to `level + 1` in a run. */
export function expToNext(level: number): number {
  return Math.floor(4 + level * 5 + Math.pow(level, 1.85));
}
