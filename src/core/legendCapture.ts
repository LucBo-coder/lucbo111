// Legendary capture rules. A legendary boss can only be caught once it has been beaten through every phase
// (BossPhaseManager → WEAKENED). Each boss has its own rule: how many throws, how long the window stays open,
// a floor on the per-throw chance (legendary capture rates are tiny) and, optionally, which balls work.

import { BallId } from './capture';

export interface LegendCaptureRule {
  /** Throws before it recovers and flies off */
  maxAttempts: number;
  /** Seconds the capture window stays open */
  window: number;
  /** Minimum chance per throw (after ball & HP modifiers) */
  minChance: number;
  /** Multiplier on the species capture rate */
  rateMult: number;
  /** Only these balls can hold it (others bounce off, no attempt used) */
  balls?: BallId[];
}

export const DEFAULT_LEGEND_RULE: LegendCaptureRule = { maxAttempts: 5, window: 40, minChance: 0.15, rateMult: 1 };

const RULES: Record<string, Partial<LegendCaptureRule>> = {
  rayquaza: { maxAttempts: 4, window: 35, minChance: 0.2 },
  mewtwo: { maxAttempts: 3, window: 30, minChance: 0.12 },
  arceus: { maxAttempts: 3, window: 30, minChance: 0.08, balls: ['ultraball', 'timerball', 'duskball', 'quickball', 'netball', 'luxuryball'] },
  dialga: { maxAttempts: 4, minChance: 0.12 },
  palkia: { maxAttempts: 4, minChance: 0.12 },
  giratina: { maxAttempts: 4, minChance: 0.12 },
};

export function legendRule(id: string): LegendCaptureRule {
  return { ...DEFAULT_LEGEND_RULE, ...RULES[id] };
}

/** Chance of one throw at a weakened legendary: the normal capture chance, floored by the rule, capped at 95 %. */
export function legendThrowChance(rule: LegendCaptureRule, ball: BallId, baseChance: number): number {
  if (rule.balls && !rule.balls.includes(ball)) return 0;
  return Math.min(0.95, Math.max(rule.minChance, baseChance));
}
