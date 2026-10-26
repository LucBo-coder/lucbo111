// Per-region (province) reputation. Pure: works on the campaign's own AdventureSave, so classic Adventure and
// Vietnam Odyssey never share points. The old single `reputation` number stays as the campaign total.
import repJson from '../data/world/reputation.json';

export interface RepTier { at: number; name: string }
export interface RepRegion {
  name: string;
  /** one-time gift per tier index (1-based: tiers[0] is the starting rank) */
  rewards?: Record<string, Record<string, number>>;
  /** NPC greeting per tier index */
  greet?: Record<string, string>;
}

export const REP_TIERS: RepTier[] = repJson.tiers;
export const REP_REGIONS: Record<string, RepRegion> = repJson.regions as Record<string, RepRegion>;

export interface RepSave { reputation: number; repBy?: Record<string, number>; flags: string[] }

/** Tier index (0 = Người lạ) for a point total. */
export function repTier(points: number): number {
  let t = 0;
  REP_TIERS.forEach((tier, i) => { if (points >= tier.at) t = i; });
  return t;
}

export function regionRep(s: RepSave, region: string): number {
  return s.repBy?.[region] ?? 0;
}

/** Flag set once a region reaches a tier: `rep:<region>:<tier>` (quests / shops gate on it). */
export const repFlag = (region: string, tier: number) => `rep:${region}:${tier}`;

export interface RepGain { region: string; points: number; tier: number; newTiers: number[] }

/**
 * Adds reputation to a region (and the campaign total). Returns the tiers reached for the first time; their flags
 * are set here, so a reload or a second grant can never hand the same milestone out twice.
 */
export function addRep(s: RepSave, region: string, n: number): RepGain {
  s.reputation += n;
  const repBy = (s.repBy ??= {});
  repBy[region] = Math.max(0, (repBy[region] ?? 0) + n);
  const points = repBy[region], tier = repTier(points), newTiers: number[] = [];
  for (let i = 1; i <= tier; i++) {
    const f = repFlag(region, i);
    if (!s.flags.includes(f)) { s.flags.push(f); newTiers.push(i); }
  }
  return { region, points, tier, newTiers };
}

/** Points still needed for the next tier (null at the top). */
export function nextTierIn(points: number): number | null {
  const next = REP_TIERS.find((t) => t.at > points);
  return next ? next.at - points : null;
}

export function tierReward(region: string, tier: number): Record<string, number> | undefined {
  return REP_REGIONS[region]?.rewards?.[String(tier)];
}

/** NPC line that reacts to how well the player is known here (null = no special line). */
export function repGreeting(region: string, points: number): string | null {
  const g = REP_REGIONS[region]?.greet;
  if (!g) return null;
  for (let t = repTier(points); t >= 0; t--) if (g[String(t)]) return g[String(t)];
  return null;
}
