import { describe, expect, it } from 'vitest';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap, type RegionDef } from '../src/core/map/valley';
import { LEGENDS } from '../src/core/legends';
import { POKEMON } from '../src/core/data';
import { ITEMS } from '../src/adventure/AdventureState';
import { REGIONS } from '../src/core/encounters';

// Region maps: legendary shrines spread by theme and unlock order, and every authored object (NPC, trainer, chest,
// sign, prop, waypoint, portal) stands on open ground that the player can reach.

const ADVENTURE = ['starter-valley', 'frozen-mountains', 'volcanic-lands', 'misty-swamp', 'coral-coast', 'legendary-sanctuary'];
const VIETNAM = ['ca-mau', 'an-giang', 'can-tho'];

const maps = new Map<string, ValleyMap>();
const mapOf = (id: string) => { let m = maps.get(id); if (!m) maps.set(id, (m = new ValleyMap(REGION_DEFS[id]))); return m; };
/** open ground in a disc of radius r around (x, y) */
const open = (m: ValleyMap, x: number, y: number, r: number) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && m.solidAt(Math.round(x) + dx, Math.round(y) + dy)) return false;
  return true;
};
/** nearest spot with open ground (printed when a test fails, to move the object there) */
const nearest = (m: ValleyMap, x: number, y: number, r: number) => {
  for (let d = 1; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    if (open(m, x + dx, y + dy, r)) return [Math.round(x) + dx, Math.round(y) + dy];
  }
  return null;
};

function objects(d: RegionDef): { key: string; x: number; y: number }[] {
  return [
    ...d.npcs.map((o) => ({ key: o.id, x: o.x, y: o.y })), ...d.trainers.map((o) => ({ key: o.id, x: o.x, y: o.y })),
    ...d.chests.map((o) => ({ key: o.id, x: o.x, y: o.y })), ...d.waypoints.map((o) => ({ key: o.id, x: o.x, y: o.y })),
    ...d.signs.map((o, i) => ({ key: `sign#${i}`, x: o.x, y: o.y })), ...d.props.map((o, i) => ({ key: `prop#${i}`, x: o.x, y: o.y })),
    ...(d.portals ?? []).map((o) => ({ key: o.id, x: o.x, y: o.y })),
  ];
}

describe('legendary shrines across the region maps', () => {
  it('no map holds most of them; each themed region has its own', () => {
    const per = ADVENTURE.map((id) => (REGION_DEFS[id].legendaries ?? []).length);
    expect(Math.max(...per)).toBeLessThanOrEqual(8);
    for (const id of ADVENTURE.slice(1)) expect((REGION_DEFS[id].legendaries ?? []).length, id).toBeGreaterThanOrEqual(3);
    expect(VIETNAM.every((id) => !(REGION_DEFS[id].legendaries ?? []).length)).toBe(true);
  });
  it('themes: ice on the mountain, fire in the volcano, sea legends on the coast, creation trio in the sanctuary', () => {
    const where = (id: string) => ADVENTURE.find((m) => (REGION_DEFS[m].legendaries ?? []).some((l) => l.id === id));
    // V22 shrines (LEGENDARY_SHRINES.md): Rayquaza on the highest peak, the Regi tombs spread over three maps,
    // Ho-Oh's bell tower and Celebi's grove in Emerald Woods
    for (const id of ['articuno', 'regice', 'rayquaza', 'jirachi']) expect(where(id), id).toBe('frozen-mountains');
    for (const id of ['groudon', 'heatran', 'moltres', 'shaymin']) expect(where(id), id).toBe('volcanic-lands');
    for (const id of ['lugia', 'kyogre', 'zapdos', 'regirock']) expect(where(id), id).toBe('coral-coast');
    for (const id of ['darkrai', 'giratina', 'azelf', 'registeel']) expect(where(id), id).toBe('misty-swamp');
    for (const id of ['arceus', 'dialga', 'palkia', 'deoxys', 'uxie', 'regigigas']) expect(where(id), id).toBe('legendary-sanctuary');
    for (const id of ['mewtwo', 'mew']) expect(where(id), id).toBe('starter-valley');
  });
  it('every site is on one map only, its quest marker points there, and the ring stands on open ground', () => {
    const bad: string[] = [];
    const seen = new Set<string>();
    for (const id of ADVENTURE) {
      const m = mapOf(id);
      for (const l of REGION_DEFS[id].legendaries ?? []) {
        expect(seen.has(l.id), l.id).toBe(false);
        seen.add(l.id);
        const site = LEGENDS.get(l.id)!.site;
        if (site) expect({ x: site.x, y: site.y, region: site.region ?? 'starter-valley' }, l.id).toEqual({ x: l.x, y: l.y, region: id });
        // designed shrines are checked by tests/v22_shrines.test.ts (their arena allows the altar / cover)
        if (l.ring !== false && !l.shrine && !open(m, l.x, l.y, 5)) bad.push(`${id} ${l.id} → ${JSON.stringify(nearest(m, l.x, l.y, 5))}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('roaming legendaries also wander the themed regions', () => {
    for (const [id, region] of [['entei', 'volcanic-lands'], ['suicune', 'frozen-mountains'], ['cresselia', 'misty-swamp']]) {
      expect(LEGENDS.get(id)!.regions, id).toContain(region);
      expect(REGIONS.has(region)).toBe(true);
    }
  });
});

describe('map content', () => {
  it('authored objects stand on reachable open ground and do not overlap', () => {
    const bad: string[] = [];
    for (const id of [...ADVENTURE, ...VIETNAM]) {
      const d = REGION_DEFS[id], m = mapOf(id);
      const objs = objects(d);
      for (const o of objs) {
        if (!open(m, o.x, o.y, 1)) bad.push(`${id} ${o.key} → ${JSON.stringify(nearest(m, o.x, o.y, 1))}`);
        for (const l of d.legendaries ?? []) if (Math.hypot(o.x - l.x, o.y - l.y) < 8.5 && !o.key.startsWith('chest-') && !o.key.startsWith('sign#')) bad.push(`${id} ${o.key} inside the ${l.id} ring`);
      }
      for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++) {
        if (Math.hypot(objs[i].x - objs[j].x, objs[i].y - objs[j].y) < 1.5) bad.push(`${id} ${objs[i].key} overlaps ${objs[j].key}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('the themed regions are no longer empty: NPCs, trainers, signs and a second rest point', () => {
    for (const id of ['frozen-mountains', 'volcanic-lands', 'misty-swamp', 'coral-coast']) {
      const d = REGION_DEFS[id];
      expect(d.npcs.length, id).toBeGreaterThanOrEqual(3);
      expect(d.trainers.length, id).toBeGreaterThanOrEqual(2);
      expect(d.signs.length, id).toBeGreaterThanOrEqual(3);
      expect(d.waypoints.length, id).toBeGreaterThanOrEqual(2);
    }
    for (const id of VIETNAM) expect(REGION_DEFS[id].trainers.length, id).toBeGreaterThanOrEqual(5);
  });
  it('trainer teams use real species near the region level; rewards are real items; trainer ids unique', () => {
    const ids = new Set<string>();
    for (const id of [...ADVENTURE, ...VIETNAM]) {
      const d = REGION_DEFS[id];
      const lo = Math.min(...d.areas.map((a) => a.level[0])), hi = Math.max(...d.areas.map((a) => a.level[1]));
      for (const t of d.trainers) {
        expect(ids.has(t.id), t.id).toBe(false);
        ids.add(t.id);
        for (const [sp, lv] of t.team) {
          expect(POKEMON.has(sp), `${t.id} ${sp}`).toBe(true);
          expect(lv, `${t.id} ${sp}`).toBeGreaterThanOrEqual(lo - 3);
          expect(lv, `${t.id} ${sp}`).toBeLessThanOrEqual(hi + 6);
        }
        for (const it of Object.keys(t.rewards.items ?? {})) expect(it in ITEMS, `${t.id} ${it}`).toBe(true);
      }
      for (const c of d.chests) for (const it of Object.keys(c.items)) expect(it in ITEMS, `${c.id} ${it}`).toBe(true);
      // NPC ids only need to be unique on their map (every shop is `shopkeeper`)
      expect(new Set(d.npcs.map((n) => n.id)).size, id).toBe(d.npcs.length);
    }
  });
});
