import { REGION_DEFS } from './map/regionDefs';
import type { QuestDef } from './quests';
import { nextTierIn, regionRep, REP_REGIONS, REP_TIERS, repTier, tierReward, type RepSave } from './reputation';

// Journal helpers (pure): which quests belong to a map (filter "Vùng này") and the reputation board rows.

const NPC_REGION = new Map<string, string>();
for (const [id, d] of Object.entries(REGION_DEFS)) for (const n of [...d.npcs, ...d.trainers]) if (!NPC_REGION.has(n.id)) NPC_REGION.set(n.id, id);

/** A quest belongs to a map if its giver lives there or any objective points there (markers default to the valley). */
export function questInRegion(q: QuestDef, region: string): boolean {
  if (q.giver && NPC_REGION.get(q.giver) === region) return true;
  return q.objectives.some((o) => o.marker && (o.marker.region ?? 'starter-valley') === region);
}

export interface RepRow {
  region: string;
  name: string;
  points: number;
  tier: number;
  tierName: string;
  /** 0..1 progress inside the current tier (1 at the top tier) */
  progress: number;
  /** points still needed (null at the top) */
  toNext: number | null;
  nextName: string | null;
  nextReward: Record<string, number> | null;
}

export function repRow(s: RepSave, region: string): RepRow {
  const points = regionRep(s, region), tier = repTier(points), toNext = nextTierIn(points);
  const lo = REP_TIERS[tier].at, hi = REP_TIERS[tier + 1]?.at;
  return {
    region, name: REP_REGIONS[region]?.name ?? region, points, tier, tierName: REP_TIERS[tier].name,
    progress: hi == null ? 1 : (points - lo) / (hi - lo), toNext,
    nextName: REP_TIERS[tier + 1]?.name ?? null, nextReward: hi == null ? null : tierReward(region, tier + 1) ?? null,
  };
}

/** Board rows for the regions of one campaign that keep a reputation table. */
export function repBoard(s: RepSave, regions: readonly string[]): RepRow[] {
  return regions.filter((r) => REP_REGIONS[r]).map((r) => repRow(s, r));
}
