import { describe, expect, it } from 'vitest';
import { ECOLOGY, REGIONS, regionOfArea, rollEncounter } from '../src/core/encounters';
import { regionDef } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { Rng } from '../src/core/rng';
import {
  GIANTS_AFTER, riftCandidates, ULTRA_BEASTS, ULTRA_SPACE, ULTRA_SPACE_SITES, wormholeCandidates, wormholeHint,
} from '../src/core/ultraWormhole';

// Không Gian Ultra (data/world/ultra-space.json): the dimension beyond the Ultra Wormholes — nine worlds, each with its
// own Ultra Beast and its own wild Pokémon, Necrozma at the heart; small rifts there bring the Gen 5–9 legends.

const def = regionDef(ULTRA_SPACE);

describe('Ultra Space', () => {
  it('is a map of nine worlds, each its own wild region with its own species list', () => {
    expect(def.id).toBe(ULTRA_SPACE);
    expect(def.areas).toHaveLength(9);
    for (const a of def.areas) {
      const r = regionOfArea(a.id)!;
      expect(r, a.id).toBeTruthy();
      expect(r.species?.length, a.id).toBeGreaterThanOrEqual(8);
      for (const id of r.species!) {
        const e = ECOLOGY.get(id)!;
        expect(e, `${a.id}:${id}`).toBeTruthy();
        expect(e.method, `${a.id}:${id}`).toBe('wild');
        expect(e.minLevel, `${a.id}:${id}`).toBeLessThanOrEqual(r.level[1]);
      }
    }
  });

  it('wild Pokémon there come only from the world’s own list, at its levels', () => {
    const rng = new Rng(11);
    for (const a of def.areas) {
      const r = REGIONS.get(regionOfArea(a.id)!.id)!;
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) for (const night of [false, true]) {
        const roll = rollEncounter(rng, { biome: r.biome, night, weather: 'clear' }, r);
        if (!roll) continue;
        expect(r.species, `${r.id}:${roll.species}`).toContain(roll.species);
        expect(roll.level).toBeGreaterThanOrEqual(r.level[0]);
        seen.add(roll.species);
      }
      expect(seen.size, r.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('every Ultra Beast but Naganadel lives at a site of its own; Necrozma waits for three of them', () => {
    for (const id of ULTRA_BEASTS) if (id !== 'naganadel') expect(ULTRA_SPACE_SITES.has(id), id).toBe(true);
    const nec = def.legendaries!.find((l) => l.id === 'necrozma')!;
    expect(nec.requires).toEqual(['boss:nihilego', 'boss:xurkitree', 'boss:guzzlord']);
    expect(wormholeHint('nihilego')).toContain('Không Gian Ultra — Biển Sâu Ultra');
    expect(wormholeHint('zekrom')).toContain('Vết nứt');
  });

  it('every site, the way home and the chests can be walked to from where the trainer arrives', () => {
    const m = new ValleyMap(def);
    const W = m.widthTiles, seen = new Uint8Array(W * m.heightTiles);
    const q: number[] = [def.spawn.x + def.spawn.y * W];
    expect(m.solidAt(def.spawn.x, def.spawn.y)).toBe(false);
    seen[q[0]] = 1;
    while (q.length) {
      const k = q.pop()!, x = k % W, y = (k - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, nk = nx + ny * W;
        if (nx < 0 || ny < 0 || nx >= W || ny >= m.heightTiles || seen[nk] || m.solidAt(nx, ny)) continue;
        seen[nk] = 1;
        q.push(nk);
      }
    }
    const near = (x: number, y: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (seen[x + dx + (y + dy) * W]) return true;
      return false;
    };
    for (const l of def.legendaries!) expect(near(l.x, l.y, 2), l.id).toBe(true);
    for (const p of def.portals ?? []) expect(near(p.x, p.y, 1), p.id).toBe(true);
    for (const c of def.chests) expect(near(c.x, c.y, 1), c.id).toBe(true);
  });

  it('rifts there bring the Gen 5–9 legends, never Ultra Space’s own residents', () => {
    const all = wormholeCandidates(() => false, GIANTS_AFTER), rift = riftCandidates(() => false, GIANTS_AFTER);
    expect(rift.length).toBeGreaterThan(40);
    for (const id of ULTRA_SPACE_SITES.keys()) expect(rift, id).not.toContain(id);
    expect(rift).toContain('naganadel');
    expect(rift).toContain('zekrom');
    expect(all.length - rift.length).toBe(ULTRA_SPACE_SITES.size);
  });
});
