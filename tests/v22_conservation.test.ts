import { describe, expect, it } from 'vitest';
import vnQuests from '../src/data/vietnam/quests.json';
import { CONSERVATION, ecoHealth, ecoTier, openSites, rareMult, siteFlag } from '../src/core/conservation';
import { REGIONS } from '../src/core/encounters';
import { rollRare } from '../src/core/ecologyRules';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';
import { Rng } from '../src/core/rng';
import type { QuestDef } from '../src/core/quests';
import { VN_PROVINCES } from '../src/adventure/passport';

describe('V22 conservation: data', () => {
  it('every province × 6 sites on dry ground at the water\'s edge, inside their area, spread apart', () => {
    expect(Object.keys(CONSERVATION).sort()).toEqual(VN_PROVINCES.filter((p) => REGION_DEFS[p.id]).map((p) => p.id).sort());
    for (const p of Object.values(CONSERVATION)) {
      const d = REGION_DEFS[p.id], m = new ValleyMap(d);
      const [x0, y0, x1, y1] = d.areas.find((a) => a.id === p.area)!.rect;
      expect(p.sites.length).toBe(6);
      for (const s of p.sites) {
        expect(m.solidAt(s.x, s.y), s.id).toBe(false);
        expect(m.terrainAt(s.x, s.y), s.id).not.toBe(T.Water);
        expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.terrainAt(s.x + dx, s.y + dy) === T.Water), `${s.id} by the water`).toBe(true);
        expect(s.x > x0 && s.x < x1 && s.y > y0 && s.y < y1, s.id).toBe(true);
        for (const o of p.sites) if (o !== s) expect(Math.hypot(o.x - s.x, o.y - s.y)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('each province has an epilogue quest after its story boss, counting its own sites', () => {
    const qs = vnQuests as unknown as QuestDef[];
    for (const p of Object.values(CONSERVATION)) {
      const q = qs.find((x) => x.requires?.includes(p.unlock) && x.objectives.some((o) => o.target === 'eco:' + p.id))!;
      expect(q, p.id).toBeTruthy();
      expect(q.objectives[0]).toMatchObject({ type: 'activate', target: 'eco:' + p.id, count: p.sites.length });
      expect(q.objectives[0].marker).toMatchObject({ x: p.sites[0].x, y: p.sites[0].y, region: p.id });
      expect(qs.find((x) => x.id === p.unlock)!.objectives.some((o) => o.type === 'boss' && o.target === p.boss)).toBe(true);
    }
  });
});

describe('V22 conservation: rules', () => {
  it('sites appear only after the province story, disappear once restored; health 15/site + 10 for the boss', () => {
    const flags = new Set<string>();
    const has = (f: string) => flags.has(f);
    let done = false;
    const open = () => openSites('ca-mau', { has, questDone: () => done });
    expect(open()).toEqual([]);
    done = true;
    expect(open().length).toBe(6);
    expect(ecoHealth('ca-mau', has)).toBe(0);
    flags.add('boss:seviper');
    expect(ecoHealth('ca-mau', has)).toBe(10);
    for (const s of CONSERVATION['ca-mau'].sites.slice(0, 2)) flags.add(siteFlag(s.id));
    expect(open().length).toBe(4);
    expect(ecoHealth('ca-mau', has)).toBe(40);
    expect(ecoTier(40)).toBe(1);
    for (const s of CONSERVATION['ca-mau'].sites) flags.add(siteFlag(s.id));
    expect(ecoHealth('ca-mau', has)).toBe(100);
    expect(ecoTier(100)).toBe(2);
    expect(ecoTier(79)).toBe(1);
    // provinces are independent; non-Vietnam maps are untouched
    expect(ecoHealth('can-tho', has)).toBe(0);
    expect(rareMult('ca-mau', has)).toBe(2);
    expect(rareMult('can-tho', has)).toBe(1);
    expect(rareMult('starter-valley', () => true)).toBe(1);
  });

  it('a healthy province doubles rare-condition chances', () => {
    const region = REGIONS.get('vn-cm-uminh')!;
    const ctx = { biome: 'forest' as const, night: true, weather: 'rain' as const };
    const count = (mult: number) => { const rng = new Rng(9); let n = 0; for (let i = 0; i < 6000; i++) if (rollRare(rng, ctx, region, { chanceMult: mult })) n++; return n; };
    const base = count(1), healed = count(2);
    expect(healed / base).toBeGreaterThan(1.7);
    expect(healed / base).toBeLessThan(2.3);
  });
});
