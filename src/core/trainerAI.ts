// Trainer battle tactics for Adventure / Vietnam Odyssey (pure, testable).
// A trainer fields at most FIELD_MAX Pokémon at once and keeps the rest in reserve; a hurt Pokémon facing a bad type
// match-up is called back for a reserve that resists the player's Pokémon; a limited number of Potions; rematches
// after a cooldown with levels scaled to the player's party (money only — the first-win items are never paid twice).
import { effectiveness } from './typeChart';
import type { PokeType } from './types';

export const FIELD_MAX = 2;
/** a fielded Pokémon is swapped out below this HP fraction when it is at a type disadvantage */
export const SWITCH_HP = 0.5;
/** one Potion per battle by default (more for stronger trainers), used under this HP fraction */
export const HEAL_HP = 0.3;
export const HEAL_FRAC = 0.4;
/** play-time seconds before a beaten trainer accepts a rematch */
export const REMATCH_COOLDOWN = 600;
export const REMATCH_MAX_WINS = 5;

export interface Combatant { types: readonly PokeType[]; hp: number; maxHp: number }

/** How hard `foe` hits `me` with its own types (best of its STAB types). */
export function threat(foe: readonly PokeType[], me: readonly PokeType[]): number {
  return Math.max(...foe.map((t) => effectiveness(t, me)), 0);
}

/** How hard `me` hits `foe`. */
export function pressure(me: readonly PokeType[], foe: readonly PokeType[]): number {
  return threat(me, foe);
}

/** Match-up score of a trainer Pokémon against the player's Pokémon: higher is better for the trainer. */
export function matchup(me: readonly PokeType[], foe: readonly PokeType[]): number {
  return pressure(me, foe) - threat(foe, me);
}

/**
 * Index in `reserves` to swap the fielded unit for, or -1 to keep fighting.
 * Swaps only when the unit is hurt (< SWITCH_HP), the player's Pokémon hits it super-effectively, and a healthy reserve
 * that is not weak to the player's Pokémon has a strictly better match-up.
 */
export function pickSwitch(active: Combatant, reserves: readonly Combatant[], foe: readonly PokeType[]): number {
  if (active.hp <= 0 || active.hp / active.maxHp >= SWITCH_HP) return -1;
  if (threat(foe, active.types) < 2) return -1;
  const now = matchup(active.types, foe);
  let best = -1, bestScore = now;
  reserves.forEach((r, i) => {
    if (r.hp <= 0 || threat(foe, r.types) >= 2) return; // never swap into another weakness
    const sc = matchup(r.types, foe) + 0.25 * (r.hp / r.maxHp);
    if (sc > bestScore) { best = i; bestScore = sc; }
  });
  return best;
}

/** Best reserve to send out when a slot opens (a fielded Pokémon fainted or was recalled). */
export function pickLead(reserves: readonly Combatant[], foe: readonly PokeType[] | null): number {
  let best = -1, bestScore = -Infinity;
  reserves.forEach((r, i) => {
    if (r.hp <= 0) return;
    const sc = (foe ? matchup(r.types, foe) : 0) + 0.25 * (r.hp / r.maxHp);
    if (sc > bestScore) { best = i; bestScore = sc; }
  });
  return best;
}

export function shouldHeal(u: Combatant, potionsLeft: number): boolean {
  return potionsLeft > 0 && u.hp > 0 && u.hp / u.maxHp < HEAL_HP;
}

/** Potions a trainer carries: 1, or 2 for a team of 3+ / a rematch. */
export function potionsFor(teamSize: number, rematch: boolean): number {
  return teamSize >= 3 || rematch ? 2 : 1;
}

export interface RematchSave { at: number; wins: number }

export function rematchReady(r: RematchSave | undefined, beatAt: number | undefined, playTime: number): boolean {
  const last = r?.at ?? beatAt;
  if (last == null) return true;
  return playTime - last >= REMATCH_COOLDOWN;
}

/**
 * Rematch team: same species, levels raised towards the player's strongest party member (never above it +3 and never
 * past 100), plus 2 levels per previous rematch win (capped).
 */
export function rematchTeam(team: readonly [string, number][], partyTop: number, wins: number): [string, number][] {
  const base = Math.max(...team.map(([, lv]) => lv));
  const target = Math.min(100, Math.max(base + 3, Math.min(partyTop + 3, base + 15)) + 2 * Math.min(wins, REMATCH_MAX_WINS));
  const lift = target - base;
  return team.map(([sp, lv]) => [sp, Math.min(100, lv + lift)]);
}

/** Rematch prize money: grows with wins, no items (the first win's items are a one-time reward). */
export function rematchPrize(wins: number): number {
  return 300 + 100 * Math.min(wins, REMATCH_MAX_WINS);
}
