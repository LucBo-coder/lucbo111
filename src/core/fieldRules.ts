// "Mỗi HLV một Pokémon" (Phiêu lưu, Việt Nam Odyssey, co-op của hai chế độ đó): balance values live in
// data/field-rules.json; this module only gives them names and the pure rules built on them (tests, server).
import rules from '../data/field-rules.json';

export interface FieldRules {
  /** Pokémon of one trainer outside their balls at once */
  maxActivePerTrainer: number;
  /** cooldown after a summon / recall / switch with no hostile Pokémon near (s) */
  calmCooldown: number;
  /** cooldown after a switch in combat (s) */
  combatCooldown: number;
  /** recall + summon animation in combat (s) — together ≈ 0.6 s */
  combatRecallTime: number;
  combatSummonTime: number;
  calmRecallTime: number;
  calmSummonTime: number;
  /** a hostile Pokémon closer than this to the trainer = "in combat" (px) */
  combatRadius: number;
  /** share of a battle's EXP each healthy Pokémon in its ball receives (the active one gets it all) */
  reserveExpShare: number;
  /** the active Pokémon fainted and the player has not picked: the best match-up comes out after (s) */
  faintAutoSendAfter: number;
  /** boss damage-over-time multiplier (poison / burn / leech stay useful, never decisive) */
  bossDotResist: number;
  /** boss duration multiplier for sleep / freeze / stun / flinch, and the immunity window after one ends (s) */
  bossControlScale: number;
  bossControlImmunity: number;
  /** boss HP multiplier in Adventure / Vietnam Odyssey: bosses were sized for a whole party on the field, now one
   * Pokemon fights at a time (the rest swap in) */
  bossHpScale: number;
  /** boss damage to a party Pokemon there (it takes every hit alone now) */
  bossDamageScale: number;
  /** phase-2 adds of a boss there: at most this many per trainer in the fight, this many levels under the boss */
  bossAddsPerTrainer: number;
  bossAddLevelDrop: number;
  partyMax: number;
  /** party members a co-op guest brings (one on the field) */
  coopGuestCarry: number;
}

export const FIELD: Readonly<FieldRules> = rules as FieldRules;

/** Cooldown that follows a summon / recall / switch. */
export const switchCooldown = (inCombat: boolean): number => (inCombat ? FIELD.combatCooldown : FIELD.calmCooldown);

/** Recall and summon animation lengths (s). */
export const switchTimes = (inCombat: boolean): { recall: number; summon: number } =>
  inCombat ? { recall: FIELD.combatRecallTime, summon: FIELD.combatSummonTime } : { recall: FIELD.calmRecallTime, summon: FIELD.calmSummonTime };

/**
 * EXP of one battle for the party: the Pokémon that fought (on the field) gets all of it, every other healthy
 * party member a share (the "Máy chia EXP" rule), so a six-Pokémon team does not need six times the grinding.
 */
export function expShares(party: { uid: string; fainted: boolean }[], fought: string[], exp: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of party) {
    if (p.fainted) continue;
    const v = fought.includes(p.uid) ? exp : Math.floor(exp * FIELD.reserveExpShare);
    if (v > 0) out.set(p.uid, v);
  }
  return out;
}

/** Skill cooldowns and energy of a Pokémon that went back into its ball: they keep running while it waits. */
export interface BallSnapshot {
  /** cooldown left per skill id when it was recalled */
  cds: Record<string, number>;
  energy: number;
  /** world time of the recall */
  at: number;
}

/** Cooldowns of a Pokémon coming back out: what was left minus the time spent in the ball (never below 0). */
export function restoredCooldown(snap: BallSnapshot | undefined, skillId: string, now: number): number {
  const left = snap?.cds[skillId];
  if (left == null) return 0;
  return Math.max(0, left - Math.max(0, now - snap!.at));
}
