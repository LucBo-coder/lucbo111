import cache from '../data/pokeapi/pokeapi-cache.json';
import type { Category, PokeType } from './types';

// Weather called up by a Pokémon. Pure rules, no Phaser.
// Two kinds of source (docs/weather-pokemon-research.md):
//   • ability [chính thức] — Drizzle, Drought, Sand Stream, Snow Warning… the individual's own ability;
//   • lore    [theo Pokédex] — the species is said to cause it (Zapdos: thunderstorms, Articuno: snow, Lugia: storms,
//     Tornadus: gales…). A lore source belongs to the whole species and comes before the ability.
// Real-time take on the main series: the weather holds for a number of seconds (≈ the 5 turns of the games);
// one weather at a time, a newer one replaces the old. Some sources calm the sky instead (Rayquaza, Landorus…).
//   Mưa      — Water ×1.5, Fire ×0.5
//   Nắng gắt — Fire ×1.5, Water ×0.5
//   Bão cát  — chip damage to everyone but Rock / Ground / Steel; Rock takes ⅔ of special damage
//   Tuyết    — Ice takes ⅔ of physical damage
//   Giông bão — Electric ×1.5, Water ×1.2, Fire ×0.75; lightning strikes the fight (never finishes anyone off)
//   Gió lớn  — Flying ×1.5

export type BattleWeather = 'rain' | 'sun' | 'sand' | 'snow' | 'thunderstorm' | 'wind';
/** What a source does: call a weather, or calm the sky (end the weathers it names). */
export type WeatherAct = BattleWeather | 'calm';

export const WEATHER_DURATION = 40;
export const PRIMAL_WEATHER_DURATION = 90;
/** Legendary lore weather: lasts while its Pokémon stays in the fight (cap), ends the moment it leaves. */
export const LEGEND_WEATHER_DURATION = 90;
/** Sandstorm chip: every SAND_TICK seconds, a fraction of max HP (bosses: much less — their HP is huge). */
export const SAND_TICK = 2;
export const SAND_CHIP = 1 / 80;
export const SAND_CHIP_BOSS = 1 / 600;
/** Thunderstorm: a bolt every LIGHTNING_TICK seconds on one Pokémon in the fight. */
export const LIGHTNING_TICK = 3;
export const LIGHTNING_CHIP = 1 / 30;
export const LIGHTNING_CHIP_BOSS = 1 / 400;
/** Sand Spit / anger sources: at most one call per this many seconds. */
export const HIT_CALL_COOLDOWN = 8;

export const WEATHER_INFO: Record<BattleWeather, { name: string; icon: string; color: string; effect: string; short: string; mods: Partial<Record<PokeType, number>> }> = {
  rain: { name: 'Mưa', icon: '☔', color: '#80b8ff', effect: 'hệ Nước +50%, hệ Lửa −50%', short: 'Nước +50% · Lửa −50%', mods: { water: 1.5, fire: 0.5 } },
  sun: { name: 'Nắng gắt', icon: '☀', color: '#ffc040', effect: 'hệ Lửa +50%, hệ Nước −50%', short: 'Lửa +50% · Nước −50%', mods: { fire: 1.5, water: 0.5 } },
  sand: { name: 'Bão cát', icon: '≋', color: '#e0c080', effect: 'mất máu dần trừ hệ Đá / Đất / Thép, hệ Đá chịu đòn đặc biệt tốt hơn', short: 'Mất máu dần (trừ Đá / Đất / Thép)', mods: {} },
  snow: { name: 'Tuyết', icon: '❄', color: '#c8f0ff', effect: 'hệ Băng chịu đòn vật lý tốt hơn', short: 'Hệ Băng chịu đòn vật lý tốt hơn', mods: {} },
  thunderstorm: { name: 'Giông bão', icon: '⚡', color: '#ffe060', effect: 'hệ Điện +50%, hệ Nước +20%, hệ Lửa −25%, sét đánh xuống trận (trừ hệ Điện / Đất)', short: 'Điện +50% · sét đánh', mods: { electric: 1.5, water: 1.2, fire: 0.75 } },
  wind: { name: 'Gió lớn', icon: '༄', color: '#d0f0e0', effect: 'hệ Bay +50%', short: 'Bay +50%', mods: { flying: 1.5 } },
};

/** Ability id (PokéAPI) → the weather it calls. */
export const WEATHER_ABILITIES: Record<string, BattleWeather> = {
  drizzle: 'rain', 'primordial-sea': 'rain',
  drought: 'sun', 'desolate-land': 'sun', 'orichalcum-pulse': 'sun',
  'sand-stream': 'sand', 'sand-spit': 'sand',
  'snow-warning': 'snow',
};
const PRIMAL = new Set(['primordial-sea', 'desolate-land']);

/** One way a Pokémon changes the weather. */
export interface WeatherSource {
  act: WeatherAct;
  /** calm: the weathers it ends (missing = every weather) */
  clears?: BattleWeather[];
  duration: number;
  /** entry = when it joins a fight · hit = when an attack lands on it · anger = once it falls under half HP */
  trigger: 'entry' | 'hit' | 'anger';
  /** the weather ends as soon as this Pokémon leaves the fight (fainted, caught, gone) */
  tied?: boolean;
  /** only acts while one of these weathers is up (Bellossom dances for the sun when cloudy weather persists) */
  onlyWhen?: BattleWeather[];
  /** only acts when at least this many of its species are in the fight (several Pikachu → lightning storm) */
  crowd?: number;
  origin: 'ability' | 'lore';
  /** ability id, or the species for a lore source */
  id: string;
  /** lore: the Pokédex line it comes from (version in brackets) */
  dex?: string;
}

type LoreEntry = Omit<WeatherSource, 'origin' | 'id' | 'duration'> & { duration?: number };

/**
 * [Theo Pokédex] Species said to cause or end a weather. Every entry quotes the Pokédex line it rests on
 * (PokéAPI flavour texts; see docs/weather-pokemon-research.md §3D). Not a main-series battle mechanic.
 */
export const LORE_WEATHER: Record<string, LoreEntry> = {
  kyogre: { act: 'rain', trigger: 'entry', tied: true, dex: 'create massive rain clouds that cover the entire sky and bring about torrential downpours (Ruby)' },
  groudon: { act: 'sun', trigger: 'entry', tied: true, dex: 'the power to scatter rain clouds and make water evaporate with light and heat (Sapphire)' },
  zapdos: { act: 'thunderstorm', trigger: 'entry', tied: true, dex: 'causes savage thunderstorms by flapping its glittering wings (Gold)' },
  articuno: { act: 'snow', trigger: 'entry', tied: true, dex: 'chills moisture in the atmosphere to create snow while flying (Silver)' },
  lugia: { act: 'thunderstorm', trigger: 'entry', tied: true, dex: 'If it flaps its wings, it is said to cause a 40-day storm (Diamond)' },
  tornadus: { act: 'wind', trigger: 'entry', tied: true, dex: 'causing severe storms. Its power is great enough to blow houses away (White)' },
  thundurus: { act: 'thunderstorm', trigger: 'entry', tied: true, dex: 'flies around the Unova region firing off lightning bolts (White)' },
  raikou: { act: 'thunderstorm', trigger: 'entry', tied: true, duration: 60, dex: 'The rain clouds it carries let it fire thunderbolts at will (Gold)' },
  suicune: { act: 'wind', trigger: 'entry', tied: true, duration: 60, dex: 'north winds will somehow blow whenever it appears (Silver)' },
  rayquaza: { act: 'calm', trigger: 'entry', dex: 'quelled the clash of Kyogre and Groudon (story of Emerald / Omega Ruby–Alpha Sapphire)' },
  landorus: { act: 'calm', clears: ['thunderstorm', 'wind', 'rain'], trigger: 'entry', dex: 'After the tempests and thunderbolts abate, the land is sure to be blessed with bountiful harvests (Legends: Arceus)' },
  moltres: { act: 'calm', clears: ['snow'], trigger: 'entry', dex: 'said to bring early spring to the wintry lands it visits (Silver)' },
  enamorus: { act: 'calm', clears: ['snow'], trigger: 'entry', dex: 'When it flies to this land from across the sea, the bitter winter comes to an end (Legends: Arceus)' },
  abomasnow: { act: 'snow', trigger: 'entry', dex: 'This Pokémon is known to bring blizzards (Shield)' },
  vanilluxe: { act: 'snow', trigger: 'entry', dex: 'It can create snow anywhere (Ultra Sun)' },
  hippowdon: { act: 'sand', trigger: 'anger', dex: 'When roused to violence by its rage, it spews out the quantities of sand it has swallowed and whips up a sandstorm (Shield)' },
  reshiram: { act: 'sun', trigger: 'entry', tied: true, duration: 60, dex: 'When Reshiram’s tail flares, the heat energy moves the atmosphere and changes the world’s weather (White)' },
  'tapu-koko': { act: 'thunderstorm', trigger: 'entry', tied: true, duration: 60, dex: 'It summons thunderclouds and stores their lightning inside its body (Sun)' },
  manectric: { act: 'thunderstorm', trigger: 'entry', duration: 30, dex: 'When it enters a battle, this Pokémon creates thunderclouds (Omega Ruby)' },
  pikachu: { act: 'thunderstorm', trigger: 'entry', crowd: 3, duration: 30, dex: 'When several of these Pokémon gather, their electricity could build and cause lightning storms (Red)' },
  bronzong: { act: 'rain', trigger: 'entry', dex: 'It can summon rain clouds. People long ago revered it as the bringer of plentiful harvests (Pearl)' },
  bellossom: { act: 'sun', trigger: 'entry', onlyWhen: ['rain', 'snow', 'thunderstorm'], duration: 30, dex: 'When cloudy weather persists, it does a dance that is thought to be a ritual for summoning the sun (Emerald)' },
  flygon: { act: 'sand', trigger: 'entry', dex: 'Flygon whips up a sandstorm by flapping its wings (Alpha Sapphire)' },
  palossand: { act: 'sand', trigger: 'entry', dex: 'Once it has whipped up a sandstorm to halt its opponents in their tracks, this terrifying Pokémon snatches away their vitality (Ultra Moon)' },
  kingdra: { act: 'wind', trigger: 'entry', duration: 30, dex: 'It is said to cause tornadoes as it wakes (Silver)' },
  drampa: { act: 'wind', trigger: 'anger', duration: 30, dex: 'When that happens, it stirs up a gale and flattens everything around (Shield)' },
  frosmoth: { act: 'snow', trigger: 'entry', dex: 'It will fly around on its icy wings, causing a blizzard to chase offenders away (Shield)' },
  vanillite: { act: 'snow', trigger: 'entry', duration: 20, dex: 'They create snow crystals and make snow fall in the areas around them (Black)' },
};

/** [Theo Pokédex] Species that react to the weather (no weather of their own). */
export const LORE_REACTIVE: Record<string, string> = {
  castform: 'borrows the power of nature to transform itself into the guises of the sun, rain clouds, and snow clouds (Sapphire)',
  cherrim: 'During times of strong sunlight, its bud blooms, its petals open fully, and it becomes very active (HeartGold)',
  gigalith: 'its energy blasts… can only be fired when the sun is out (Shield)',
  cryogonal: 'When the weather gets hot, these Pokémon turn into water vapor (Shield)',
};

/** A player's own call (key C / touch button): after a call, that Pokémon waits this long before calling again. */
export const WEATHER_CALL_COOLDOWN = 60;

export function weatherOfAbility(id: string | null | undefined): BattleWeather | null {
  return (id && WEATHER_ABILITIES[id]) || null;
}

export function weatherDuration(abilityId: string): number {
  return PRIMAL.has(abilityId) ? PRIMAL_WEATHER_DURATION : WEATHER_DURATION;
}

/** The source behind a weather ability (Sand Spit goes off when hit, as in the games; Primal weathers end with their Pokémon). */
export function abilitySource(abilityId: string | null | undefined): WeatherSource | null {
  const w = weatherOfAbility(abilityId);
  if (!w || !abilityId) return null;
  return { act: w, duration: weatherDuration(abilityId), trigger: abilityId === 'sand-spit' ? 'hit' : 'entry', tied: PRIMAL.has(abilityId), origin: 'ability', id: abilityId };
}

/** The lore source of a species, if its Pokédex says it changes the weather. */
export function loreSource(species: string): WeatherSource | null {
  const e = LORE_WEATHER[species];
  if (!e) return null;
  return { ...e, duration: e.duration ?? (e.tied ? LEGEND_WEATHER_DURATION : WEATHER_DURATION), origin: 'lore', id: species };
}

/** Whether a Pokémon can act on the weather on command now (reason = what the player is told when it can't). */
export function canCallWeather(src: WeatherSource | null, current: BattleWeather | null, cdLeft: number, crowdNow = 1): { ok: boolean; reason?: string } {
  if (!src) return { ok: false, reason: 'Không có Pokémon nào trên sân gọi được thời tiết' };
  if (src.crowd && crowdNow < src.crowd) return { ok: false, reason: `Cần ${src.crowd} con cùng loài trong trận mới gọi được ${WEATHER_INFO[src.act as BattleWeather].name}` };
  if (src.onlyWhen && (!current || !src.onlyWhen.includes(current))) return { ok: false, reason: `Chỉ gọi được khi trời ${src.onlyWhen.map((w) => WEATHER_INFO[w].name).join(' / ')}` };
  if (src.act === 'calm') {
    if (!current || (src.clears && !src.clears.includes(current))) return { ok: false, reason: 'Không có thời tiết nào để làm yên' };
  } else if (current === src.act) return { ok: false, reason: `${WEATHER_INFO[src.act].name} đang có rồi` };
  if (cdLeft > 0) return { ok: false, reason: `Gọi thời tiết: chờ ${Math.ceil(cdLeft)}s` };
  return { ok: true };
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

/** [Theo Pokédex] Species whose own attacks change with the weather (Cherrim blooms in the sun, Gigalith's sunbeam blasts). */
export function loreDamageMult(w: BattleWeather | null, attackerSpecies: string, category: Category): number {
  if (attackerSpecies === 'cherrim') return w === 'sun' ? 1.5 : 1;
  if (attackerSpecies === 'gigalith' && category === 'special') return w === 'sun' ? 1.3 : w === 'rain' || w === 'thunderstorm' ? 0.6 : 1;
  if (attackerSpecies === 'cryogonal') return w === 'sun' ? 0.7 : 1;
  return 1;
}

/** [Theo Pokédex] Castform takes the guise of the weather: its type follows it. */
export function castformTypes(w: BattleWeather | null): PokeType[] {
  return w === 'sun' ? ['fire'] : w === 'rain' || w === 'thunderstorm' ? ['water'] : w === 'snow' ? ['ice'] : ['normal'];
}

/** Sandstorm hurts everyone but Rock, Ground and Steel types. */
export function sandImmune(types: readonly PokeType[]): boolean {
  return types.some((t) => t === 'rock' || t === 'ground' || t === 'steel');
}

/** Lightning passes over Electric types and grounds into Ground types. */
export function lightningImmune(types: readonly PokeType[]): boolean {
  return types.some((t) => t === 'electric' || t === 'ground');
}

/** In-game description of a weather ability (party details, Pokédex). */
export function weatherAbilityText(abilityId: string): string {
  const src = abilitySource(abilityId)!;
  const info = WEATHER_INFO[src.act as BattleWeather];
  return `${src.trigger === 'hit' ? 'Khi bị trúng đòn' : 'Khi vào trận'} gọi ${info.name} trong ${src.duration}s: ${info.effect}.`;
}

/** Player-facing line for a species' lore weather (party details), or null. */
export function loreWeatherText(species: string): string | null {
  const src = loreSource(species);
  if (src) {
    const when = src.trigger === 'anger' ? 'Khi nổi giận (dưới nửa máu)'
      : src.crowd ? `Khi có từ ${src.crowd} con cùng loài trong trận`
        : src.onlyWhen ? `Khi trời ${src.onlyWhen.map((w) => WEATHER_INFO[w].name).join(' / ')}` : 'Khi vào trận';
    if (src.act === 'calm') {
      const what = src.clears ? src.clears.map((w) => WEATHER_INFO[w].name).join(' / ') : 'mọi thời tiết';
      return `Theo Pokédex: ${when.toLowerCase()} làm yên trời — xóa ${what}.`;
    }
    return `Theo Pokédex: ${when.toLowerCase()} gọi ${WEATHER_INFO[src.act].name} (${src.tied ? `tới ${src.duration}s, tan khi nó rời trận` : `${src.duration}s`}).`;
  }
  if (species === 'castform') return 'Theo Pokédex: hệ đổi theo thời tiết (Nắng → Lửa, Mưa → Nước, Tuyết → Băng).';
  if (species === 'cherrim') return 'Theo Pokédex: nở hoa khi nắng gắt — đòn mạnh hơn 50%.';
  if (species === 'gigalith') return 'Theo Pokédex: đòn đặc biệt +30% khi nắng, −40% khi mưa / giông.';
  if (species === 'cryogonal') return 'Theo Pokédex: tan thành hơi nước khi trời nóng — đòn yếu đi 30% khi nắng.';
  return null;
}
