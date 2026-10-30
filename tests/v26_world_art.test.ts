import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chunkCols, chunkRows, type MapObject } from '../src/core/map/mapProvider';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { AA_ART, AA_DIR, T, worldArtKey } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';

// Adventure Awaits (CC0) cottages and old trees: where they appear, and that their footprints still play like houses /
// trees (solid, door in reach, nothing blocked).

function objects(map: ValleyMap): MapObject[] {
  const out: MapObject[] = [];
  for (let cy = 0; cy < chunkRows(map); cy++) for (let cx = 0; cx < chunkCols(map); cx++) out.push(...map.objectsInChunk(cx, cy));
  return out;
}

describe('world art (Adventure Awaits)', () => {
  it('every image file is bundled', () => {
    for (const a of Object.values(AA_ART)) expect(existsSync('public/' + AA_DIR + a.file), a.file).toBe(true);
  });

  it('cottages: image key, a 3-wide solid footprint, the door in the middle column, the tile grid kept as fallback', () => {
    const cases: [string, string, string][] = [['ben-tre', 'bt-house-1', 'aa-house-red'], ['ben-tre', 'bt-house-2', 'aa-house-blue'], ['starter-valley', 'elder-hut', 'aa-house-brown']];
    for (const [region, id, key] of cases) {
      const map = new ValleyMap(REGION_DEFS[region]);
      const o = objects(map).find((x) => x.id === id)!;
      expect(worldArtKey(o), id).toBe(key);
      expect(o.w, id).toBe(3);
      expect(o.data!.doorX, id).toBe(o.x + 1);
      expect(o.tiles!.length, id).toBe(o.h);
      for (let y = o.y; y < o.y + o.h!; y++) for (let x = o.x; x < o.x + 3; x++) expect(map.solidAt(x, y), `${id} ${x},${y}`).toBe(true);
      // the tile in front of the door is open ground
      expect(map.solidAt(o.x + 1, o.y + o.h!), id).toBe(false);
    }
  });

  it('old trees grow only on open lawn: two free tiles around, valley / Mekong meadows, none in the mangroves', () => {
    const count: Record<string, number> = {};
    for (const id of ['starter-valley', 'ben-tre', 'can-tho', 'ca-mau', 'frozen-mountains']) {
      const map = new ValleyMap(REGION_DEFS[id]);
      const big = objects(map).filter((o) => o.kind === 'tree' && o.data?.big);
      count[id] = big.length;
      for (const o of big) {
        const tx = Math.floor(o.x), ty = Math.floor(o.y);
        expect(worldArtKey(o), o.id).toMatch(/^aa-tree-(round|wide)$/);
        expect([T.Grass, T.Tuft, T.Flowers, T.Deep], o.id).toContain(map.terrainAt(tx, ty));
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          expect([T.Path, T.Plaza, T.Water, T.Bridge, T.Farm], `${id} ${o.id} +${dx},${dy}`).not.toContain(map.terrainAt(tx + dx, ty + dy));
        }
      }
    }
    expect(count['starter-valley']).toBeGreaterThan(20);
    expect(count['ben-tre']).toBeGreaterThan(10);
    expect(count['ca-mau']).toBe(0);
    expect(count['frozen-mountains']).toBe(0);
  });
});
