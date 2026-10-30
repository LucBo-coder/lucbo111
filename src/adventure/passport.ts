import { REGION_DEFS } from '../core/map/regionDefs';
import type { AdventureSave } from '../systems/saveSchema';
import provincesJson from '../data/vietnam/provinces.json';

// Journey Passport of the Vietnam Odyssey: one page per province, every number derived from the save
// (flags, chests, areas, quests, explored chunks) plus the first-visit stamp.

export interface ProvinceDef {
  id: string;
  name: string;
  /** story flags that open the road there */
  need: string[];
  hint: string;
  /** quest id prefix of the province (`vn-cm-` …) */
  questPrefix: string;
  badge: { flag: string; name: string } | null;
  landmarks: { flag: string; name: string }[];
}

// Playable provinces + the next ones on the route (shown locked), in the order of the journey
export const VN_PROVINCES = provincesJson as ProvinceDef[];

export interface Count { done: number; total: number }
export interface ProvincePage {
  def: ProvinceDef;
  playable: boolean;
  unlocked: boolean;
  visited: boolean;
  /** Date.now() of the first visit (0 = visited before stamps existed) */
  firstVisit: number;
  areas: Count;
  quests: Count;
  trainers: Count;
  chests: Count;
  waypoints: Count;
  puzzles: Count;
  rescues: Count;
  boss: { name: string; defeated: boolean } | null;
  badge: boolean;
  landmarks: { name: string; got: boolean }[];
  /** 0..100: share of everything above that is done */
  completion: number;
}

const count = (ids: string[], done: (id: string) => boolean): Count => ({ done: ids.filter(done).length, total: ids.length });

export function passportPages(adv: AdventureSave, questIds: string[]): ProvincePage[] {
  const flags = new Set(adv.flags);
  const has = (f: string) => flags.has(f);
  return VN_PROVINCES.map((def) => {
    const r = REGION_DEFS[def.id];
    const visited = def.id === adv.region || (adv.discoveredBy?.[def.id]?.length ?? 0) > 0 || adv.visited?.[def.id] !== undefined;
    const pageQuests = questIds.filter((q) => q.startsWith(def.questPrefix));
    const page: ProvincePage = {
      def, playable: !!r, unlocked: def.need.every(has), visited, firstVisit: adv.visited?.[def.id] ?? 0,
      areas: count(r?.areas.map((a) => a.id) ?? [], (id) => adv.areas.includes(id)),
      quests: count(pageQuests, (id) => adv.quests[id]?.status === 'completed'),
      trainers: count(r?.trainers?.map((t) => t.id) ?? [], (id) => has('beat:' + id)),
      chests: count(r?.chests?.map((c) => c.id) ?? [], (id) => adv.chests.includes(id)),
      waypoints: count(r?.waypoints.map((w) => w.id) ?? [], (id) => adv.waypoints.includes(id)),
      puzzles: count((r?.puzzles ?? []).map((p) => p.id), (id) => has('puzzle:' + id)),
      rescues: count((r?.rescue ? [r.rescue] : []).map((x) => x.id), (id) => has('rescued:' + id)),
      boss: r?.worldBoss ? { name: r.worldBoss.name, defeated: has('boss:' + r.worldBoss.id) } : null,
      badge: !!def.badge && has(def.badge.flag),
      landmarks: def.landmarks.map((l) => ({ name: l.name, got: has(l.flag) })),
      completion: 0,
    };
    const parts = [page.areas, page.quests, page.trainers, page.chests, page.waypoints, page.puzzles, page.rescues,
      ...(page.boss ? [{ done: page.boss.defeated ? 1 : 0, total: 1 }] : []), ...page.landmarks.map((l) => ({ done: l.got ? 1 : 0, total: 1 }))];
    const total = parts.reduce((s, p) => s + p.total, 0);
    page.completion = total ? Math.round((parts.reduce((s, p) => s + p.done, 0) / total) * 100) : 0;
    return page;
  });
}

/** Stamps the first visit of a province (no-op for classic maps and repeat visits). */
export function stampVisit(adv: AdventureSave, region: string, now = Date.now()): boolean {
  if (!VN_PROVINCES.some((p) => p.id === region)) return false;
  adv.visited ??= {};
  if (adv.visited[region] !== undefined) return false;
  adv.visited[region] = now;
  return true;
}
