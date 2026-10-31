import { rayAirborne } from '../src/core/bosses/rayquaza';
import { STEP, type Unit, type World } from '../src/core/world';
import { POKEMON } from '../src/core/data';
import { pickLead } from '../src/core/trainerAI';
import { HEAL_POWER } from '../src/adventure/AdventureState';
import type { PokeType } from '../src/core/types';

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

/**
 * Adventure party for a boss fight under the one-Pokémon-per-trainer rule, the way a sensible player does it: the
 * member with the best type match-up against the boss goes out first, the others wait in their balls and the best
 * remaining one comes out when the active one faints (World.stepBench).
 */
export function sendParty(w: World, party: readonly (readonly [string, number])[], bossTypes: readonly PokeType[]): void {
  const lead = pickLead(party.map(([sp]) => ({ types: POKEMON.get(sp)!.types, hp: 1, maxHp: 1 })), bossTypes);
  const order = [party[lead], ...party.filter((_, i) => i !== lead)];
  order.forEach(([sp, l], i) => w.addPokemon(sp, { level: l, bench: i > 0 }));
}

/**
 * Boss fight as a level-appropriate player plays it: the trainer is kept standing (these tests measure the party),
 * and `potions` Potions are used on the Pokémon on the field when it drops under 30% HP (one Pokémon per trainer:
 * a Potion heals only that one). Returns the seconds the fight took (`maxSecs` if the boss is still up).
 */
export function fightBoss(w: World, b: Unit, maxSecs: number, potions = 2): number {
  let t = 0, left = potions;
  for (let i = 0; i < maxSecs / STEP && b.alive; i++) {
    w.trainer.hp = w.trainer.maxHp;
    const a = w.allies.find((u) => !u.fainted);
    if (a && left > 0 && a.hp < a.maxHp * 0.3) { left--; w.heal(a, a.maxHp * HEAL_POWER.potion.party); }
    w.step(STEP);
    t += STEP;
  }
  return t;
}
