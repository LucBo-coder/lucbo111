import { describe, expect, it } from 'vitest';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';
import { SHRINES, shrineBounds, shrineFind } from '../src/core/shrines';
import { LEGENDS } from '../src/core/legends';
import { LEGEND_CLUES } from '../src/core/legendClues';
import { secretFlag, secretGate, secretRevealed, type SecretDef } from '../src/core/secrets';

// Hidden shrines (LEGENDARY_SHRINES.md mục 8): no shrine stands on an overworld map any more. The ten tier-1
// legendaries live in dimensions of their own, every other shrine in its map's hidden sanctum (one walled pocket each);
// on the map there is only a concealed entrance behind a field obstacle or revealed by the legendary's clues.

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const maps = new Map<string, ValleyMap>();
const mapOf = (id: string) => { if (!maps.has(id)) maps.set(id, new ValleyMap(REGION_DEFS[id])); return maps.get(id)!; };
const planes = Object.values(REGION_DEFS).filter((d) => d.void);
const overworld = Object.values(REGION_DEFS).filter((d) => !d.void && d.theme !== 'mekong');
const secrets = overworld.flatMap((d) => (d.secrets ?? []).map((s) => ({ region: d.id, s })));

/** Tiles reachable from (sx, sy): no wall / water / lava, no collider; field obstacles block unless `open`. */
function reach(id: string, sx: number, sy: number, open = new Set<string>()): Set<string> {
  const m = mapOf(id), d = REGION_DEFS[id], b = new Set<string>();
  for (let cy = 0; cy < Math.ceil(m.heightTiles / m.chunk); cy++) for (let cx = 0; cx < Math.ceil(m.widthTiles / m.chunk); cx++)
    for (const o of m.objectsInChunk(cx, cy)) if (o.collideR || o.kind === 'tree' || o.kind === 'boulder') b.add(`${Math.floor(o.x)},${Math.floor(o.y)}`);
  for (const f of d.field ?? []) if (!open.has(f.id)) b.add(`${f.x},${f.y}`);
  const seen = new Set([`${sx},${sy}`]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`, t = m.terrainAt(nx, ny);
      if (seen.has(k) || m.solidAt(nx, ny) || b.has(k) || t === T.Water || t === T.Lava) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
const near = (s: Set<string>, x: number, y: number) => s.has(`${x},${y}`) || N4.some(([dx, dy]) => s.has(`${x + dx},${y + dy}`));

describe('V22 hidden shrines: planes', () => {
  it('no shrine is stamped on a map you walk around; every layout stands in exactly one plane', () => {
    for (const d of overworld) expect((d.legendaries ?? []).filter((l) => l.shrine).map((l) => l.id), d.id).toEqual([]);
    const used = planes.flatMap((d) => (d.legendaries ?? []).map((l) => l.shrine));
    expect(new Set(used).size).toBe(used.length);
    expect(new Set(used)).toEqual(new Set(SHRINES.keys()));
  });

  it('each tier-1 legendary has a dimension of its own (Dialga, Palkia and Arceus share the Temple as one chain)', () => {
    const tier1 = ['mewtwo', 'ho-oh', 'lugia', 'kyogre', 'groudon', 'rayquaza', 'giratina', 'dialga', 'palkia', 'arceus'];
    const home = (id: string) => planes.find((d) => d.legendaries!.some((l) => l.id === id))!;
    for (const id of tier1) {
      const d = home(id);
      expect(SHRINES.get(id)!.tier, id).toBe(1);
      const others = d.legendaries!.map((l) => l.id).filter((x) => x !== id);
      if (['dialga', 'palkia', 'arceus'].includes(id)) expect(d.id).toBe('origin-temple');
      else expect(others, `${id} shares ${d.id}`).toEqual([]);
    }
    // the sanctums hold no tier-1 shrine
    for (const d of planes) if (d.id.endsWith('-hollow')) for (const l of d.legendaries!) expect(SHRINES.get(l.shrine!)!.tier, l.id).not.toBe(1);
  });

  it('every pocket: the arrival reaches the ritual spot, the arena and the way back, but no other pocket', () => {
    for (const { s } of secrets) {
      const d = REGION_DEFS[s.to], r = reach(d.id, s.toX, s.toY, new Set((d.field ?? []).map((f) => f.id)));
      const mine = d.legendaries!.filter((l) => { const [x0, y0] = shrineBounds(SHRINES.get(l.shrine!)!, l.x, l.y), p = shrineFind(SHRINES.get(l.shrine!)!, 'P')!; return near(r, x0 + p[0], y0 + p[1]); });
      expect(mine.length, `${s.id} → ${d.id}: pockets reached`).toBeGreaterThan(0);
      if (d.id.endsWith('-hollow')) expect(mine.length, `${s.id}: one pocket only`).toBe(1);
      for (const l of mine) if (SHRINES.get(l.shrine!)!.arena) expect(near(r, l.x, l.y), `${l.id} arena`).toBe(true);
      expect((d.portals ?? []).some((p) => near(r, p.x, p.y) && p.to !== d.id), `${s.id}: a way back`).toBe(true);
    }
  });

  it('planes are never listed as regions; their legendary sites match legends.json', () => {
    for (const d of planes) {
      for (const l of d.legendaries!) {
        const L = LEGENDS.get(l.id);
        if (L?.site) expect(L.site, l.id).toEqual({ x: l.x, y: l.y, region: d.id });
      }
    }
    expect(REGION_DEFS['silver-maelstrom'].weather).toBe('rain');
  });
});

describe('V22 hidden shrines: entrances', () => {
  it('every plane pocket has one hidden entrance on its map; it can be reached, its reveal exists', () => {
    const targets = new Set(secrets.map(({ s }) => `${s.to}:${s.toX},${s.toY}`));
    // 30 shrines, the Temple's three share one gate
    expect(secrets.length).toBe(28);
    expect(targets.size).toBe(28);
    for (const { region, s } of secrets) {
      expect(REGION_DEFS[s.to]?.void, s.id).toBeTruthy();
      const d = REGION_DEFS[region], r = reach(region, d.spawn.x, d.spawn.y);
      const [sx, sy] = s.stand ?? [s.x, s.y];
      expect(near(r, sx, sy), `${s.id} reachable`).toBe(true);
      if (s.reveal.field) {
        const f = d.field!.find((x) => x.id === s.reveal.field);
        expect(f && f.x === s.x && f.y === s.y && ['cut', 'smash'].includes(f.ability), s.id).toBe(true);
      } else expect(LEGEND_CLUES.has(s.reveal.clues!), s.id).toBe(true);
      if (s.look === 'whirlpool') expect(mapOf(region).terrainAt(s.x, s.y), s.id).toBe(T.Water);
      // the way back lands next to the entrance, on ground you can walk from
      const back = Object.values(REGION_DEFS).flatMap((p) => p.void ? p.portals ?? [] : []).find((p) => p.to === region && Math.hypot(p.toX - sx, p.toY - sy) <= 3);
      expect(back, `${s.id} way back`).toBeTruthy();
      expect(near(r, back!.toX, back!.toY), `${s.id} way back lands reachable`).toBe(true);
    }
  });

  it('entrances are spread out and not on a road', () => {
    for (const d of overworld) {
      const list = d.secrets ?? [];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y), `${list[i].id}/${list[j].id}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('hidden until revealed: a cleared obstacle or the three clues; once found it stays; story flags / weather gate it', () => {
    const s: SecretDef = { id: 'to-x', name: 'x', x: 1, y: 1, to: 'p', toX: 0, toY: 0, look: 'cave', reveal: { field: 'secret-x' }, requires: ['boss:a'], weather: ['rain'] };
    const w = (flags: string[], solved = false, inv = false) => ({ has: (f: string) => flags.includes(f), fieldSolved: () => solved, investigated: () => inv });
    expect(secretRevealed('m', s, w([]))).toBe(false);
    expect(secretRevealed('m', s, w([], true))).toBe(true);
    expect(secretRevealed('m', s, w([secretFlag('m', 'to-x')]))).toBe(true);
    const c = { ...s, reveal: { clues: 'lugia' } };
    expect(secretRevealed('m', c, w([], true))).toBe(false);
    expect(secretRevealed('m', c, w([], false, true))).toBe(true);
    expect(secretGate(s, () => false, 'rain')).toEqual({ ok: false, reason: 'sealed' });
    expect(secretGate(s, () => true, 'clear')).toEqual({ ok: false, reason: 'weather' });
    expect(secretGate(s, () => true, 'rain')).toEqual({ ok: true });
  });

  it('every new plane has its own scenery: flat pieces on the islands, standing ones only on open ground, never in an arena', () => {
    // LEGENDARY_SHRINES.md mục 8.5 (the two authored planes, Vực Nguyên Hải and Thần Điện, keep their own look)
    for (const d of planes.filter((x) => x.id !== 'abyssal-depths' && x.id !== 'origin-temple')) {
      expect(d.decor, d.id).toBeDefined();
      const m = mapOf(d.id), objs = [];
      for (let cy = 0; cy < Math.ceil(m.heightTiles / m.chunk); cy++) for (let cx = 0; cx < Math.ceil(m.widthTiles / m.chunk); cx++) objs.push(...m.objectsInChunk(cx, cy).filter((o) => o.id.startsWith('decor-')));
      expect(objs.length, d.id).toBeGreaterThan(0); // a grove (Celebi) is mostly trees already: a few pieces
      for (const o of objs) {
        expect(m.solidAt(o.x, o.y), o.id).toBe(false);
        if (o.kind === 'decal') continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(m.solidAt(o.x + dx, o.y + dy), `${d.id} ${o.id}`).toBe(false);
        for (const l of d.legendaries ?? []) expect(Math.hypot(o.x - l.x, o.y - l.y) * 48, `${d.id} ${o.id}`).toBeGreaterThan(l.arena);
      }
    }
  });
});
