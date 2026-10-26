import consJson from '../data/vietnam/conservation.json';

// Conservation (pure, Vietnam Odyssey): after a province's guardian is beaten, its land needs healing — mangrove
// saplings in Cà Mau, ghost nets in An Giang's flooded fields, trash on the Hậu river banks in Cần Thơ.
// Each restored site is a flag (`eco:<site>`), so progress lives in the campaign save. A province's ecosystem
// health (0–100) = 15 per site + 10 once its story boss is down. Health makes rare-condition Pokémon more likely
// there (up to ×2) and pays a one-time gift at "Trù phú" (flag `eco:<province>:thriving`).

export interface ConsSite { id: string; x: number; y: number }
export interface ConsProvince {
  id: string; name: string; area: string; action: 'plant' | 'net' | 'trash'; unlock: string; boss: string;
  label: string; done: string; thrivingReward: Record<string, number>; sites: ConsSite[];
}
interface ConsData { tiers: { at: number; name: string }[]; perSite: number; bossBonus: number; provinces: Record<string, ConsProvince> }
const DATA = consJson as unknown as ConsData;

export const CONSERVATION = DATA.provinces;
export const ECO_TIERS = DATA.tiers;
export const siteFlag = (id: string) => `eco:${id}`;
export const thrivingFlag = (province: string) => `eco:${province}:thriving`;

export function sitesDone(province: string, has: (f: string) => boolean): number {
  return (CONSERVATION[province]?.sites ?? []).filter((s) => has(siteFlag(s.id))).length;
}

export function ecoHealth(province: string, has: (f: string) => boolean): number {
  const p = CONSERVATION[province];
  if (!p) return 0;
  return Math.min(100, sitesDone(province, has) * DATA.perSite + (has('boss:' + p.boss) ? DATA.bossBonus : 0));
}

export function ecoTier(health: number): number {
  let t = 0;
  ECO_TIERS.forEach((x, i) => { if (health >= x.at) t = i; });
  return t;
}

/** Multiplier on rare-condition spawn chances in a province: 1 at health 0, 2 at 100 (1 outside Vietnam). */
export function rareMult(province: string, has: (f: string) => boolean): number {
  return CONSERVATION[province] ? 1 + ecoHealth(province, has) / 100 : 1;
}

/** Sites still to restore, shown once the province's story quest is complete. */
export function openSites(province: string, o: { has: (f: string) => boolean; questDone: (id: string) => boolean }): ConsSite[] {
  const p = CONSERVATION[province];
  if (!p || !o.questDone(p.unlock)) return [];
  return p.sites.filter((s) => !o.has(siteFlag(s.id)));
}
