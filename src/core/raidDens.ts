// Raid dens (V32) — pure rules, no Phaser (unit-tested). The scene side is adventure/RaidDenController.ts.
//
// Dens appear at random spots of the overworld like the raid dens of the Cobblemon mod: a ring of stones with a
// light column you can see from far away, a star rating (1–6★) and a kind:
//  • tera     — a Terastallized boss (cyan crystal light). Break its Tera layer, then catch it.
//  • dynamax  — a Dynamax giant (red light). Needs the Dynamax Band, like the old Max Raid event.
//  • gmax     — a Gigantamax giant (red + violet light), 3★ and up; a catch keeps the Gigantamax Factor.
// The player starts the raid with E. A raid has a timer, barrier shields at HP thresholds from 3★, and ends:
//  • won   — the boss is worn under RAID_CATCH_AT: it shrinks / its Tera shatters and can be caught (a raid boss is
//            easier to catch than a wild one), then rewards by stars whether it was caught or knocked out;
//  • lost  — the timer runs out, the trainer goes down or walks away from the den: the den collapses.

import type { Rng } from './rng';

export type RaidKind = 'tera' | 'dynamax' | 'gmax';
export type RaidStars = 1 | 2 | 3 | 4 | 5 | 6;

export interface RaidTier {
  stars: RaidStars;
  /** boss level = region elite top + offset */
  levelOffset: number;
  /** boss HP multiplier (before the Dynamax ×2) */
  hpMult: number;
  /** seconds to win */
  time: number;
  /** HP fractions where a barrier shield comes up */
  shields: number[];
  /** shield size, fraction of the boss's max HP */
  shieldFrac: number;
  /** capture-rate multiplier once the boss is worn down */
  catchMult: number;
  /** recommended level shown in the den dialogue */
  recommended: number;
}

export const RAID_TIERS: Record<RaidStars, RaidTier> = {
  1: { stars: 1, levelOffset: -10, hpMult: 4, time: 300, shields: [], shieldFrac: 0, catchMult: 3, recommended: -12 },
  2: { stars: 2, levelOffset: -5, hpMult: 6, time: 270, shields: [], shieldFrac: 0, catchMult: 2.5, recommended: -7 },
  3: { stars: 3, levelOffset: 0, hpMult: 8, time: 240, shields: [0.5], shieldFrac: 0.12, catchMult: 2, recommended: -2 },
  4: { stars: 4, levelOffset: 5, hpMult: 10, time: 210, shields: [0.6], shieldFrac: 0.16, catchMult: 1.6, recommended: 3 },
  5: { stars: 5, levelOffset: 10, hpMult: 13, time: 180, shields: [0.7, 0.4], shieldFrac: 0.18, catchMult: 1.3, recommended: 8 },
  6: { stars: 6, levelOffset: 15, hpMult: 16, time: 180, shields: [0.75, 0.5], shieldFrac: 0.22, catchMult: 1, recommended: 13 },
};

/** Under this HP fraction the boss shrinks / its Tera shatters and it can be caught. */
export const RAID_CATCH_AT = 0.25;
/** Seconds the worn-down boss waits for a ball before it flees. */
export const RAID_CATCH_WINDOW = 60;
/** Most dens on the map at once, seconds between den spawns, how long an untouched den stays. */
export const MAX_DENS = 3;
export const DEN_SPAWN_EVERY: [number, number] = [75, 150];
export const DEN_LIFETIME = 600;
/** Walking this far from the den during a raid abandons it. */
export const RAID_LEASH = 900;
/** Raid bosses are more often shiny than wild Pokémon (1/512). */
export const RAID_SHINY = 1 / 512;

/** Highest star rating the player can meet: two more stars per two bosses beaten (1★ → 6★). */
export function maxStars(bossesBeaten: number): RaidStars {
  return Math.min(6, 1 + Math.floor(bossesBeaten / 2) + (bossesBeaten > 0 ? 1 : 0)) as RaidStars;
}

/** Star rating of a new den: lower ratings are more common, 6★ stays rare. */
export function rollStars(rng: Rng, bossesBeaten: number): RaidStars {
  const top = maxStars(bossesBeaten);
  const tiers = Array.from({ length: top }, (_, i) => (i + 1) as RaidStars);
  const weight = (t: RaidStars) => (t === 6 ? 0.6 : top - t + 1);
  const total = tiers.reduce((a, t) => a + weight(t), 0);
  let r = rng.next() * total;
  for (const t of tiers) if ((r -= weight(t)) < 0) return t;
  return tiers[tiers.length - 1];
}

/** Kind of a new den: Tera always possible; giants once the player has the Dynamax Band (G-Max from 3★). */
export function rollKind(rng: Rng, stars: RaidStars, hasBand: boolean, gmaxAvailable: boolean): RaidKind {
  if (!hasBand) return 'tera';
  const r = rng.next();
  if (gmaxAvailable && stars >= 3 && r < 0.25) return 'gmax';
  return r < 0.6 ? 'dynamax' : 'tera';
}

export function raidLevel(stars: RaidStars, regionTop: number, maxLevel = 100): number {
  return Math.max(5, Math.min(maxLevel, regionTop + RAID_TIERS[stars].levelOffset));
}

/** Loot of a won raid, by stars and kind (`roll` in [0, 1) decides the chance drops). */
export function raidDenRewards(stars: RaidStars, kind: RaidKind, roll: number): { items: Record<string, number>; money: number } {
  const items: Record<string, number> = {};
  const add = (id: string, n: number) => { if (n > 0) items[id] = (items[id] ?? 0) + n; };
  const candy: Record<RaidStars, [string, number][]> = {
    1: [['exp-candy-xs', 3], ['exp-candy-s', 1]],
    2: [['exp-candy-s', 3]],
    3: [['exp-candy-m', 2], ['exp-candy-s', 2]],
    4: [['exp-candy-m', 3], ['exp-candy-l', 1]],
    5: [['exp-candy-l', 2], ['rare-candy', 1]],
    6: [['exp-candy-l', 3], ['exp-candy-xl', 1], ['rare-candy', 2]],
  };
  for (const [id, n] of candy[stars]) add(id, n);
  add('tera-shard', kind === 'tera' ? stars * 3 : stars);
  if (kind === 'gmax' || (kind === 'dynamax' && roll < 0.08 * stars)) add('max-soup', 1);
  if (stars >= 3) add('ultraball', stars - 1);
  else add('greatball', 3);
  return { items, money: 400 * stars + (stars >= 5 ? 1500 : 0) };
}

export function starsText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 6 - stars));
}

export const RAID_KIND_VI: Record<RaidKind, string> = { tera: 'Tera Raid', dynamax: 'Max Raid', gmax: 'Max Raid G-Max' };
