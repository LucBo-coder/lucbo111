import { describe, expect, it } from 'vitest';
import valleyJson from '../src/data/world/starter-valley.json';
import canThoJson from '../src/data/vietnam/can-tho.json';
import vnQuestsJson from '../src/data/vietnam/quests.json';
import { RegionDef, ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';
import { GATHER_TABLES, nearestWater } from '../src/core/gathering';
import { ECOLOGY } from '../src/core/encounters';
import { ITEMS } from '../src/adventure/AdventureState';
import type { QuestDef } from '../src/core/quests';

// V22 map design — Cần Thơ, the sample region: Miệt vườn Phong Điền is an orchard (fruit-tree beds between canals
// with plank crossings), not a recoloured field; fruit bushes and canal fishing spots; two sealed hidden nooks.

const ct = canThoJson as unknown as RegionDef;
const map = new ValleyMap(ct);

/** Tiles blocked for walking: terrain + every collidable map object (trees, boulders, pillars, field obstacles…). */
function blockedSet(m: ValleyMap): Set<string> {
  const s = new Set<string>();
  const cols = Math.ceil(m.widthTiles / m.chunk), rows = Math.ceil(m.heightTiles / m.chunk);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    for (const o of m.objectsInChunk(cx, cy)) if (o.collideR || o.kind === 'field' || o.kind === 'tree' || o.kind === 'boulder') s.add(`${Math.floor(o.x)},${Math.floor(o.y)}`);
  }
  return s;
}
const walkable = (m: ValleyMap, b: Set<string>, x: number, y: number) => !m.solidAt(x, y) && !b.has(`${x},${y}`);

describe('V22 map: Miệt vườn Phong Điền is an orchard', () => {
  const area = ct.areas.find((a) => a.id === 'ct-orchard')!;
  it('canals every 7 rows with plank crossings; fruit trees on the beds; lanes stay open', () => {
    const [x0, y0, x1, y1] = area.rect;
    let water = 0, bridges = 0, trees = 0;
    for (let y = y0 + 2; y < y1 - 1; y++) {
      if ((y - y0) % 7 !== 0) continue;
      for (let x = 4; x <= x1; x++) { const t = map.terrainAt(x, y); if (t === T.Water) water++; if (t === T.Bridge) bridges++; }
    }
    const b = blockedSet(map);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (b.has(`${x},${y}`) && x > 4 && y < 106) trees++;
    expect(water).toBeGreaterThan(300);
    expect(bridges).toBeGreaterThanOrEqual(20);
    expect(trees).toBeGreaterThan(200); // it was 0: a plain green field
    // every authored thing in the orchard stands on dry, walkable ground
    for (const o of [...ct.npcs, ...ct.trainers, ...ct.chests, ...(ct.nodes ?? [])]) {
      if (o.x > x1 || o.y < y0) continue;
      expect(map.terrainAt(o.x, o.y), (o as { id: string }).id).not.toBe(T.Water);
      expect(walkable(map, b, o.x, o.y) || (ct.nodes ?? []).includes(o as never), (o as { id: string }).id).toBe(true);
    }
  });

  it('the whole orchard is reachable from the town (no lane sealed off by canals)', () => {
    const b = blockedSet(map);
    const seen = new Set<string>(), q: [number, number][] = [[ct.spawn.x, ct.spawn.y]];
    seen.add(`${ct.spawn.x},${ct.spawn.y}`);
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (seen.has(k) || !walkable(map, b, nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    for (const id of ['ct-gardener', 'ct-orchard-owner']) {
      const n = ct.npcs.find((x) => x.id === id)!;
      expect([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => seen.has(`${n.x + dx},${n.y + dy}`)), id).toBe(true);
    }
    for (const n of ct.nodes ?? []) expect([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => seen.has(`${n.x + dx},${n.y + dy}`)), n.id).toBe(true);
    // the field obstacles can be walked up to
    for (const f of ct.field ?? []) expect([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => seen.has(`${f.x + dx},${f.y + dy}`)), f.id).toBe(true);
  });
});

describe('V22 map: hidden nooks are sealed until the obstacle goes', () => {
  for (const [name, def] of [['can-tho', ct], ['starter-valley', valleyJson as unknown as RegionDef]] as const) {
    it(name, () => {
      const m = name === 'can-tho' ? map : new ValleyMap(def);
      const b = blockedSet(m);
      for (const f of def.field ?? []) {
        if (!f.nook) continue;
        b.add(`${f.x},${f.y}`);
        const start: [number, number] = [Math.floor(f.nook.cx), Math.floor(f.nook.cy)];
        const seen = new Set([start.join(',')]), q = [start];
        let escaped = false;
        while (q.length && !escaped) {
          const [x, y] = q.pop()!;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
            if (seen.has(k) || !walkable(m, b, nx, ny)) continue;
            if (Math.hypot(nx + 0.5 - f.nook.cx, ny + 0.5 - f.nook.cy) > f.nook.r + 2.5) { escaped = true; break; }
            seen.add(k); q.push([nx, ny]);
          }
        }
        expect(escaped, `${name}:${f.id} leaks`).toBe(false);
      }
    });
  }
});

describe('V22 map: gathering in Cần Thơ', () => {
  it('fruit bushes and canal fishing spots with valid tables; the rod comes from Ông Sáu', () => {
    const nodes = ct.nodes ?? [];
    expect(nodes.filter((n) => n.table === 'orchard-forage').length).toBe(5);
    expect(nodes.filter((n) => n.table === 'canal-fish').length).toBe(3);
    for (const n of nodes) {
      const tb = GATHER_TABLES[n.table];
      expect(tb, n.table).toBeTruthy();
      for (const p of tb.pokemon) expect(ECOLOGY.get(p.species), p.species).toBeTruthy();
      for (const i of tb.items) expect(ITEMS[i.id], i.id).toBeTruthy();
      if (tb.kind === 'fish') expect(nearestWater(map, n.x, n.y, 3), n.id).not.toBeNull();
    }
    expect(GATHER_TABLES['canal-fish'].lockedText?.join(' ')).toContain('Ông Sáu nhà vườn');
    const rod = (vnQuestsJson as unknown as QuestDef[]).find((q) => q.id === 'vn-ct-rod')!;
    expect(rod.giver).toBe('ct-gardener');
    expect(rod.rewards.flags).toContain('tool:rod');
    for (const c of ct.chests) for (const id of Object.keys(c.items)) expect(ITEMS[id], `${c.id} ${id}`).toBeTruthy();
  });

  it('valley fishing spots keep their ripples where they were (toward the lake, on water)', () => {
    const v = valleyJson as unknown as RegionDef, vm = new ValleyMap(v);
    for (const n of (v.nodes ?? []).filter((x) => GATHER_TABLES[x.table].kind === 'fish')) {
      const dx = v.lake.cx - (n.x + 0.5), dy = v.lake.cy - (n.y + 0.5), d = Math.hypot(dx, dy);
      expect(vm.terrainAt(Math.floor(n.x + 0.5 + (dx / d) * 1.5), Math.floor(n.y + 0.5 + (dy / d) * 1.5)), n.id).toBe(T.Water);
    }
  });
});
