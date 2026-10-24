// Regional environment effects on combat (Adventure). Pure rules; EnvironmentController applies them.
//
//  Núi Tuyết (frozen)
//    • Ice tiles: slippery footing → 30 % slow while standing on them; deep snow → 15 % slow;
//    • Blizzard (every 50–70 s, 12 s): the whole player side is slowed 25 % — except Ice types and anyone within
//      150 px of a Fire-type ally (its warmth).
//  Vùng Núi Lửa (volcanic)
//    • Heat: within 2 tiles of lava, every 2 s non-Fire/Water/Ground units of the player side lose 2 % HP
//      (never below 25 % — the heat wears you down, it doesn't kill);
//    • Eruption (every 45–60 s, 10 s): falling embers (telegraphed fire hazards, 25 % burn) near the trainer.
//  Đầm Lầy Sương Mù (swamp, 0.9.0)
//    • Toxic puddles: every second on one, 35 % chance to be poisoned — Poison and Steel types are immune.
// Ice / Fire / Water / Ground types resist what fits their type, as noted above.

import type { PokeType } from './types';

export type EnvTheme = 'frozen' | 'volcanic' | string | undefined;
export type EnvEvent = 'blizzard' | 'eruption';

export interface EnvCycle {
  event: EnvEvent | null;
  /** seconds until the event starts (idle) or ends (running) */
  t: number;
}

export const ENV = {
  iceSlow: 0.3,
  snowSlow: 0.15,
  blizzardSlow: 0.25,
  warmthRange: 150,
  heatTick: 2,
  heatPct: 0.02,
  heatFloor: 0.25,
  heatRangeTiles: 2,
  emberEvery: 1.2,
  bogTick: 1,
  bogChance: 0.35,
} as const;

/** Which periodic event a region has. */
export function regionEvent(theme: EnvTheme): EnvEvent | null {
  return theme === 'frozen' ? 'blizzard' : theme === 'volcanic' ? 'eruption' : null;
}

export function eventDuration(e: EnvEvent): number { return e === 'blizzard' ? 12 : 10; }

/** Advances the idle → event → idle cycle. `rand` in [0,1). Returns the event that just started, if any. */
export function stepCycle(c: EnvCycle, theme: EnvTheme, dt: number, rand: () => number): EnvEvent | null {
  const ev = regionEvent(theme);
  if (!ev) { c.event = null; c.t = 30; return null; }
  c.t -= dt;
  if (c.t > 0) return null;
  if (c.event) { c.event = null; c.t = ev === 'blizzard' ? 50 + rand() * 20 : 45 + rand() * 15; return null; }
  c.event = ev;
  c.t = eventDuration(ev);
  return ev;
}

/** Slow (0..1) from the ground under a unit + the blizzard. */
export function terrainSlow(ground: 'ice' | 'snowDeep' | 'other', types: readonly PokeType[], blizzard: boolean, warm: boolean): number {
  if (types.includes('ice')) return 0;
  let s = ground === 'ice' ? ENV.iceSlow : ground === 'snowDeep' ? ENV.snowSlow : 0;
  if (blizzard && !warm) s = Math.max(s, ENV.blizzardSlow);
  return s;
}

/** Heat damage of one tick near lava (0 if the unit resists or is already at the floor). */
export function heatDamage(types: readonly PokeType[], hp: number, maxHp: number): number {
  if (types.some((t) => t === 'fire' || t === 'water' || t === 'ground')) return 0;
  const floor = maxHp * ENV.heatFloor;
  if (hp <= floor) return 0;
  return Math.min(hp - floor, maxHp * ENV.heatPct);
}

/** Poison chance of one second on a toxic puddle (0 for Poison / Steel types). */
export function bogPoisonChance(types: readonly PokeType[]): number {
  return types.includes('poison') || types.includes('steel') ? 0 : ENV.bogChance;
}
