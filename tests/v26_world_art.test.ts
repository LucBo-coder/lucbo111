import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chunkCols, chunkRows, type MapObject } from '../src/core/map/mapProvider';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { AA_ART, AA_DIR, EX, T, worldArtKey } from '../src/core/map/tiles';
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
    // (the Vietnam Odyssey towns use the oriental buildings since V28 — tests/v28_oriental.test.ts)
    const cases: [string, string, string][] = [['starter-valley', 'elder-hut', 'aa-house-brown']];
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

  it('pagoda roofs are gold, Văn Thánh Miếu teal; Pokémon Centers and marts carry their sign above the door', () => {
    const roofOf = (region: string, id: string) => objects(new ValleyMap(REGION_DEFS[region])).find((o) => o.id === id)!.tiles![0][1];
    expect(roofOf('tra-vinh', 'tv-chua-ang')).toBe(EX.roofGold.t);
    expect(roofOf('tra-vinh', 'tv-chua-hang')).toBe(EX.roofGold.t);
    expect(roofOf('vinh-long', 'vl-temple')).toBe(EX.roofTeal.t);
    let signs = 0;
    for (const region of Object.keys(REGION_DEFS)) {
      for (const o of objects(new ValleyMap(REGION_DEFS[region]))) {
        if (o.kind !== 'building' || o.h! < 4) continue;
        const kind = /center/i.test(o.id) ? EX.signCenter : /mart/i.test(o.id) ? EX.signMart : null;
        const cell = o.tiles![o.h! - 2][(o.data!.doorX as number) - o.x];
        if (kind) { signs++; expect(Object.values(kind), `${region} ${o.id}`).toContain(cell); }
        else expect([...Object.values(EX.signCenter), ...Object.values(EX.signMart)], `${region} ${o.id}`).not.toContain(cell);
      }
    }
    expect(signs).toBeGreaterThan(4);
  });
});

describe('ground transitions and themed paths', () => {
  const lawn = [T.Grass, T.Tuft, T.Flowers, T.Deep, T.TallGrass] as number[];

  it('sand / rocky on green ground: the fringe tile of exactly the sides touching grass, else notches for grass corners', () => {
    let edges = 0, inner = 0;
    for (const id of ['coral-coast', 'starter-valley', 'ben-tre']) {
      const map = new ValleyMap(REGION_DEFS[id]);
      for (let y = 1; y < map.heightTiles - 1; y++) for (let x = 1; x < map.widthTiles - 1; x++) {
        const t = map.terrainAt(x, y);
        if (t !== T.Sand && t !== T.Rocky) continue;
        const g = (dx: number, dy: number) => lawn.includes(map.terrainAt(x + dx, y + dy));
        const mask = (g(0, -1) ? 1 : 0) | (g(1, 0) ? 2 : 0) | (g(0, 1) ? 4 : 0) | (g(-1, 0) ? 8 : 0);
        const tile = map.tileIndexAt(x, y, 0);
        const corners = (g(1, -1) ? 1 : 0) | (g(-1, -1) ? 2 : 0) | (g(1, 1) ? 4 : 0) | (g(-1, 1) ? 8 : 0);
        if (mask) { edges++; expect(tile, `${id} ${x},${y}`).toBe((t === T.Sand ? EX.sandEdge : EX.rockyEdge) + mask); }
        else if (corners) { inner++; expect(tile, `${id} ${x},${y}`).toBe((t === T.Sand ? EX.sandInner : EX.rockyInner) + corners); }
        else expect(t === T.Sand ? [EX.sand, EX.sand2] : [EX.rocky, EX.rocky2], `${id} ${x},${y}`).toContain(tile);
      }
    }
    expect(edges).toBeGreaterThan(100);
    expect(inner).toBeGreaterThan(10);
  });

  it('paths are a snow trail in the mountains and basalt in the volcanic lands', () => {
    for (const [id, base] of [['frozen-mountains', EX.snowPath], ['volcanic-lands', EX.basaltPath]] as const) {
      const map = new ValleyMap(REGION_DEFS[id]);
      let n = 0;
      for (let y = 0; y < map.heightTiles; y++) for (let x = 0; x < map.widthTiles; x++) {
        if (map.terrainAt(x, y) !== T.Path) continue;
        n++;
        expect([base, base + 1], `${id} ${x},${y}`).toContain(map.tileIndexAt(x, y, 0));
      }
      expect(n, id).toBeGreaterThan(50);
    }
  });
});
