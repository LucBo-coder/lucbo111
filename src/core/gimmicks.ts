import { validTeraType } from './pokemonTraits';
import { POKEMON } from './data';
import { evolutionsOf, megaFormsOf } from './evolution';
import { effectiveness } from './typeChart';
import type { PokeType, StatusKind } from './types';

// Terastal and Dynamax / Gigantamax (V31) — pure rules, no Phaser (unit-tested).
//  • Terastal: the Pokémon takes its Tera Type for a while — its defence becomes that single type, moves of the Tera
//    Type get STAB (2× when the Tera Type is also one of its own types) and a 60 floor on their power. Its size never
//    changes; the renderer coats it in crystal and puts the type's jewel crown on its head.
//  • Dynamax: the Pokémon grows into a giant for a short time — HP ×2, its moves become Max Moves (stronger, each
//    type with its own side effect). A Pokémon with the Gigantamax Factor (Max Soup) grows into its Gigantamax form
//    and one type of its moves becomes its G-Max Move.
//  How big a giant is drawn: `giantScale` follows the official height of the Gigantamax form (Pokédex, "28.0+ m"),
//  a generic Dynamax counts as 20 m. Up to 40 m the ratio between two giants is exactly the ratio of their heights;
//  beyond that (Centiskorch 75 m, Eternamax 100 m) it grows logarithmically so the giant still fits on the screen.

export const TERA_DURATION = 60; // s
export const TERA_COOLDOWN = 90; // s after it ends
export const DYNAMAX_DURATION = 30; // s
export const DYNAMAX_COOLDOWN = 150; // s after it ends
/** s without combat → back to normal (like Mega) */
export const GIMMICK_IDLE_REVERT = 10;
export const DYNAMAX_HP_MULT = 2;
/** hitbox of a giant (the sprite grows far more; the logic body stays close to the original so it can still move) */
export const DYNAMAX_RADIUS_MULT = 1.5;
/** Max Moves hit harder, but a fast / ticking skill is not allowed to more than ×1.6 its damage */
export const MAX_MOVE_MULT_CAP = 1.6;
/** seconds between two Max Move side effects of the same giant */
export const MAX_EFFECT_COOLDOWN = 2.5;
/** Tera Shards needed to change a Pokémon's Tera Type */
export const TERA_SHARD_COST = 10;
/** Tera STAB: Tera Type that is also one of the original types */
export const TERA_STAB_SAME = 2;
export const TERA_POWER_FLOOR = 60;

/** generic Dynamax height (m) — the main series gives no height for a plain Dynamax, they all tower over the stadium */
export const DYNAMAX_HEIGHT_M = 20;
/** visual scale per metre up to SCALE_LINEAR_MAX_M, then logarithmic */
export const SCALE_PER_M = 0.16;
export const SCALE_LINEAR_MAX_M = 40;

/** Can never Dynamax (main series): the heroes of Galar and Eternatus outside its own battle. */
export const NO_DYNAMAX = new Set(['zacian', 'zamazenta', 'eternatus']);

export type MaxEffect =
  | { kind: 'foe'; status: StatusKind; magnitude: number; duration: number; text: string }
  | { kind: 'ally'; status: StatusKind; magnitude: number; duration: number; text: string }
  | { kind: 'shield'; frac: number; text: string }
  | { kind: 'heal'; frac: number; text: string }
  | { kind: 'haste'; seconds: number; text: string }
  | { kind: 'cleanse'; text: string }
  | { kind: 'field'; type: PokeType; mult: number; duration: number; text: string };

export interface MaxMove { name: string; type: PokeType; gmax: boolean; effect: MaxEffect }

const foe = (status: StatusKind, magnitude: number, duration: number, text: string): MaxEffect => ({ kind: 'foe', status, magnitude, duration, text });
const field = (type: PokeType, text: string): MaxEffect => ({ kind: 'field', type, mult: 1.3, duration: 8, text });

/** The Max Move of each type and its side effect (adapted to real time: a stat stage → a timed status). */
export const MAX_MOVES: Record<PokeType, { name: string; effect: MaxEffect }> = {
  normal: { name: 'Max Strike', effect: foe('slow', 0.3, 5, 'đối thủ chậm lại') },
  fighting: { name: 'Max Knuckle', effect: { kind: 'ally', status: 'atkUp', magnitude: 0.2, duration: 8, text: 'đồng đội tăng công' } },
  flying: { name: 'Max Airstream', effect: { kind: 'haste', seconds: 1.5, text: 'đồng đội tăng tốc (hồi chiêu nhanh)' } },
  poison: { name: 'Max Ooze', effect: { kind: 'ally', status: 'atkUp', magnitude: 0.2, duration: 8, text: 'đồng đội tăng công đặc biệt' } },
  ground: { name: 'Max Quake', effect: { kind: 'shield', frac: 0.1, text: 'đồng đội được che chắn' } },
  rock: { name: 'Max Rockfall', effect: field('rock', 'bão cát: chiêu hệ Đá mạnh hơn') },
  bug: { name: 'Max Flutterby', effect: foe('slow', 0.2, 5, 'đối thủ yếu đi, chậm lại') },
  ghost: { name: 'Max Phantasm', effect: foe('defDown', 0.2, 6, 'đối thủ giảm thủ') },
  steel: { name: 'Max Steelspike', effect: { kind: 'shield', frac: 0.12, text: 'đồng đội cứng như thép' } },
  fire: { name: 'Max Flare', effect: field('fire', 'nắng gắt: chiêu hệ Lửa mạnh hơn') },
  water: { name: 'Max Geyser', effect: field('water', 'mưa lớn: chiêu hệ Nước mạnh hơn') },
  grass: { name: 'Max Overgrowth', effect: { kind: 'heal', frac: 0.08, text: 'thảm cỏ hồi máu đồng đội' } },
  electric: { name: 'Max Lightning', effect: field('electric', 'địa hình điện: chiêu hệ Điện mạnh hơn') },
  psychic: { name: 'Max Mindstorm', effect: field('psychic', 'địa hình tâm linh: chiêu hệ Siêu Linh mạnh hơn') },
  ice: { name: 'Max Hailstorm', effect: field('ice', 'mưa đá: chiêu hệ Băng mạnh hơn') },
  dragon: { name: 'Max Wyrmwind', effect: foe('slow', 0.2, 5, 'đối thủ giảm công, chậm lại') },
  dark: { name: 'Max Darkness', effect: foe('defDown', 0.2, 6, 'đối thủ giảm thủ đặc biệt') },
  fairy: { name: 'Max Starfall', effect: { kind: 'cleanse', text: 'sương mù: đồng đội sạch trạng thái' } },
};

export interface GmaxDef {
  /** official height of the Gigantamax form (m) */
  height: number;
  move: string;
  type: PokeType;
  effect: MaxEffect;
}

/** Every Gigantamax form (official heights, G-Max Move and its effect adapted to real time). */
export const GMAX: Record<string, GmaxDef> = {
  venusaur: { height: 24, move: 'G-Max Vine Lash', type: 'grass', effect: foe('leech', 0.03, 6, 'roi dây quất liên tục') },
  charizard: { height: 28, move: 'G-Max Wildfire', type: 'fire', effect: foe('burn', 0.04, 6, 'biển lửa thiêu đối thủ') },
  blastoise: { height: 25, move: 'G-Max Cannonade', type: 'water', effect: foe('slow', 0.35, 6, 'xoáy nước nhấn chìm đối thủ') },
  butterfree: { height: 17, move: 'G-Max Befuddle', type: 'bug', effect: foe('paralysis', 0.25, 4, 'phấn độc làm tê liệt') },
  pikachu: { height: 21, move: 'G-Max Volt Crash', type: 'electric', effect: foe('paralysis', 0.25, 4, 'đối thủ tê liệt') },
  meowth: { height: 33, move: 'G-Max Gold Rush', type: 'normal', effect: foe('confusion', 0, 3, 'mưa xu làm đối thủ rối loạn') },
  machamp: { height: 25, move: 'G-Max Chi Strike', type: 'fighting', effect: { kind: 'ally', status: 'atkUp', magnitude: 0.3, duration: 8, text: 'đồng đội tăng công mạnh' } },
  gengar: { height: 20, move: 'G-Max Terror', type: 'ghost', effect: foe('slow', 0.5, 5, 'bóng ma trói chân đối thủ') },
  kingler: { height: 19, move: 'G-Max Foam Burst', type: 'water', effect: foe('slow', 0.5, 5, 'bọt biển làm đối thủ chậm hẳn') },
  lapras: { height: 24, move: 'G-Max Resonance', type: 'ice', effect: { kind: 'shield', frac: 0.15, text: 'màn cực quang che chắn đồng đội' } },
  eevee: { height: 18, move: 'G-Max Cuddle', type: 'normal', effect: foe('stun', 0, 1.2, 'đối thủ say đắm, khựng lại') },
  snorlax: { height: 35, move: 'G-Max Replenish', type: 'normal', effect: { kind: 'heal', frac: 0.15, text: 'quả mọng rơi xuống hồi máu đồng đội' } },
  garbodor: { height: 21, move: 'G-Max Malodor', type: 'poison', effect: foe('poison', 0.03, 6, 'mùi hôi làm đối thủ trúng độc') },
  melmetal: { height: 25, move: 'G-Max Meltdown', type: 'steel', effect: foe('taunt', 0, 5, 'đối thủ không dùng được chiêu hỗ trợ') },
  rillaboom: { height: 28, move: 'G-Max Drum Solo', type: 'grass', effect: foe('defDown', 0.25, 6, 'tiếng trống xuyên thủ') },
  cinderace: { height: 27, move: 'G-Max Fireball', type: 'fire', effect: foe('burn', 0.04, 6, 'quả cầu lửa thiêu đối thủ') },
  inteleon: { height: 40, move: 'G-Max Hydrosnipe', type: 'water', effect: foe('defDown', 0.25, 6, 'phát bắn tỉa xuyên thủ') },
  corviknight: { height: 14, move: 'G-Max Wind Rage', type: 'flying', effect: { kind: 'haste', seconds: 2.5, text: 'cuồng phong: đồng đội hồi chiêu nhanh' } },
  orbeetle: { height: 14, move: 'G-Max Gravitas', type: 'psychic', effect: foe('slow', 0.4, 6, 'trọng lực đè nặng đối thủ') },
  drednaw: { height: 24, move: 'G-Max Stonesurge', type: 'water', effect: field('rock', 'đá nhọn rải sân: chiêu hệ Đá mạnh hơn') },
  coalossal: { height: 42, move: 'G-Max Volcalith', type: 'rock', effect: foe('burn', 0.04, 6, 'đá núi lửa thiêu đối thủ') },
  flapple: { height: 24, move: 'G-Max Tartness', type: 'grass', effect: foe('defDown', 0.2, 6, 'vị chua làm đối thủ sơ hở') },
  appletun: { height: 24, move: 'G-Max Sweetness', type: 'grass', effect: { kind: 'cleanse', text: 'mật táo làm sạch trạng thái đồng đội' } },
  sandaconda: { height: 22, move: 'G-Max Sandblast', type: 'ground', effect: foe('slow', 0.3, 6, 'bão cát giam đối thủ') },
  toxtricity: { height: 24, move: 'G-Max Stun Shock', type: 'electric', effect: foe('paralysis', 0.25, 4, 'điện độc làm tê liệt') },
  centiskorch: { height: 75, move: 'G-Max Centiferno', type: 'fire', effect: foe('burn', 0.05, 6, 'vòng lửa giam đối thủ') },
  hatterene: { height: 26, move: 'G-Max Smite', type: 'fairy', effect: foe('confusion', 0, 3, 'đối thủ rối loạn') },
  grimmsnarl: { height: 32, move: 'G-Max Snooze', type: 'dark', effect: foe('sleep', 0, 3, 'đối thủ buồn ngủ') },
  alcremie: { height: 30, move: 'G-Max Finale', type: 'fairy', effect: { kind: 'heal', frac: 0.17, text: 'kem ngọt hồi máu đồng đội' } },
  copperajah: { height: 23, move: 'G-Max Steelsurge', type: 'steel', effect: field('steel', 'gai thép rải sân: chiêu hệ Thép mạnh hơn') },
  duraludon: { height: 43, move: 'G-Max Depletion', type: 'dragon', effect: foe('taunt', 0, 5, 'đối thủ cạn sức chiêu hỗ trợ') },
  urshifu: { height: 29, move: 'G-Max One Blow', type: 'dark', effect: foe('defDown', 0.3, 6, 'một đòn xuyên mọi phòng thủ') },
};

// ───────────────────────────── Terastal ─────────────────────────────

/** The Tera Type of a Pokémon: the one chosen with Tera Shards, else its species' first type. */
export function teraTypeOf(species: string, stored?: string | null): PokeType {
  return validTeraType(stored) ? stored : (POKEMON.get(species)?.types[0] ?? 'normal');
}

/** STAB multiplier while Terastallized: original types keep 1.5×, the Tera Type gives 1.5× (2× if also original). */
export function teraStab(original: readonly PokeType[], tera: PokeType, moveType: PokeType): number {
  if (moveType === tera) return original.includes(tera) ? TERA_STAB_SAME : 1.5;
  return original.includes(moveType) ? 1.5 : 1;
}

/** Power of a move while Terastallized: a weak move of the Tera Type is raised to 60. */
export function teraPower(power: number, moveType: PokeType, tera: PokeType | null | undefined): number {
  return tera && moveType === tera && power > 0 && power < TERA_POWER_FLOOR ? TERA_POWER_FLOOR : power;
}

// ───────────────────────────── Dynamax ─────────────────────────────

/** Main-series Max Move power from the base move's power (Fighting / Poison use the lower table). */
export function maxMovePower(power: number, type: PokeType): number {
  if (power <= 0) return 0;
  const low = type === 'fighting' || type === 'poison';
  const steps: [number, number, number][] = [[40, 90, 70], [50, 100, 75], [60, 110, 80], [70, 120, 85], [100, 130, 90], [140, 140, 95]];
  for (const [max, hi, lo] of steps) if (power <= max) return low ? lo : hi;
  return low ? 100 : 150;
}

/** Damage multiplier of a move while Dynamaxed (Max Move power / move power, capped for fast skills). */
export function maxMoveMult(power: number, type: PokeType): number {
  if (power <= 0) return 1;
  return Math.max(1, Math.min(MAX_MOVE_MULT_CAP, maxMovePower(power, type) / power));
}

/** Gigantamax data of a species (its own G-Max form), if any. */
export function gmaxOf(species: string): GmaxDef | null {
  return GMAX[species] ?? null;
}

/** The species itself or something it evolves into has a Gigantamax form (Max Soup works on the whole line). */
export function gmaxLine(species: string, depth = 0): boolean {
  if (GMAX[species]) return true;
  if (depth > 3) return false;
  return evolutionsOf(species).some((o) => !o.unsupported && gmaxLine(o.to, depth + 1));
}

/** The Max Move a giant uses for a move of this type (the G-Max Move replaces its type's Max Move). */
export function maxMoveOf(species: string, type: PokeType, gmax: boolean): MaxMove {
  const g = gmax ? GMAX[species] : undefined;
  if (g && g.type === type) return { name: g.move, type, gmax: true, effect: g.effect };
  const m = MAX_MOVES[type] ?? MAX_MOVES.normal;
  return { name: m.name, type, gmax: false, effect: m.effect };
}

/** Height (m) the giant stands at: its Gigantamax form's official height, else the generic Dynamax height. */
export function giantHeight(species: string, gmax: boolean): number {
  return (gmax && GMAX[species]?.height) || DYNAMAX_HEIGHT_M;
}

/** Visual scale of a giant relative to its normal size (see the header comment). */
export function giantScale(species: string, gmax: boolean): number {
  const h = giantHeight(species, gmax);
  if (h <= SCALE_LINEAR_MAX_M) return h * SCALE_PER_M;
  return SCALE_LINEAR_MAX_M * SCALE_PER_M + 1.2 * Math.log(h / SCALE_LINEAR_MAX_M);
}

// ───────────────────────────── Primal Reversion ─────────────────────────────

/**
 * Official heights (m) of the Primal forms and of their base species — Primal Kyogre is more than twice Kyogre's
 * length. Their PMD sheets are drawn at about the base species' size, so the renderer scales them by `primalScale`.
 */
export const PRIMAL_HEIGHT: Record<string, { form: number; base: number }> = {
  'kyogre-primal': { form: 9.8, base: 4.5 },
  'groudon-primal': { form: 5.0, base: 3.5 },
};

/** The Primal form a species reverts to while its orb (Blue Orb / Red Orb, key items) is in the bag. */
export function primalFormOf(species: string, has: (item: string) => boolean): string | null {
  for (const p of POKEMON.values()) if (p.mega?.primal && p.mega.base === species && has(p.mega.stone)) return p.id;
  return null;
}

export function primalScale(form: string): number {
  const h = PRIMAL_HEIGHT[form];
  return h ? h.form / h.base : 1;
}

// ───────────────────────────── who may transform ─────────────────────────────

export interface GimmickCheck { ok: boolean; reason?: string; gmax?: boolean }

/** A Pokémon on the field and what it already is (one transformation at a time, as in the main series). */
export interface GimmickUnit { species: string; fainted: boolean; mega: boolean; tera: boolean; dyna: boolean }

function busy(u: GimmickUnit): string | null {
  if (u.fainted) return 'Pokémon đã kiệt sức';
  if (u.mega) return 'Pokémon đang ở dạng Mega';
  if (u.tera) return 'Pokémon đang Terastal';
  if (u.dyna) return 'Pokémon đang Dynamax';
  return null;
}

export function canTera(u: GimmickUnit | null, hasOrb: boolean, active: boolean, cooldown: number): GimmickCheck {
  if (!hasOrb) return { ok: false, reason: 'Cần Quả Cầu Tera (Tera Orb)' };
  if (active) return { ok: false, reason: 'Chỉ một Pokémon được Terastal cùng lúc' };
  if (cooldown > 0) return { ok: false, reason: `Quả Cầu Tera đang sạc lại (${Math.ceil(cooldown)}s)` };
  if (!u) return { ok: false, reason: 'Không có Pokémon nào trên sân' };
  const b = busy(u);
  return b ? { ok: false, reason: b } : { ok: true };
}

export function canDynamax(u: GimmickUnit | null, hasBand: boolean, active: boolean, cooldown: number, hasFactor: boolean): GimmickCheck {
  if (!hasBand) return { ok: false, reason: 'Cần Vòng Dynamax (Dynamax Band)' };
  if (active) return { ok: false, reason: 'Chỉ một Pokémon được Dynamax cùng lúc' };
  if (cooldown > 0) return { ok: false, reason: `Vòng Dynamax đang hồi năng lượng (${Math.ceil(cooldown)}s)` };
  if (!u) return { ok: false, reason: 'Không có Pokémon nào trên sân' };
  const b = busy(u);
  if (b) return { ok: false, reason: b };
  if (NO_DYNAMAX.has(u.species)) return { ok: false, reason: `${POKEMON.get(u.species)?.name ?? u.species} không thể Dynamax` };
  return { ok: true, gmax: hasFactor && !!GMAX[u.species] };
}

/**
 * Key items earned with the regional / legendary bosses beaten: the Tera Orb after the 2nd, the Dynamax Band after
 * the 4th (both campaigns; an old save that is already past them gets them the next time it loads).
 */
export const TERA_ORB_AT = 2;
export const DYNAMAX_BAND_AT = 4;
export function gimmickGifts(bossesBeaten: number, has: (id: string) => boolean): string[] {
  const out: string[] = [];
  if (bossesBeaten >= TERA_ORB_AT && !has('tera-orb')) out.push('tera-orb');
  if (bossesBeaten >= DYNAMAX_BAND_AT && !has('dynamax-band')) out.push('dynamax-band');
  return out;
}

// ───────────────────────────── trainers who use them (V31) ─────────────────────────────

/** Ace level from which an NPC trainer Terastallizes / Dynamaxes (once per battle). */
export const TRAINER_TERA_LEVEL = 30;
export const TRAINER_DYNAMAX_LEVEL = 55;

/** What a trainer of this strength brings: Dynamax for the strongest, Terastal from mid-game, nothing before. */
export function trainerGimmick(aceLevel: number, species: string): 'dynamax' | 'tera' | null {
  if (aceLevel >= TRAINER_DYNAMAX_LEVEL && !NO_DYNAMAX.has(species)) return 'dynamax';
  return aceLevel >= TRAINER_TERA_LEVEL ? 'tera' : null;
}

/** When: its last Pokémon comes out, or the one on the field drops under half HP. */
export function trainerGimmickNow(hpFrac: number, benchLeft: number): boolean {
  return benchLeft === 0 || hpFrac < 0.5;
}

/**
 * The Tera Type a trainer picks against the player's Pokémon: among its own types and the types of its moves, the one
 * that takes the least from the foe's types; a tie goes to a type it has moves of (offence), then to its own type.
 */
export function pickTeraType(own: readonly PokeType[], moveTypes: readonly PokeType[], foe: readonly PokeType[] | null): PokeType {
  const cands = [...new Set([...own, ...moveTypes])];
  if (!foe?.length || !cands.length) return own[0] ?? 'normal';
  const taken = (t: PokeType) => Math.max(...foe.map((f) => effectiveness(f, [t])));
  const score = (t: PokeType) => taken(t) * 10 - (moveTypes.includes(t) ? 1 : 0) - (own.includes(t) ? 0.5 : 0);
  return cands.reduce((a, b) => (score(b) < score(a) ? b : a));
}

// ───────────────────────────── Max Raid (V31) ─────────────────────────────

/** A raid boss shrinks back (and can be caught) once its HP falls under this fraction. */
export const RAID_SHRINK_AT = 0.25;
export const RAID_HP_MULT = 10;

/** Loot of a won Max Raid: Tera Shards always, Exp. Candy, and the Max Soup from a Gigantamax raid (else a chance). */
export function raidRewards(gmax: boolean, roll: number): Record<string, number> {
  const out: Record<string, number> = { 'tera-shard': gmax ? 5 : 3, 'exp-candy-m': 2 };
  if (gmax || roll < 0.15) out['max-soup'] = 1;
  return out;
}

// ───────────────────────────── Việt Nam Odyssey: where the key items come from (V31) ─────────────────────────────

/**
 * The classic campaign gets the Key Stone from Mega Venusaur and the orbs from the legendary shrines; Việt Nam Odyssey
 * has neither, so: the Key Stone + the Mega Stone of the player's starter line with the first guardian calmed, the
 * Blue Orb with Khánh Hòa's guardian (Kyogre waits on the Nha Trang shore), the Red Orb with Gia Lai's (Groudon in
 * the Chư Đăng Ya crater). The Tera Orb / Dynamax Band come with the bosses beaten, as in the classic campaign.
 */
export const VN_KEY_STONE_AT = 1;
export const VN_ORBS: { flag: string; item: string; legend: string }[] = [
  { flag: 'boss:kingdra', item: 'blue-orb', legend: 'kyogre' },
  { flag: 'boss:conkeldurr', item: 'red-orb', legend: 'groudon' },
];

/** First Mega Stone of the species' line (itself or anything it evolves into), e.g. Charmander → Charizardite X. */
export function lineMegaStone(species: string, depth = 0): string | null {
  const own = megaFormsOf(species)[0]?.stone;
  if (own) return own;
  if (depth > 3) return null;
  for (const o of evolutionsOf(species)) {
    if (o.unsupported) continue;
    const s = lineMegaStone(o.to, depth + 1);
    if (s) return s;
  }
  return null;
}

export function vietnamGifts(bossesBeaten: number, hasFlag: (f: string) => boolean, has: (id: string) => boolean, starter: string | null): string[] {
  const out: string[] = [];
  if (bossesBeaten >= VN_KEY_STONE_AT && !has('key-stone')) {
    out.push('key-stone');
    const stone = starter ? lineMegaStone(starter) : null;
    if (stone && !has(stone)) out.push(stone);
  }
  for (const o of VN_ORBS) if (hasFlag(o.flag) && !has(o.item)) out.push(o.item);
  return out;
}
