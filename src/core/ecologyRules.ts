import rulesJson from '../data/world/ecology-rules.json';
import { Biome, ECOLOGY, EncounterRoll, RegionDef, rollLevel, rollShiny, SHINY_BASE, SpawnContext, WeatherKind } from './encounters';
import type { Rng } from './rng';

// Ecology rules (pure, adventure + Vietnam Odyssey overworld): packs, territories and rare spawn conditions.
// - Packs: some species roam in groups that share a home, follow a leader and react together.
// - Territories: some species guard the ground around their home — anyone stepping inside gets a warning, then a fight;
//   leaving the territory ends the chase.
// - Rare conditions: a species that only shows up in a given biome / region at a given time of day and weather.

export interface PackRule { species: string; size: [number, number]; leader?: string }
export interface TerritoryRule { species: string; radius: number }
export interface RareRule {
  id: string;
  species: string;
  biomes?: Biome[];
  regions?: string[];
  time?: 'day' | 'night' | 'any';
  /** In-game clock window [from, to) in minutes (overrides `time`) */
  hours?: [number, number];
  weather?: WeatherKind[];
  aquatic?: boolean;
  /** Chance per ordinary spawn attempt while every condition holds */
  chance: number;
  hint: string;
}

interface Rules { packs: PackRule[]; territorial: TerritoryRule[]; rare: RareRule[] }
const RULES = rulesJson as Rules;

export const PACKS = new Map(RULES.packs.map((p) => [p.species, p]));
export const TERRITORIES = new Map(RULES.territorial.map((t) => [t.species, t]));
export const RARE_RULES: RareRule[] = RULES.rare;

/** How far pack-mates spread from the first member, and how far an alarm carries. */
export const PACK_SPREAD = 56;
export const PACK_ALARM_R = 380;
/** A territorial Pokémon warns this long before charging. */
export const TERRITORY_WARN = 1.3;

export function territoryOf(species: string): number {
  return TERRITORIES.get(species)?.radius ?? 0;
}

export interface PackPlan { species: string; level: number; leader: boolean }

/**
 * The rest of a pack once its first member has been rolled: size-1 followers of the same species, one of them
 * possibly replaced by an evolved leader — only when the leader's evolution floor is within 3 levels of the pack
 * (no Lv 18 Mightyena leading Lv 4 pups). The first member keeps its own roll.
 */
export function planPack(rng: Rng, first: { species: string; level: number }, region: RegionDef): PackPlan[] {
  const rule = PACKS.get(first.species);
  if (!rule) return [];
  const n = rng.int(rule.size[0], rule.size[1]) - 1;
  const out: PackPlan[] = [];
  for (let i = 0; i < n; i++) out.push({ species: first.species, level: Math.max(region.level[0], first.level + rng.int(-1, 1)), leader: false });
  const lead = rule.leader ? ECOLOGY.get(rule.leader) : undefined;
  if (out.length && lead && first.level + 3 >= lead.minLevel) {
    out[0] = { species: lead.id, level: Math.max(first.level + 2, lead.minLevel), leader: true };
  } else if (out.length) {
    // no evolved leader around yet: the strongest of the same species leads
    out[0] = { species: first.species, level: first.level + 2, leader: true };
  }
  return out;
}

/** True when the time of day matches a rule. */
function timeMatches(r: RareRule, night: boolean, clock?: number): boolean {
  if (r.hours) {
    if (clock === undefined) return false;
    const [a, b] = r.hours;
    return a <= b ? clock >= a && clock < b : clock >= a || clock < b;
  }
  if (r.time === 'night') return night;
  if (r.time === 'day') return !night;
  return true;
}

/** Rare rules whose conditions all hold right now (region, biome, water/land, time, weather). */
export function activeRare(c: SpawnContext, region: RegionDef, clock?: number): RareRule[] {
  return RARE_RULES.filter((r) => {
    const e = ECOLOGY.get(r.species);
    if (!e || e.legendary || e.mythical) return false;
    if (!!r.aquatic !== !!c.aquatic) return false;
    if (r.regions && !r.regions.includes(region.id)) return false;
    if (r.biomes && !r.biomes.includes(c.biome) && !r.biomes.some((b) => c.extraBiomes?.includes(b))) return false;
    if (!timeMatches(r, c.night, clock)) return false;
    if (r.weather && !r.weather.includes(c.weather)) return false;
    return true;
  });
}

/** One roll against the rare conditions active right now; null most of the time. */
export function rollRare(rng: Rng, c: SpawnContext, region: RegionDef, o: { clock?: number; worldLevelBonus?: number; shinyRate?: number; chanceMult?: number } = {}): (EncounterRoll & { rule: string }) | null {
  for (const r of activeRare(c, region, o.clock)) {
    // a healthy ecosystem (conservation) makes rare visitors more frequent
    if (rng.next() >= r.chance * (o.chanceMult ?? 1)) continue;
    const e = ECOLOGY.get(r.species)!;
    return {
      species: e.id, level: rollLevel(rng, e, region, o.worldLevelBonus), rarity: e.rarity === 'common' || e.rarity === 'uncommon' ? 'rare' : e.rarity,
      shiny: rollShiny(rng, o.shinyRate ?? SHINY_BASE), temperament: e.temperament, rule: r.id,
    };
  }
  return null;
}

// ───────────────────────────── the Pokédex table of rare conditions (V30) ─────────────────────────────

const BIOME_VI: Record<string, string> = {
  meadow: 'đồng cỏ', forest: 'rừng', lake: 'hồ', rocky: 'đồi đá', ruins: 'tàn tích', farm: 'nông trại', snow: 'vùng tuyết',
  volcano: 'núi lửa', swamp: 'đầm lầy', coast: 'bờ biển', sanctuary: 'thánh địa', cave: 'hang động',
};
const WEATHER_VI: Record<string, string> = {
  clear: 'trời quang', rain: 'mưa', heavyRain: 'mưa xối xả', fog: 'sương mù', mysticFog: 'sương huyền bí',
  thunderstorm: 'giông sét', heatwave: 'sóng nhiệt', blizzard: 'bão tuyết', snow: 'tuyết rơi',
};
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface RareRow { id: string; species: string; where: string; when: string; weather: string; hint: string }

/**
 * Every rare condition as a row of the Pokédex table: where (encounter regions by name, else habitats; on water when
 * aquatic), when (clock window / day / night) and the weather it needs. `regionName` resolves an encounter region id.
 */
export function rareRows(regionName: (id: string) => string | undefined): RareRow[] {
  return RARE_RULES.map((r) => {
    const place = r.regions ? r.regions.map((id) => regionName(id) ?? id).join(', ') : r.biomes ? r.biomes.map((b) => BIOME_VI[b] ?? b).join(', ') : 'mọi nơi';
    const when = r.hours ? `${hhmm(r.hours[0])}–${hhmm(r.hours[1])}` : r.time === 'night' ? 'ban đêm' : r.time === 'day' ? 'ban ngày' : 'mọi lúc';
    return {
      id: r.id, species: r.species, where: place + (r.aquatic ? ' (dưới nước)' : ''), when,
      weather: r.weather ? r.weather.map((w) => WEATHER_VI[w] ?? w).join(' / ') : 'mọi thời tiết', hint: r.hint,
    };
  });
}

/** Hints for the rare conditions that can happen in a region (journal / signs). */
export function rareHints(region: RegionDef): string[] {
  return RARE_RULES.filter((r) => (r.regions ? r.regions.includes(region.id) : !r.biomes || r.biomes.includes(region.biome))).map((r) => r.hint);
}
