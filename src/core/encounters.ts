import ecologyJson from '../data/dex/ecology.json';
import pokemonJson from '../data/dex/pokemon.json';
import regionsJson from '../data/world/regions.json';
import type { Rng } from './rng';

// Encounter core (pure): RegionalLevelManager + BiomeSpawnManager + PokémonRaritySystem + ShinyEncounterSystem.
// Pipeline for one ordinary spawn (Master Prompt V3 §4.1):
//   region → biome → day/night → weather → active events → eligible species → rarity tier (weighted, renormalised
//   over non-empty tiers) → species in tier (weighted) → level (region range, evolution-stage floor) → shiny roll.
// Legendary / Mythical species are never part of these pools (LegendaryEncounterManager handles them).

export type Biome = 'meadow' | 'forest' | 'lake' | 'rocky' | 'ruins' | 'farm' | 'snow' | 'volcano' | 'sanctuary' | 'swamp' | 'coast';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'ultra';
export type WeatherKind = 'clear' | 'rain' | 'fog' | 'thunderstorm' | 'blizzard' | 'heatwave' | 'heavyRain' | 'mysticFog';
export type Method = 'wild' | 'event' | 'evolution' | 'baby' | 'legendary' | 'mythical';

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'ultra'];
/** Probability (%) of picking each tier in an eligible ordinary spawn. */
export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, uncommon: 25, rare: 10, epic: 4, ultra: 1 };
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Phổ biến', uncommon: 'Ít gặp', rare: 'Hiếm', epic: 'Rất hiếm', ultra: 'Cực hiếm' };

/** Base shiny odds per spawned eligible Pokémon (independent of rarity). Outbreaks use SHINY_OUTBREAK. */
export const SHINY_BASE = 1 / 4096;
export const SHINY_OUTBREAK = 1 / 1024;

export interface Ecology {
  id: string;
  dex: number;
  gen: number;
  biomes: Biome[];
  rarity: Rarity;
  /** 0 basic · 1 middle · 2 final (single-stage species are 0) */
  stage: 0 | 1 | 2;
  /** Lowest level this species should appear at in the wild (evolution-stage floor) */
  minLevel: number;
  time: 'any' | 'day' | 'night';
  /** Weather multipliers on the species weight */
  weather: Partial<Record<WeatherKind, number>>;
  method: Method;
  temperament: 'timid' | 'neutral' | 'aggressive';
  /** Weight inside its rarity tier */
  weight: number;
  legendary: boolean;
  mythical: boolean;
  baby: boolean;
  /** Lives and moves in water only (fish, sea creatures): spawns on water tiles */
  aquatic?: boolean;
}

export interface RegionDef {
  id: string;
  name: string;
  /** Map area ids this region covers */
  areas: string[];
  biome: Biome;
  level: [number, number];
  elite: [number, number];
  boss: [number, number] | null;
  recommended: number;
  danger: number;
  /** Story flag needed before events can start here (null = open from the start) */
  unlock: string | null;
  /** Types that never live here (tropical Vietnam regions: no Ice types outside the northern mountains) */
  excludeTypes?: string[];
}

const TYPES_OF = new Map((pokemonJson as { id: string; types: string[] }[]).map((p) => [p.id, p.types]));

export const ECOLOGY = new Map((ecologyJson as Ecology[]).map((e) => [e.id, e]));
export const REGIONS = new Map((regionsJson as RegionDef[]).map((r) => [r.id, r]));

export function regionOfArea(areaId: string | null | undefined): RegionDef | null {
  if (!areaId) return null;
  for (const r of REGIONS.values()) if (r.areas.includes(areaId)) return r;
  return null;
}

export interface SpawnContext {
  biome: Biome;
  /** true: the spawn point is water → only aquatic species; false / absent: land → never aquatic species */
  aquatic?: boolean;
  /** Extra biomes opened by events (blizzard → snow, heatwave → volcano, distortion → ruins…) */
  extraBiomes?: Biome[];
  night: boolean;
  weather: WeatherKind;
  /** Species forced in by an outbreak/migration (still level/stage checked) */
  boosted?: { species: string; mult: number }[];
}

/** Species allowed in an ordinary wild spawn for this context. */
export function eligible(c: SpawnContext, region: RegionDef): Ecology[] {
  const biomes = new Set<Biome>([c.biome, ...(c.extraBiomes ?? [])]);
  const out: Ecology[] = [];
  for (const e of ECOLOGY.values()) {
    if (e.method !== 'wild' && e.method !== 'event') continue;
    if (e.legendary || e.mythical) continue;
    if (!!e.aquatic !== !!c.aquatic) continue; // fish only in water, land Pokémon only on land
    if (!e.biomes.some((b) => biomes.has(b))) continue;
    // event-only species (snow / volcano) need an event that opened their biome
    if (e.method === 'event' && !e.biomes.some((b) => c.extraBiomes?.includes(b))) continue;
    if (e.time === 'night' && !c.night) continue;
    if (e.time === 'day' && c.night) continue;
    if (e.minLevel > region.level[1]) continue; // stage floor: evolved forms only where levels allow
    if (region.excludeTypes && TYPES_OF.get(e.id)?.some((t) => region.excludeTypes!.includes(t))) continue;
    if ((e.weather[c.weather] ?? 1) <= 0) continue;
    out.push(e);
  }
  return out;
}

/** Tier probabilities after removing tiers with no eligible species (renormalised to 1). */
export function tierProbabilities(pool: Ecology[]): Record<Rarity, number> {
  const present = new Set(pool.map((e) => e.rarity));
  const total = RARITY_ORDER.reduce((s, r) => s + (present.has(r) ? RARITY_WEIGHTS[r] : 0), 0);
  const out = {} as Record<Rarity, number>;
  for (const r of RARITY_ORDER) out[r] = total > 0 && present.has(r) ? RARITY_WEIGHTS[r] / total : 0;
  return out;
}

export function pickTier(rng: Rng, pool: Ecology[]): Rarity | null {
  const p = tierProbabilities(pool);
  let x = rng.next();
  for (const r of RARITY_ORDER) { if (p[r] <= 0) continue; if ((x -= p[r]) < 0) return r; }
  return RARITY_ORDER.filter((r) => p[r] > 0).pop() ?? null;
}

export function speciesWeight(e: Ecology, c: SpawnContext): number {
  const boost = c.boosted?.find((b) => b.species === e.id)?.mult ?? 1;
  return e.weight * (e.weather[c.weather] ?? 1) * boost;
}

/** Wild level: region range, raised to the species' evolution floor, small world-level bonus capped at +3. */
export function rollLevel(rng: Rng, e: Ecology, region: RegionDef, worldLevelBonus = 0): number {
  const lo = Math.max(region.level[0], e.minLevel);
  const hi = Math.max(lo, region.level[1]);
  return Math.min(hi + 3, rng.int(lo, hi) + Math.max(0, Math.min(3, worldLevelBonus)));
}

export interface EncounterRoll {
  species: string;
  level: number;
  rarity: Rarity;
  shiny: boolean;
  temperament: Ecology['temperament'];
}

/** One ordinary spawn decision. Returns null when nothing is eligible (never spawns an invalid species). */
export function rollEncounter(rng: Rng, c: SpawnContext, region: RegionDef, o: { worldLevelBonus?: number; shinyRate?: number } = {}): EncounterRoll | null {
  const pool = eligible(c, region);
  if (!pool.length) return null;
  // Outbreak / migration species bypass the tier roll part of the time so the event is visible
  const boosted = c.boosted?.filter((b) => pool.some((p) => p.id === b.species)) ?? [];
  let e: Ecology | undefined;
  if (boosted.length && rng.next() < 0.6) e = ECOLOGY.get(rng.pick(boosted).species);
  if (!e) {
    const tier = pickTier(rng, pool);
    const inTier = pool.filter((p) => p.rarity === tier);
    e = rng.weighted(inTier, (p) => speciesWeight(p, c)) ?? inTier[0];
  }
  if (!e) return null;
  return {
    species: e.id, level: rollLevel(rng, e, region, o.worldLevelBonus), rarity: e.rarity,
    shiny: rollShiny(rng, o.shinyRate ?? SHINY_BASE), temperament: e.temperament,
  };
}

/** Shiny roll — independent of rarity tier by design. */
export function rollShiny(rng: Rng, rate = SHINY_BASE): boolean {
  return rng.next() < rate;
}

/** Fish and other sea creatures: they spawn on water tiles and never leave the water. */
export function isAquatic(species: string): boolean {
  return !!ECOLOGY.get(species)?.aquatic;
}
