// Permanent Upgrades (Survivor meta-progression): bought in the menu with the coins earned by runs,
// stored per save slot in `SaveData.permanentUpgrades`, applied to the run's Mods when a Survivor run starts.
// Each level is small (a run's level-up cards stay the main source of power).

import type { Mods } from './upgrades';

export interface PermUpgrade {
  id: string;
  name: string;
  description: string;
  stat: keyof Mods;
  /** bonus per level (same unit as the run's stat cards) */
  per: number;
  max: number;
  /** cost of each level, in coins */
  costs: number[];
}

export const PERM_UPGRADES: PermUpgrade[] = [
  { id: 'power', name: 'Sức mạnh', description: '+3% sát thương mỗi cấp', stat: 'dmgMult', per: 0.03, max: 5, costs: [120, 240, 400, 600, 900] },
  { id: 'vitality', name: 'Sinh lực', description: '+4% máu (đội & HLV) mỗi cấp', stat: 'hpMult', per: 0.04, max: 5, costs: [120, 240, 400, 600, 900] },
  { id: 'haste', name: 'Tập trung', description: '−2% hồi chiêu mỗi cấp', stat: 'cdr', per: 0.02, max: 5, costs: [150, 300, 500, 750, 1100] },
  { id: 'swift', name: 'Nhanh nhẹn', description: '+3% tốc chạy HLV mỗi cấp', stat: 'trainerSpeed', per: 0.03, max: 5, costs: [80, 160, 260, 400, 600] },
  { id: 'magnet', name: 'Nam châm', description: '+10% tầm hút EXP mỗi cấp', stat: 'magnet', per: 0.1, max: 5, costs: [80, 160, 260, 400, 600] },
  { id: 'focus', name: 'Chí mạng', description: '+1% tỉ lệ chí mạng mỗi cấp', stat: 'critBonus', per: 0.01, max: 5, costs: [150, 300, 500, 750, 1100] },
];

export function upgradeLevel(levels: Record<string, number>, id: string): number {
  const u = PERM_UPGRADES.find((x) => x.id === id);
  return u ? Math.max(0, Math.min(u.max, Math.floor(levels[id] ?? 0))) : 0;
}

/** Cost of the next level, or null at max level / unknown id. */
export function nextCost(levels: Record<string, number>, id: string): number | null {
  const u = PERM_UPGRADES.find((x) => x.id === id);
  if (!u) return null;
  const lv = upgradeLevel(levels, id);
  return lv >= u.max ? null : u.costs[lv];
}

/** Buys one level if affordable: mutates `save.permanentUpgrades` and the Survivor wallet (`save.survivorCoins`, ngọc). */
export function buyUpgrade(save: { survivorCoins: number; permanentUpgrades: Record<string, number> }, id: string): boolean {
  const cost = nextCost(save.permanentUpgrades, id);
  if (cost == null || save.survivorCoins < cost) return false;
  save.survivorCoins -= cost;
  save.permanentUpgrades[id] = upgradeLevel(save.permanentUpgrades, id) + 1;
  return true;
}

/** Adds the bought levels to a run's Mods (levels are clamped, unknown ids ignored). */
export function applyPermanent(mods: Mods, levels: Record<string, number> | undefined): Mods {
  if (!levels) return mods;
  for (const u of PERM_UPGRADES) mods[u.stat] += u.per * upgradeLevel(levels, u.id);
  return mods;
}
