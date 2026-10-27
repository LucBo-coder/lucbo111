// Arena hazards of the legendary shrines (pure, LEGENDARY_SHRINES.md §2.2 step 5): each shrine has at most two kinds,
// only one active at a time (it changes with the boss phase), each strike telegraphed ≥ 0.8 s through the World's
// normal hazard pipeline (World.addHazard: warning circle, then the hit). This module only picks where they land.
import type { PokeType } from './types';

export type HazardKind =
  /** a circle on (just ahead of) the trainer — lightning, meteor, falling ice */
  | 'strike'
  /** circles all round the arena edge — tide rising, lava ring, closing storm */
  | 'ring'
  /** a line of circles from the boss through the trainer — gust, beam of light */
  | 'line'
  /** a few of the shrine's hazard floor tiles (`x`) flare up */
  | 'floor';

export interface HazardDef { kind: HazardKind; type: PokeType; every: number; power: number; r?: number }

/** Telegraph seconds (the design asks ≥ 0.8). */
export const HAZARD_TELEGRAPH = 1.0;
export const MAX_HAZARD_KINDS = 2;

/** The hazard active in boss phase `phase` (0-based): kinds alternate with the phases. */
export function activeHazard(list: readonly HazardDef[] | undefined, phase: number): HazardDef | null {
  if (!list?.length) return null;
  return list[Math.max(0, phase) % Math.min(list.length, MAX_HAZARD_KINDS)];
}

export interface HazardCtx {
  /** arena centre and radius (px) */
  cx: number; cy: number; R: number;
  trainer: { x: number; y: number; vx: number; vy: number };
  boss: { x: number; y: number } | null;
  /** hazard floor tiles (px centres) */
  floor: { x: number; y: number }[];
}

/** Where one strike of `h` lands: circles (px). Never outside the arena. */
export function hazardPoints(h: HazardDef, c: HazardCtx, rand: () => number): { x: number; y: number; r: number }[] {
  const r = h.r ?? 56;
  const inside = (p: { x: number; y: number }) => {
    const dx = p.x - c.cx, dy = p.y - c.cy, d = Math.hypot(dx, dy), max = Math.max(0, c.R - r * 0.5);
    return d <= max ? p : { x: c.cx + (dx / d) * max, y: c.cy + (dy / d) * max };
  };
  switch (h.kind) {
    case 'strike': {
      const t = c.trainer;
      return [{ ...inside({ x: t.x + t.vx * 0.6, y: t.y + t.vy * 0.6 }), r }];
    }
    case 'ring': {
      const n = 10, off = rand() * Math.PI * 2, rr = c.R - r * 0.6;
      return Array.from({ length: n }, (_, i) => ({ x: c.cx + Math.cos(off + (i / n) * Math.PI * 2) * rr, y: c.cy + Math.sin(off + (i / n) * Math.PI * 2) * rr, r }));
    }
    case 'line': {
      const from = c.boss ?? { x: c.cx, y: c.cy }, t = c.trainer;
      const a = Math.atan2(t.y - from.y, t.x - from.x), out: { x: number; y: number; r: number }[] = [];
      for (let k = 1; k <= 6; k++) {
        const p = { x: from.x + Math.cos(a) * r * 1.5 * k, y: from.y + Math.sin(a) * r * 1.5 * k };
        if (Math.hypot(p.x - c.cx, p.y - c.cy) > c.R) break;
        out.push({ ...p, r: r * 0.8 });
      }
      return out;
    }
    case 'floor': {
      if (!c.floor.length) return [];
      // five tiles spread evenly round the list from a random start (bounded: no retry loop on repeated rolls)
      const L = c.floor.length, n = Math.min(L, 5), start = Math.floor(rand() * L), step = Math.max(1, Math.floor(L / n));
      return Array.from({ length: n }, (_, k) => ({ ...c.floor[(start + k * step) % L], r: Math.max(r, 40) }));
    }
  }
}
