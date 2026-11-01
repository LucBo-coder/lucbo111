import cache from '../data/pokeapi/pokeapi-cache.json';
import { isAquatic } from './encounters';

// Riding a party Pokémon outside of battle. Pure rules, no Phaser.
//   Chạy (run)  — on land: a Pokémon big and heavy enough to carry the trainer (≥ 1.0 m, ≥ 40 kg), not a fish
//   Bơi (swim)  — on water: a Water type (or a fish) of ≥ 1.0 m, ≥ 30 kg — Lapras, Gyarados, Sharpedo…
//   Bay (fly)   — over water, lava and low ground (not buildings, walls or trees): a Flying type of ≥ 1.2 m, ≥ 20 kg
//                 (Charizard, Pidgeot, Dragonite…), plus Latios / Latias who carry people in the anime and games.
// Speed follows the species' base Speed stat; each mode has its own range. Body sizes are the official height /
// weight (PokéAPI). The level limits are this game's own.

export type RideMode = 'run' | 'swim' | 'fly';

type SpeciesRow = { types: string[]; baseStats: { spe: number }; heightDm: number; weightHg: number };
const SPECIES = (cache as unknown as { species: Record<string, SpeciesRow> }).species;

/** Can fly whatever their type says (they carry people: Latias / Latios in Alto Mare and Sinnoh / Hoenn). */
const ALSO_FLY = new Set(['latios', 'latias', 'latios-mega', 'latias-mega']);
/** Never carry a rider (ghosts that are only gas, Pokémon with no body to sit on). */
const NO_RIDE = new Set(['gastly', 'haunter', 'koffing', 'weezing', 'voltorb', 'electrode', 'magnezone', 'klinklang', 'cofagrigus', 'dusknoir']);

export const RIDE_MIN_LEVEL: Record<RideMode, number> = { run: 15, swim: 20, fly: 30 };
/** speed = walking speed × (base + Speed / 150), clamped to [min, max] */
const SPEED: Record<RideMode, { base: number; min: number; max: number }> = {
  run: { base: 1.15, min: 1.1, max: 2.0 },
  swim: { base: 0.9, min: 0.9, max: 1.7 },
  fly: { base: 1.3, min: 1.3, max: 2.2 },
};
/** Shift while riding: a gallop / a dive, a little faster (walking: ×1.6 sprint). */
export const RIDE_SPRINT = 1.2;

export const RIDE_NAME: Record<RideMode, string> = { run: 'Chạy', swim: 'Bơi', fly: 'Bay' };

/** The base form a row of data belongs to (Megas share their base species' body data). */
function row(species: string): SpeciesRow | null {
  return SPECIES[species] ?? SPECIES[species.replace(/-(mega|primal|gmax)(-[xy])?$/, '')] ?? null;
}

/** What a species can do as a mount (any level). */
export function rideModes(species: string): RideMode[] {
  const s = row(species);
  if (!s || NO_RIDE.has(species)) return [];
  const t = new Set(s.types), h = s.heightDm, w = s.weightHg;
  const fish = isAquatic(species);
  const out: RideMode[] = [];
  if (!fish && !t.has('ghost') && h >= 10 && w >= 400) out.push('run');
  if ((t.has('water') || fish) && h >= 10 && w >= 300) out.push('swim');
  if ((t.has('flying') && h >= 12 && w >= 200) || ALSO_FLY.has(species)) out.push('fly');
  return out;
}

/** The modes this Pokémon may use at its level. */
export function rideModesAt(species: string, level: number): RideMode[] {
  return rideModes(species).filter((m) => level >= RIDE_MIN_LEVEL[m]);
}

/** Speed multiplier (× walking speed) of a species in a mode. */
export function rideSpeed(species: string, mode: RideMode): number {
  const spe = row(species)?.baseStats.spe ?? 50;
  const k = SPEED[mode];
  return Math.round(Math.min(k.max, Math.max(k.min, k.base + spe / 150)) * 100) / 100;
}

/** Party-details line: "Cưỡi: Chạy ×1.85 · Bay ×1.97 (Lv 30)" — null if it can't carry anyone. */
export function rideText(species: string, level: number): string | null {
  const modes = rideModes(species);
  if (!modes.length) return null;
  const parts = modes.map((m) => `${RIDE_NAME[m]} ×${rideSpeed(species, m).toFixed(2)}${level < RIDE_MIN_LEVEL[m] ? ` (từ Lv ${RIDE_MIN_LEVEL[m]})` : ''}`);
  return `Cưỡi: ${parts.join(' · ')}`;
}

/** The mode used on this spot: flying whenever it can, else swimming on water, running on land. */
export function rideModeFor(modes: readonly RideMode[], onWater: boolean): RideMode | null {
  if (modes.includes('fly')) return 'fly';
  if (onWater) return modes.includes('swim') ? 'swim' : null;
  return modes.includes('run') ? 'run' : null;
}

/** Best mount for a spot among party members: the fastest that can be here (flyers first on equal speed). */
export function bestMount<T extends { species: string; level: number }>(party: readonly T[], onWater: boolean): T | null {
  let best: T | null = null, bestV = 0;
  for (const p of party) {
    const mode = rideModeFor(rideModesAt(p.species, p.level), onWater);
    if (!mode) continue;
    const v = rideSpeed(p.species, mode) + (mode === 'fly' ? 0.001 : 0);
    if (v > bestV) { best = p; bestV = v; }
  }
  return best;
}

/** How much bigger a mount is drawn than the same Pokémon on foot (≥ 1.3, up to 2 for the biggest). */
export function mountScale(species: string): number {
  const h = row(species)?.heightDm ?? 12;
  return Math.min(2, Math.max(1.3, h / 11));
}
