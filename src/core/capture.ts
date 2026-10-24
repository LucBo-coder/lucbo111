import { Rng } from './rng';
import type { StatusKind } from './types';

// Capture math follows the main-series Gen III/IV formula, applied to real-time HP:
//   a = ((3·MaxHP − 2·HP) · rate · ball) / (3·MaxHP) · status
//   a ≥ 255 → guaranteed;  otherwise 4 shake checks with b = 1048560 / √(√(16711680 / a))
// `rate` is the species capture rate from PokéAPI (1..255).

export const BALLS = {
  pokeball: { name: 'Poké Ball', mult: 1 },
  greatball: { name: 'Great Ball', mult: 1.5 },
  ultraball: { name: 'Ultra Ball', mult: 2 },
  // Gen IV special balls, adapted to real time (see ballMultiplier)
  netball: { name: 'Net Ball', mult: 1 },
  duskball: { name: 'Dusk Ball', mult: 1 },
  quickball: { name: 'Quick Ball', mult: 1 },
  timerball: { name: 'Timer Ball', mult: 1 },
  luxuryball: { name: 'Luxury Ball', mult: 1 },
} as const;
export const BALL_ORDER = ['pokeball', 'greatball', 'ultraball', 'netball', 'duskball', 'quickball', 'timerball', 'luxuryball'] as const;

export interface BallContext {
  types: readonly string[];
  /** night time or inside a cave / dungeon */
  dark: boolean;
  /** the target hasn't fought anyone yet (first throw of the encounter) */
  untouched: boolean;
  /** seconds since the target started fighting (0 if it hasn't) */
  battleSeconds: number;
}

/**
 * Real-time ball multipliers (main-series values): Net ×3.5 vs Bug/Water · Dusk ×3.5 at night / in caves ·
 * Quick ×4 before the target has fought · Timer 1 + seconds/10 (cap ×4) · Luxury ×1 (+50 friendship on catch).
 */
export function ballMultiplier(ball: BallId, c: BallContext): number {
  switch (ball) {
    case 'netball': return c.types.includes('bug') || c.types.includes('water') ? 3.5 : 1;
    case 'duskball': return c.dark ? 3.5 : 1;
    case 'quickball': return c.untouched ? 4 : 1;
    case 'timerball': return Math.min(4, 1 + c.battleSeconds / 10);
    default: return BALLS[ball].mult;
  }
}

export type BallId = keyof typeof BALLS;

export function statusBonus(statuses: readonly StatusKind[], asleep = false): number {
  // Gen III/IV: sleep / freeze ×2; paralysis / poison / burn ×1.5 (stun & slow keep their earlier bonus)
  if (asleep || statuses.some((s) => s === 'sleep' || s === 'freeze' || s === 'stun')) return 2;
  if (statuses.some((s) => s === 'paralysis' || s === 'poison' || s === 'badPoison' || s === 'burn' || s === 'slow' || s === 'leech')) return 1.5;
  return 1;
}

export function catchValue(maxHp: number, hp: number, captureRate: number, ballMult: number, status: number): number {
  const h = Math.max(1, Math.min(hp, maxHp));
  return (((3 * maxHp - 2 * h) * captureRate * ballMult) / (3 * maxHp)) * status;
}

/** Probability (0..1) that one shake check passes. */
export function shakeProbability(a: number): number {
  if (a >= 255) return 1;
  if (a <= 0) return 0;
  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a));
  return Math.min(1, b / 65536);
}

/** Overall catch probability = p^4. */
export function captureChance(maxHp: number, hp: number, captureRate: number, ballMult: number, status: number): number {
  return Math.pow(shakeProbability(catchValue(maxHp, hp, captureRate, ballMult, status)), 4);
}

export interface CaptureRoll {
  success: boolean;
  /** Number of wobbles shown before the result (0-3) */
  shakes: number;
}

export function rollCapture(rng: Rng, maxHp: number, hp: number, captureRate: number, ballMult: number, status: number): CaptureRoll {
  const p = shakeProbability(catchValue(maxHp, hp, captureRate, ballMult, status));
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng.next() >= p) return { success: false, shakes: Math.min(3, shakes) };
    shakes++;
  }
  return { success: true, shakes: 3 };
}

/** Chance a wild Pokémon runs away after breaking free (timid species flee more). */
export function fleeChance(temperament: 'timid' | 'neutral' | 'aggressive', hpFrac: number): number {
  const base = temperament === 'timid' ? 0.35 : temperament === 'neutral' ? 0.15 : 0;
  return Math.max(0, base * (0.5 + hpFrac));
}
