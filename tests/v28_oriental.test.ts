import { describe, expect, it } from 'vitest';
import { chunkCols, chunkRows, type MapObject } from '../src/core/map/mapProvider';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ORIENTAL_PROPS, ORIENTAL_RISE, orientalArtOf, orientalKindOf, PROP_SIZE } from '../src/core/map/oriental';
import { T } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import { paintBuilding, paintProp, type Px } from '../src/render/orientalArt';
import provinces from '../src/data/vietnam/provinces.json';

// V28: the Vietnam Odyssey towns are old oriental towns — curved tiled roofs, a cổng tam quan at the square, lantern
// posts, bonsai and stone lanterns — all drawn by code, playing exactly like the houses they replace.

const VN = (provinces as { id: string }[]).map((p) => p.id);

function objects(map: ValleyMap): MapObject[] {
  const out: MapObject[] = [];
  for (let cy = 0; cy < chunkRows(map); cy++) for (let cx = 0; cx < chunkCols(map); cx++) out.push(...map.objectsInChunk(cx, cy));
  return out;
}

/** Paints into a bounds checker: every rectangle must lie inside the w × h image. */
function bounded(w: number, h: number, out: string[], tag: string): Px {
  return (x, y, rw, rh) => {
    if (rw <= 0 || rh <= 0) return;
    if (x < 0 || y < 0 || x + rw > w || y + rh > h) out.push(`${tag} [${x},${y} ${rw}×${rh}] outside ${w}×${h}`);
  };
}

describe('V28 old oriental towns', () => {
  it('kinds from ids and names: Pokémon Center, mart, temples / museums, gates, houses', () => {
    expect(orientalKindOf('hn-center', 'Trung tâm Pokémon')).toBe('center');
    expect(orientalKindOf('hn-mart', 'Cửa hàng phố Hàng Đào')).toBe('mart');
    expect(orientalKindOf('hn-museum', 'Văn Miếu — Quốc Tử Giám')).toBe('temple');
    expect(orientalKindOf('tv-chua-ang', 'Chùa Âng')).toBe('temple');
    expect(orientalKindOf('hn-gate', 'Cổng tam quan Phố cổ Hà Nội')).toBe('gate');
    expect(orientalKindOf('hn-house-1', 'Nhà cô Hằng phố cổ')).toBe('house');
  });

  it('every province town is oriental: each building has its art, the Center and mart keep their door and sign', () => {
    for (const id of VN) {
      const map = new ValleyMap(REGION_DEFS[id]);
      const bs = objects(map).filter((o) => o.kind === 'building');
      expect(bs.length, id).toBeGreaterThan(2);
      for (const b of bs) {
        const art = orientalArtOf(b);
        expect(art, `${id} ${b.id}`).not.toBeNull();
        expect(art!.w, b.id).toBe(b.w! * 16);
        expect(art!.h, b.id).toBe(b.h! * 16 + ORIENTAL_RISE[art!.kind as keyof typeof ORIENTAL_RISE]);
        if (art!.kind === 'gate') continue;
        // the Tiny Town grid stays as the fallback
        expect(b.tiles!.length, b.id).toBe(b.h);
        for (let y = b.y; y < b.y + b.h!; y++) for (let x = b.x; x < b.x + b.w!; x++) expect(map.solidAt(x, y), `${b.id} ${x},${y}`).toBe(true);
        if (art!.kind === 'center' || art!.kind === 'mart') expect(map.solidAt(b.data!.doorX as number, b.y + b.h!), `${b.id} door front`).toBe(false);
      }
      expect(bs.some((b) => orientalArtOf(b)!.kind === 'center'), id).toBe(true);
    }
  });

  it('a cổng tam quan spans the path into the square: pillars solid, the way through open path', () => {
    let gates = 0;
    for (const id of VN) {
      const map = new ValleyMap(REGION_DEFS[id]);
      for (const g of objects(map).filter((o) => o.kind === 'building' && orientalArtOf(o)?.kind === 'gate')) {
        gates++;
        expect(map.solidAt(g.x, g.y), `${g.id} left pillar`).toBe(true);
        expect(map.solidAt(g.x + g.w! - 1, g.y), `${g.id} right pillar`).toBe(true);
        for (let x = g.x + 1; x < g.x + g.w! - 1; x++) {
          expect(map.solidAt(x, g.y), `${g.id} ${x}`).toBe(false);
          expect([T.Path, T.Bridge], `${g.id} ${x}`).toContain(map.terrainAt(x, g.y));
        }
      }
    }
    expect(gates).toBeGreaterThanOrEqual(30);
  });

  it('street furniture: lantern posts, bonsai, stone lanterns on open ground, never on a path or in a doorway', () => {
    const count: Record<string, number> = {};
    for (const id of VN) {
      const d = REGION_DEFS[id], map = new ValleyMap(d);
      const doors = d.buildings.map((b) => [b.x + b.door, b.y + b.h]);
      for (const p of d.props.filter((q) => (ORIENTAL_PROPS as readonly string[]).includes(q.kind))) {
        count[p.kind] = (count[p.kind] ?? 0) + 1;
        expect(map.solidAt(p.x, p.y), `${id} ${p.kind} ${p.x},${p.y}`).toBe(false);
        expect([T.Path, T.Bridge, T.Water], `${id} ${p.kind} ${p.x},${p.y}`).not.toContain(map.terrainAt(p.x, p.y));
        for (const [dx, dy] of doors) expect(Math.hypot(dx - p.x, dy - p.y), `${id} ${p.kind} by a door`).toBeGreaterThanOrEqual(1.9);
      }
    }
    expect(count.lantern).toBeGreaterThan(80);
    expect(count.bonsai).toBeGreaterThan(80);
    expect(count['stone-lantern']).toBeGreaterThan(30);
  });

  it('the pixel art stays inside its image for every shape and size used', () => {
    const bad: string[] = [];
    const seen = new Set<string>();
    for (const id of VN) for (const o of objects(new ValleyMap(REGION_DEFS[id]))) {
      const a = orientalArtOf(o);
      if (!a || seen.has(a.key)) continue;
      seen.add(a.key);
      const px = bounded(a.w, a.h, bad, a.key);
      if (o.kind === 'building') paintBuilding(px, a.kind as never, a.tw, a.th, a.pal, a.door);
      else paintProp(px, a.kind as never);
    }
    for (const p of ORIENTAL_PROPS) paintProp(bounded(PROP_SIZE[p][0], PROP_SIZE[p][1], bad, p), p);
    expect(seen.size).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });
});
