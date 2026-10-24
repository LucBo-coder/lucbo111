import { rayAirborne } from '../src/core/bosses/rayquaza';
import { STEP, type Unit, type World } from '../src/core/world';

/**
 * Drives a boss down to `frac` of its HP the way a real fight does since v0.8: one hit can no longer skip
 * a phase (HP stops at each threshold) and the boss is invulnerable during each transition, so this hits,
 * waits for the phase to become ACTIVE again, and hits again. Ends early once the boss is weakened / dead.
 * The trainer is kept alive (these tests drive phases, not survival). Returns the seconds it took.
 */
export function beatBossTo(w: World, b: Unit, frac: number, maxSecs = 40): number {
  let t = 0;
  for (let i = 0; i < 60 * maxSecs; i++) {
    const pm = b.boss!.pm;
    if (!b.alive || pm.state === 'WEAKENED' || pm.state === 'DEFEATED') return t;
    if (b.hp <= b.maxHp * frac && pm.canAct) return t;
    if (pm.canAct && !rayAirborne(b) && b.hp > b.maxHp * frac) w.applyDamage(b, Math.ceil(b.hp - b.maxHp * frac), null);
    if (!b.alive) return t;
    w.trainer.hp = w.trainer.maxHp;
    w.step(STEP);
    t += STEP;
  }
  return t;
}
