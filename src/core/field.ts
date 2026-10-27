// Exploration abilities (pure): which party member can clear a field obstacle, hidden nooks, boulder pushing, boats.
// Data: data/world/field-abilities.json (who can do what), region `field` entries (where). Cleared obstacles are saved
// as flags `field:<region>:<id>`; a pushed boulder's tile in `adv.boulders`.
import abilitiesJson from '../data/world/field-abilities.json';
import type { PokeType } from './types';

export type FieldAbility = 'cut' | 'smash' | 'strength' | 'boat' | 'flash';
export interface FieldAbilityDef { name: string; obstacle: string; hint: string; types: PokeType[]; minLevel: number; requiresFlag?: string }
export const FIELD_ABILITIES = abilitiesJson as unknown as Record<FieldAbility, FieldAbilityDef>;

/**
 * One authored field obstacle.
 * - cut / smash: blocks the gap of a hidden nook (`nook`: a ring of trees / boulders around x, y with a chest inside).
 * - strength: a boulder pushed one tile per press, away from the player; reaching `to` fills the hole → solved.
 * `chest` inside the nook / opened by the solved push uses the region's chest list (`requiresFlag` = this obstacle's flag).
 */
export interface FieldDef {
  id: string;
  ability: Exclude<FieldAbility, 'boat'>;
  x: number;
  y: number;
  /** hidden nook: centre, radius (tiles), wall kind; the gap is where the obstacle stands */
  nook?: { cx: number; cy: number; r: number; wall: 'tree' | 'boulder' };
  /** strength: target hole tile */
  to?: [number, number];
  /** smash: drawn as a cracked wall (a shrine's `%`, e.g. Mew's ruins) instead of a boulder */
  look?: 'crack';
}

export const fieldFlag = (region: string, id: string) => `field:${region}:${id}`;

export interface PartyMember { species: string; name: string; level: number; types: readonly PokeType[] }

/** First party member able to use the ability (null = nobody; the flag condition is checked separately). */
export function fieldUser(ab: FieldAbility, party: readonly PartyMember[]): PartyMember | null {
  const d = FIELD_ABILITIES[ab];
  if (!d.types.length) return null;
  return party.find((p) => p.level >= d.minLevel && p.types.some((t) => d.types.includes(t))) ?? null;
}

export type FieldCheck = { ok: true; by: PartyMember | null } | { ok: false; reason: string };

export function canUse(ab: FieldAbility, party: readonly PartyMember[], flags: { has(f: string): boolean }): FieldCheck {
  const d = FIELD_ABILITIES[ab];
  if (d.requiresFlag && !flags.has(d.requiresFlag)) return { ok: false, reason: d.hint };
  if (!d.types.length) return { ok: true, by: null };
  const by = fieldUser(ab, party);
  return by ? { ok: true, by } : { ok: false, reason: d.hint };
}

/** Boulder ring of a nook, leaving one gap at the obstacle. Points in tile units (centre of each wall piece). */
export function nookRing(f: FieldDef): { x: number; y: number }[] {
  const n = f.nook;
  if (!n) return [];
  const gapA = Math.atan2(f.y + 0.5 - n.cy, f.x + 0.5 - n.cx);
  // pieces every 0.85 tile of arc, the first ones 0.75 tile either side of the gap: they overlap the obstacle's collider,
  // so the only way in is through it
  const arc = 2 * Math.PI * n.r, out: { x: number; y: number }[] = [];
  for (let s = 0.75; s <= arc - 0.75 + 1e-6; s += Math.max(0.85, (arc - 1.5) / Math.floor((arc - 1.5) / 0.85))) {
    const a = gapA + s / n.r;
    out.push({ x: n.cx + Math.cos(a) * n.r, y: n.cy + Math.sin(a) * n.r });
  }
  return out;
}

/**
 * Where a pushed boulder goes: one tile along the dominant axis away from the player, or null when blocked.
 * `free(tx, ty)` = the tile is open ground with nothing standing on it.
 */
export function pushTarget(bx: number, by: number, px: number, py: number, free: (tx: number, ty: number) => boolean): [number, number] | null {
  const dx = bx + 0.5 - px, dy = by + 0.5 - py;
  const [sx, sy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
  const nx = bx + sx, ny = by + sy;
  return free(nx, ny) ? [nx, ny] : null;
}

// ── boats (Vietnam Odyssey rivers) ──

export interface Dock { id: string; name: string; x: number; y: number; /** water tile the boat starts from */ wx: number; wy: number }

/** River current at a point: unit direction of the nearest river segment (downstream = polyline order) × speed. */
export function riverCurrent(rivers: readonly { w: number; pts: number[][] }[], tx: number, ty: number, speed: number): { vx: number; vy: number } {
  let best = Infinity, vx = 0, vy = 0;
  for (const r of rivers) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
    const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy || 1;
    const t = Math.max(0, Math.min(1, ((tx - ax) * ux + (ty - ay) * uy) / l2));
    const d = Math.hypot(tx - (ax + t * ux), ty - (ay + t * uy));
    if (d < best && d <= r.w + 1) { best = d; const l = Math.sqrt(l2); vx = (ux / l) * speed; vy = (uy / l) * speed; }
  }
  return { vx, vy };
}

/**
 * Tide on the Mekong (simplified, two cycles a day): 1 = high water (nước lớn), -1 = low (nước ròng).
 * The current runs faster at low tide and slackens at high tide.
 */
export function tide(clockMin: number): number {
  return Math.cos(((clockMin % 720) / 720) * Math.PI * 2);
}

export function tideName(clockMin: number): string {
  const t = tide(clockMin);
  if (t > 0.35) return 'Nước lớn';
  if (t < -0.35) return 'Nước ròng';
  // in between: d(tide)/dt = -sin(phase) → falling while the sine is positive
  return Math.sin(((clockMin % 720) / 720) * Math.PI * 2) > 0 ? 'Nước đang rút' : 'Nước đang lên';
}

export function currentSpeed(clockMin: number): number {
  return 26 - 14 * tide(clockMin); // 12 px/s at high tide … 40 px/s at low tide
}
