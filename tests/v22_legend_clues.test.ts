import { describe, expect, it } from 'vitest';
import { clueFlag, cluesFound, conditionSummary, investigated, LEGEND_CLUES, visibleClues } from '../src/core/legendClues';
import { LEGENDS } from '../src/core/legends';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';

const maps = new Map<string, ValleyMap>();
const mapOf = (id: string) => { if (!maps.has(id)) maps.set(id, new ValleyMap(REGION_DEFS[id])); return maps.get(id)!; };

function reachable(m: ValleyMap, sx: number, sy: number): Set<number> {
  const W = m.widthTiles, seen = new Set([sy * W + sx]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= m.heightTiles || seen.has(k) || m.solidAt(nx, ny) || m.terrainAt(nx, ny) === T.Water) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

describe('V22 legendary investigation: data', () => {
  it('13 investigated legends × 3 clues, unique ids, every legend real and never a gift/egg', () => {
    expect(LEGEND_CLUES.size).toBe(13);
    const ids = [...LEGEND_CLUES.values()].flat().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [legend, clues] of LEGEND_CLUES) {
      const l = LEGENDS.get(legend)!;
      expect(l, legend).toBeTruthy();
      expect(['shrine', 'roaming']).toContain(l.kind);
      expect(clues.length).toBe(3);
      for (const c of clues) expect(c.text.length, c.id).toBeGreaterThan(30);
      // shrine clues lie on the shrine's map; roamers' on the maps of their regions
      // a legend in its own plane (Kyogre): the clues lie on the map with the plane's gate
      const map = l.site?.region ?? 'starter-valley', gate = REGION_DEFS[map]?.void ? REGION_DEFS[map].portals![0].to : map;
      if (l.kind === 'shrine') for (const c of clues) expect(c.region).toBe(gate);
    }
  });

  it('every clue is on dry, open ground the player can walk to from the map spawn', () => {
    const reach = new Map<string, Set<number>>();
    for (const c of [...LEGEND_CLUES.values()].flat()) {
      const m = mapOf(c.region), d = REGION_DEFS[c.region];
      if (!reach.has(c.region)) reach.set(c.region, reachable(m, d.spawn.x, d.spawn.y));
      expect(m.solidAt(c.x, c.y), c.id).toBe(false);
      expect(m.terrainAt(c.x, c.y), c.id).not.toBe(T.Water);
      expect(reach.get(c.region)!.has(c.y * m.widthTiles + c.x), `${c.id} reachable`).toBe(true);
      // not on top of another object
      const objs = [...d.npcs, ...d.chests, ...d.signs, ...d.waypoints, ...d.trainers];
      expect(objs.some((o) => o.x === c.x && o.y === c.y), c.id).toBe(false);
    }
  });
});

describe('V22 legendary investigation: rules', () => {
  it('clues show only for unlocked, uncaught legends and disappear once found; three found completes it', () => {
    const flags = new Set<string>();
    const has = (f: string) => flags.has(f);
    const caught = new Set<string>();
    const vis = () => visibleClues('coral-coast', { hasFlag: has, caught: (l) => caught.has(l) }).filter((c) => c.legend === 'lugia');
    // Lugia needs the three birds
    expect(vis()).toEqual([]);
    for (const f of LEGENDS.get('lugia')!.requires) flags.add(f);
    expect(vis().length).toBe(3);
    flags.add(clueFlag('lugia-1'));
    expect(vis().map((c) => c.id)).toEqual(['lugia-2', 'lugia-3']);
    expect(cluesFound('lugia', has)).toBe(1);
    expect(investigated('lugia', has)).toBe(false);
    flags.add(clueFlag('lugia-2')); flags.add(clueFlag('lugia-3'));
    expect(investigated('lugia', has)).toBe(true);
    expect(vis()).toEqual([]);
    // a caught legend leaves no clues behind
    flags.delete(clueFlag('lugia-3'));
    caught.add('lugia');
    expect(vis()).toEqual([]);
    // legends without an investigation never count as investigated
    expect(investigated('mew', () => true)).toBe(false);
  });

  it('condition summary reveals time, weather and friendship', () => {
    expect(conditionSummary(LEGENDS.get('lugia')!)).toBe('khi mưa / mưa xối xả / giông sét');
    expect(conditionSummary(LEGENDS.get('giratina')!)).toBe('ban đêm');
    expect(conditionSummary(LEGENDS.get('raikou')!)).toContain('giông sét');
    expect(conditionSummary({})).toContain('bất cứ lúc nào');
  });
});
