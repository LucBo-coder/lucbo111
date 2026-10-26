import modsJson from '../data/world/dungeon-mods.json';
import { Rng } from './rng';

// Dungeon 2.0 (pure): the variant of the day, floor traps and the secret room's loot.
// Every dungeon rolls 1–2 modifiers per in-game day and difficulty (same day → same variant, so leaving and
// re-entering does not reroll). Each modifier makes the run harder in one way and raises the EXP / world EXP
// reward; "Mạch quặng" only adds items. Traps are placed on free floor tiles of the wave and puzzle rooms.

export interface DungeonMod {
  id: 'dark' | 'swarm' | 'quake' | 'elite' | 'traps' | 'rich';
  name: string;
  desc: string;
  /** Extra fraction of EXP / world EXP */
  reward: number;
  extraPerWave?: number;
  elitesPerWave?: number;
  /** Multiplier on the hazard corridor's interval (< 1 = more rocks) */
  hazardMult?: number;
  traps?: number;
  bonusItems?: Record<string, number>;
}

interface ModsData {
  mods: DungeonMod[];
  count: Record<string, [number, number]>;
  traps: Record<string, number>;
  secret: Record<string, Record<string, number>>;
}
const DATA = modsJson as unknown as ModsData;
export const DUNGEON_MODS = DATA.mods;

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The modifiers of a dungeon on an in-game day at a difficulty (deterministic, no duplicates). */
export function modsFor(dungeonId: string, day: number, difficulty: string): DungeonMod[] {
  const rng = new Rng(seedOf(`${dungeonId}:${day}:${difficulty}`));
  const [lo, hi] = DATA.count[difficulty] ?? [1, 1];
  const n = rng.int(lo, hi);
  const pool = [...DUNGEON_MODS];
  const out: DungeonMod[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

export function rewardMult(mods: readonly DungeonMod[]): number {
  return 1 + mods.reduce((s, m) => s + m.reward, 0);
}

export interface DungeonReward { items: Record<string, number>; exp: number; worldExp: number; reputation: number }

/** Chest reward with the variant applied: EXP and world EXP scaled, bonus items added; reputation unchanged. */
export function scaleReward(r: DungeonReward, mods: readonly DungeonMod[]): DungeonReward {
  const k = rewardMult(mods);
  const items = { ...r.items };
  for (const m of mods) for (const [id, n] of Object.entries(m.bonusItems ?? {})) items[id] = (items[id] ?? 0) + n;
  return { items, exp: Math.round(r.exp * k), worldExp: Math.round(r.worldExp * k), reputation: r.reputation };
}

/** "Hang tối + Bầy đàn (+45% EXP)" */
export function modsLabel(mods: readonly DungeonMod[]): string {
  if (!mods.length) return 'Không có';
  const pct = Math.round((rewardMult(mods) - 1) * 100);
  return mods.map((m) => m.name).join(' + ') + (pct > 0 ? ` (+${pct}% EXP)` : '');
}

export function trapCount(difficulty: string, mods: readonly DungeonMod[]): number {
  return (DATA.traps[difficulty] ?? 0) + mods.reduce((s, m) => s + (m.traps ?? 0), 0);
}

/**
 * Trap tiles: free floor ('.') inside the given rooms, at least 2 tiles from pillars, plates, doors, the start and
 * each other, and never in the rows right behind a door (the way in stays safe). Deterministic for a seed.
 */
export function placeTraps(rows: readonly string[], rooms: readonly [number, number, number, number][], count: number, seed: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  const rng = new Rng(seed);
  const ch = (x: number, y: number) => rows[y]?.[x] ?? '#';
  const cand: { x: number; y: number }[] = [];
  for (const [x0, y0, x1, y1] of rooms) {
    for (let y = y0 + 1; y <= y1 - 1; y++) for (let x = x0 + 1; x <= x1 - 1; x++) {
      if (ch(x, y) !== '.') continue;
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) if ('pPDQSEtkg'.includes(ch(x + dx, y + dy))) ok = false;
      if (ok) cand.push({ x, y });
    }
  }
  const out: { x: number; y: number }[] = [];
  while (out.length < count && cand.length) {
    const p = cand.splice(rng.int(0, cand.length - 1), 1)[0];
    if (out.every((q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) >= 2)) out.push(p);
  }
  return out;
}

/** Loot of the secret room's chest at a difficulty. */
export function secretLoot(difficulty: string): Record<string, number> {
  return { ...(DATA.secret[difficulty] ?? DATA.secret.normal) };
}
