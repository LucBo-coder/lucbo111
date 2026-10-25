import { addFriendship, expForLevel, levelForExp, MAX_LEVEL, OwnedPokemon } from './progression';

// EXP Candy + Rare Candy. Pure functions shared by AdventureState, the UI and the authoritative server.
// The client never adds EXP itself: it asks the host/server, which validates the inventory and returns the
// authoritative result. `applyCandy` below is the one implementation both sides use.

export type CandyKind = 'exp' | 'rare';

export interface CandyDef {
  id: string;
  name: string;
  kind: CandyKind;
  /** EXP granted by one candy (exp candy only) */
  exp?: number;
  desc: string;
  color: number;
}

export const CANDY_DEFS: readonly CandyDef[] = [
  { id: 'exp-candy-xs', name: 'Exp. Candy XS', kind: 'exp', exp: 100, desc: 'Cho Pokémon nhận 100 EXP.', color: 0x8fd8ff },
  { id: 'exp-candy-s', name: 'Exp. Candy S', kind: 'exp', exp: 800, desc: 'Cho Pokémon nhận 800 EXP.', color: 0x60c0ff },
  { id: 'exp-candy-m', name: 'Exp. Candy M', kind: 'exp', exp: 3_000, desc: 'Cho Pokémon nhận 3.000 EXP.', color: 0x8090ff },
  { id: 'exp-candy-l', name: 'Exp. Candy L', kind: 'exp', exp: 10_000, desc: 'Cho Pokémon nhận 10.000 EXP.', color: 0xc080ff },
  { id: 'exp-candy-xl', name: 'Exp. Candy XL', kind: 'exp', exp: 30_000, desc: 'Cho Pokémon nhận 30.000 EXP.', color: 0xff80e0 },
  { id: 'rare-candy', name: 'Rare Candy', kind: 'rare', desc: 'Tăng 1 cấp (không vượt Lv100).', color: 0xffd060 },
];

const BY_ID = new Map(CANDY_DEFS.map((c) => [c.id, c]));

export function candyDef(id: string): CandyDef | undefined {
  return BY_ID.get(id);
}

export function isCandy(id: string): boolean {
  return BY_ID.has(id);
}

export function expCandyDefs(): CandyDef[] {
  return CANDY_DEFS.filter((c) => c.kind === 'exp');
}

/** How many candies can still do something before the level cap (ignores the bag). */
export function maxUsefulCandy(p: OwnedPokemon, id: string): number {
  const def = candyDef(id);
  if (!def || p.level >= MAX_LEVEL) return 0;
  if (def.kind === 'rare') return MAX_LEVEL - p.level;
  const cap = expForLevel(p.species, MAX_LEVEL);
  const missing = Math.max(0, cap - p.exp);
  return Math.ceil(missing / Math.max(1, def.exp ?? 1));
}

export interface CandyOutcome {
  used: number;
  expGained: number;
  levels: number;
  beforeLevel: number;
  afterLevel: number;
  beforeExp: number;
  afterExp: number;
}

/**
 * Applies up to `qty` candies to a Pokémon.
 * - EXP is clamped at the Lv100 threshold (never overflows the data range),
 * - Rare Candy raises exactly one level per candy and keeps the EXP threshold consistent,
 * - friendship increases for every level gained,
 * - evolution is **not** applied here; the caller checks `pendingEvolutions` after the result.
 */
export function applyCandy(p: OwnedPokemon, id: string, qty: number): CandyOutcome {
  const def = candyDef(id);
  const beforeLevel = p.level;
  const beforeExp = p.exp;
  const requested = Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0));
  let used = 0;
  if (!def || requested <= 0 || p.level >= MAX_LEVEL) {
    return { used: 0, expGained: 0, levels: 0, beforeLevel, afterLevel: p.level, beforeExp, afterExp: p.exp };
  }

  if (def.kind === 'exp') {
    const cap = expForLevel(p.species, MAX_LEVEL);
    const missing = Math.max(0, cap - p.exp);
    if (missing <= 0) {
      return { used: 0, expGained: 0, levels: 0, beforeLevel, afterLevel: p.level, beforeExp, afterExp: p.exp };
    }
    used = Math.min(requested, Math.ceil(missing / Math.max(1, def.exp!)));
    p.exp = Math.min(cap, p.exp + used * def.exp!);
    p.level = levelForExp(p.species, p.exp);
  } else {
    used = Math.min(requested, MAX_LEVEL - p.level);
    for (let i = 0; i < used; i++) {
      if (p.level >= MAX_LEVEL) break;
      p.exp = Math.max(p.exp, expForLevel(p.species, p.level + 1));
      p.level++;
    }
  }

  const levels = p.level - beforeLevel;
  for (let i = 0; i < levels; i++) addFriendship(p, 'levelup');
  return {
    used,
    expGained: p.exp - beforeExp,
    levels,
    beforeLevel,
    afterLevel: p.level,
    beforeExp,
    afterExp: p.exp,
  };
}

/** Preview used by the candy dialog: apply to a copy, never touch the real Pokémon. */
export function previewCandy(p: OwnedPokemon, id: string, qty: number): CandyOutcome {
  return applyCandy({ ...p }, id, qty);
}
