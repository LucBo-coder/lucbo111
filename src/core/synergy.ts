// Survivor: party Synergy and Elemental Combos (pure rules — World applies them in Survivor runs only,
// so the Adventure balance is untouched).
//
// Synergy — counted once per Pokémon type in the party:
//   2 Pokémon sharing a type → +10 % damage for skills of that type, 3+ → +20 %;
//   5+ different types in the party ("đa hệ") → +5 % damage for every skill.
// Elemental Combo — a hit of the right type on a target carrying a status sets it off (≤ once per 2 s per target):
//   Hơi Nước  water  on burn       ×1.5, cures the burn, 50 % splash (r 80)
//   Vỡ Băng   rock / fighting / steel / ground on freeze  ×2, shatters the ice
//   Quá Tải   electric on paralysis / stun  chains to 2 nearby enemies at 50 %
//   Cháy Lan  fire on leech seed  cures the seed, 60 % splash (r 90)
//   Kịch Độc  poison on poison / toxic  ×1.3

import type { PokeType, StatusKind } from './types';

export interface SynergyState {
  byType: Partial<Record<PokeType, number>>;
  all: number;
  lines: string[];
}

export const TYPE_VI: Record<PokeType, string> = {
  normal: 'Thường', fire: 'Lửa', water: 'Nước', grass: 'Cỏ', electric: 'Điện', ice: 'Băng', fighting: 'Giác đấu', poison: 'Độc', ground: 'Đất',
  flying: 'Bay', psychic: 'Siêu linh', bug: 'Bọ', rock: 'Đá', ghost: 'Ma', dragon: 'Rồng', dark: 'Bóng tối', steel: 'Thép', fairy: 'Tiên',
};

export function partySynergy(party: readonly (readonly PokeType[])[]): SynergyState {
  const count = new Map<PokeType, number>();
  for (const types of party) for (const t of new Set(types)) count.set(t, (count.get(t) ?? 0) + 1);
  const byType: Partial<Record<PokeType, number>> = {};
  const lines: string[] = [];
  for (const [t, n] of [...count].sort((a, b) => b[1] - a[1])) {
    if (n < 2) continue;
    byType[t] = n >= 3 ? 0.2 : 0.1;
    lines.push(`${TYPE_VI[t]} ×${n} (+${n >= 3 ? 20 : 10}%)`);
  }
  const all = count.size >= 5 ? 0.05 : 0;
  if (all) lines.push(`Đa hệ ×${count.size} (+5%)`);
  return { byType, all, lines };
}

export interface ComboDef {
  id: string;
  name: string;
  hit: PokeType[];
  on: StatusKind[];
  mult: number;
  /** status removed by the combo */
  cures?: StatusKind;
  splash?: { r: number; mult: number };
  chain?: { n: number; r: number; mult: number };
}

export const COMBOS: ComboDef[] = [
  { id: 'steam', name: 'Hơi Nước', hit: ['water'], on: ['burn'], mult: 1.5, cures: 'burn', splash: { r: 80, mult: 0.5 } },
  { id: 'shatter', name: 'Vỡ Băng', hit: ['rock', 'fighting', 'steel', 'ground'], on: ['freeze'], mult: 2, cures: 'freeze' },
  { id: 'overload', name: 'Quá Tải', hit: ['electric'], on: ['paralysis', 'stun'], mult: 1.2, chain: { n: 2, r: 170, mult: 0.5 } },
  { id: 'wildfire', name: 'Cháy Lan', hit: ['fire'], on: ['leech'], mult: 1.3, cures: 'leech', splash: { r: 90, mult: 0.6 } },
  { id: 'toxic', name: 'Kịch Độc', hit: ['poison'], on: ['poison', 'badPoison'], mult: 1.3 },
];

export const COMBO_COOLDOWN = 2; // s per target

/** The combo a hit of `type` sets off on a target with these statuses, if any. */
export function findCombo(type: PokeType, statuses: readonly StatusKind[]): ComboDef | null {
  for (const c of COMBOS) if (c.hit.includes(type) && c.on.some((k) => statuses.includes(k))) return c;
  return null;
}
