import cache from '../data/pokeapi/pokeapi-cache.json';
import type { Category, PokeType } from './types';

// Weather called up by a Pokémon (Drizzle, Drought, Sand Stream, Snow Warning…). Pure rules, no Phaser.
// Real-time take on the main series: the ability fires when its Pokémon joins a fight and the weather holds for
// WEATHER_DURATION seconds (≈ the 5 turns of the games); one weather at a time, a newer one replaces the old.
//   Mưa      — Water ×1.5, Fire ×0.5
//   Nắng gắt — Fire ×1.5, Water ×0.5
//   Bão cát  — chip damage to everyone but Rock / Ground / Steel; Rock takes ⅔ of special damage
//   Tuyết    — Ice takes ⅔ of physical damage
// The legendary primal abilities (Primordial Sea / Desolate Land) last longer.

export type BattleWeather = 'rain' | 'sun' | 'sand' | 'snow';

export const WEATHER_DURATION = 40;
export const PRIMAL_WEATHER_DURATION = 90;
/** Sandstorm chip: every SAND_TICK seconds, a fraction of max HP (bosses: much less — their HP is huge). */
export const SAND_TICK = 2;
export const SAND_CHIP = 1 / 80;
export const SAND_CHIP_BOSS = 1 / 600;

export const WEATHER_INFO: Record<BattleWeather, { name: string; icon: string; color: string; effect: string; short: string; mods: Partial<Record<PokeType, number>> }> = {
  rain: { name: 'Mưa', icon: '☔', color: '#80b8ff', effect: 'hệ Nước +50%, hệ Lửa −50%', short: 'Nước +50% · Lửa −50%', mods: { water: 1.5, fire: 0.5 } },
  sun: { name: 'Nắng gắt', icon: '☀', color: '#ffc040', effect: 'hệ Lửa +50%, hệ Nước −50%', short: 'Lửa +50% · Nước −50%', mods: { fire: 1.5, water: 0.5 } },
  sand: { name: 'Bão cát', icon: '≋', color: '#e0c080', effect: 'mất máu dần trừ hệ Đá / Đất / Thép, hệ Đá chịu đòn đặc biệt tốt hơn', short: 'Mất máu dần (trừ Đá / Đất / Thép)', mods: {} },
  snow: { name: 'Tuyết', icon: '❄', color: '#c8f0ff', effect: 'hệ Băng chịu đòn vật lý tốt hơn', short: 'Hệ Băng chịu đòn vật lý tốt hơn', mods: {} },
};

/** Ability id (PokéAPI) → the weather it calls. */
export const WEATHER_ABILITIES: Record<string, BattleWeather> = {
  drizzle: 'rain', 'primordial-sea': 'rain',
  drought: 'sun', 'desolate-land': 'sun', 'orichalcum-pulse': 'sun',
  'sand-stream': 'sand', 'sand-spit': 'sand',
  'snow-warning': 'snow',
};
const PRIMAL = new Set(['primordial-sea', 'desolate-land']);

/** A player's own call (key C / touch button): after a call, that Pokémon waits this long before calling again. */
export const WEATHER_CALL_COOLDOWN = 60;

/** Whether a Pokémon can call its weather on command now (reason = what the player is told when it can't). */
export function canCallWeather(ability: string | null, current: BattleWeather | null, cdLeft: number): { ok: boolean; reason?: string } {
  const w = weatherOfAbility(ability);
  if (!w) return { ok: false, reason: 'Không có Pokémon nào trên sân có đặc tính gọi thời tiết' };
  if (current === w) return { ok: false, reason: `${WEATHER_INFO[w].name} đang có rồi` };
  if (cdLeft > 0) return { ok: false, reason: `Gọi thời tiết: chờ ${Math.ceil(cdLeft)}s` };
  return { ok: true };
}

export function weatherOfAbility(id: string | null | undefined): BattleWeather | null {
  return (id && WEATHER_ABILITIES[id]) || null;
}

export function weatherDuration(abilityId: string): number {
  return PRIMAL.has(abilityId) ? PRIMAL_WEATHER_DURATION : WEATHER_DURATION;
}

type AbilityEntry = { name: string; hidden: boolean };
const SPECIES = cache.species as unknown as Record<string, { abilities?: AbilityEntry[] }>;

/** A boss uses its species' ordinary weather ability (Torkoal, Tyranitar, Gigalith, Abomasnow, Kyogre, Groudon…). */
export function speciesWeatherAbility(species: string): string | null {
  const list = SPECIES[species]?.abilities ?? [];
  return list.find((a) => !a.hidden && WEATHER_ABILITIES[a.name])?.name ?? null;
}

/** Every species that can call a weather, with the ability and whether it is the Hidden Ability (Pokédex / tests). */
export function weatherSpecies(): { species: string; ability: string; weather: BattleWeather; hidden: boolean }[] {
  const out: { species: string; ability: string; weather: BattleWeather; hidden: boolean }[] = [];
  for (const [species, d] of Object.entries(SPECIES)) {
    for (const a of d.abilities ?? []) if (WEATHER_ABILITIES[a.name]) out.push({ species, ability: a.name, weather: WEATHER_ABILITIES[a.name], hidden: a.hidden });
  }
  return out;
}

/** Damage multiplier of a move in this weather (attack side: type boost; defence side: Rock in sand, Ice in snow). */
export function weatherDamageMult(w: BattleWeather | null, moveType: PokeType, category: Category, defenderTypes: readonly PokeType[]): number {
  if (!w) return 1;
  let m = WEATHER_INFO[w].mods[moveType] ?? 1;
  if (w === 'sand' && category === 'special' && defenderTypes.includes('rock')) m /= 1.5;
  if (w === 'snow' && category === 'physical' && defenderTypes.includes('ice')) m /= 1.5;
  return m;
}

/** Sandstorm hurts everyone but Rock, Ground and Steel types. */
export function sandImmune(types: readonly PokeType[]): boolean {
  return types.some((t) => t === 'rock' || t === 'ground' || t === 'steel');
}

/** In-game description of a weather ability (party details, Pokédex). */
export function weatherAbilityText(abilityId: string): string {
  const w = WEATHER_ABILITIES[abilityId];
  const info = WEATHER_INFO[w];
  return `Khi vào trận gọi ${info.name} trong ${weatherDuration(abilityId)}s: ${info.effect}.`;
}
