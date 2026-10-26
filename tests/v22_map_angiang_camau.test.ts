import { describe, expect, it } from 'vitest';
import anGiangJson from '../src/data/vietnam/an-giang.json';
import caMauJson from '../src/data/vietnam/ca-mau.json';
import vnQuestsJson from '../src/data/vietnam/quests.json';
import { RegionDef, ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';
import { GATHER_TABLES, nearestWater } from '../src/core/gathering';
import { ECOLOGY } from '../src/core/encounters';
import { ITEMS } from '../src/adventure/AdventureState';
import type { QuestDef } from '../src/core/quests';

// V22 map design — An Giang and Cà Mau after the Cần Thơ sample: Đồng Nước Nổi is a grid of flooded paddies with dikes
// (not a plain field); gathering spots with their own tables in both regions; hidden nooks sealed until the obstacle
// goes; Cà Mau's rod from Ngư dân Tư Sáu; chest ids unique.

const ag = anGiangJson as unknown as RegionDef, cm = caMauJson as unknown as RegionDef;
const maps = { 'an-giang': [ag, new ValleyMap(ag)], 'ca-mau': [cm, new ValleyMap(cm)] } as const;
const quests = vnQuestsJson as unknown as QuestDef[];

/** Tiles blocked on foot: terrain + collidable map objects + the field obstacles (the scene draws those). */
function blockedSet(m: ValleyMap, def: RegionDef): Set<string> {
  const s = new Set<string>((def.field ?? []).map((f) => `${f.x},${f.y}`));
  const cols = Math.ceil(m.widthTiles / m.chunk), rows = Math.ceil(m.heightTiles / m.chunk);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    for (const o of m.objectsInChunk(cx, cy)) if (o.collideR || o.kind === 'field' || o.kind === 'tree' || o.kind === 'boulder') s.add(`${Math.floor(o.x)},${Math.floor(o.y)}`);
  }
  return s;
}
const walkable = (m: ValleyMap, b: Set<string>, x: number, y: number) => !m.solidAt(x, y) && !b.has(`${x},${y}`);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Tiles reachable on foot from the region's spawn (field obstacles block; ferries, boats and portals are not used). */
function reach(def: RegionDef, m: ValleyMap, b: Set<string>, from = def.spawn): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]), q: [number, number][] = [[from.x, from.y]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !walkable(m, b, nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
const touches = (seen: Set<string>, x: number, y: number) => N4.some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`));

describe('V22 map: Đồng Nước Nổi is flooded paddies', () => {
  const [def, m] = maps['an-giang'];
  const area = def.areas.find((a) => a.id === 'ag-wetland')!;
  it('water plots ringed by walkable dikes, some plots standing rice; no trees on the dikes', () => {
    const [x0, y0, x1, y1] = area.rect;
    const b = blockedSet(m, def);
    let water = 0, rice = 0, dikeBlocked = 0;
    for (let y = y0; y <= y1 - 4; y++) for (let x = x0; x <= x1 - 4; x++) {
      const t = m.terrainAt(x, y);
      if (t === T.Water) water++;
      if (t === T.TallGrass) rice++;
      const dike = (x - x0) % area.paddy!.cell === 0 || (y - y0) % area.paddy!.cell === 0;
      if (dike && t !== T.Water && t !== T.Bridge && b.has(`${x},${y}`)) dikeBlocked++;
    }
    expect(water).toBeGreaterThan(600); // it was a plain green field
    expect(rice).toBeGreaterThan(150);
    expect(dikeBlocked).toBe(0);
  });

  it('every dike crossing in the paddies can be walked to from the town', () => {
    const b = blockedSet(m, def), seen = reach(def, m, b);
    const [x0, y0, x1, y1] = area.rect, c = area.paddy!.cell;
    let crossings = 0, open = 0;
    for (let y = y0 + c; y < y1 - 4; y += c) for (let x = x0 + c; x < x1 - 4; x += c) {
      if (m.terrainAt(x, y) === T.Water) continue; // the river runs through
      crossings++;
      if (seen.has(`${x},${y}`)) open++;
    }
    expect(crossings).toBeGreaterThan(20);
    expect(open).toBe(crossings);
  });
});

for (const name of ['an-giang', 'ca-mau'] as const) {
  describe(`V22 map: ${name} gathering, nooks, chests`, () => {
    const [def, m] = maps[name];
    it('every gathering spot uses a valid table, is reachable, fishing spots sit by water', () => {
      const b = blockedSet(m, def), seen = reach(def, m, b);
      const nodes = def.nodes ?? [];
      expect(nodes.length).toBe(8);
      for (const n of nodes) {
        const tb = GATHER_TABLES[n.table];
        expect(tb, n.table).toBeTruthy();
        for (const p of tb.pokemon) expect(ECOLOGY.get(p.species), p.species).toBeTruthy();
        for (const i of tb.items) expect(ITEMS[i.id], i.id).toBeTruthy();
        expect(touches(seen, n.x, n.y), n.id).toBe(true);
        if (tb.kind === 'fish') {
          expect(nearestWater(m, n.x, n.y, 3), n.id).not.toBeNull();
          expect(tb.lockedText?.join(' ')).toContain('Ngư dân Tư Sáu');
        }
      }
    });

    it('hidden nooks: the obstacle can be walked up to; inside is sealed; the chest inside opens with the flag', () => {
      const b = blockedSet(m, def), seen = reach(def, m, b);
      const field = def.field ?? [];
      expect(field.length).toBe(2);
      for (const f of field) {
        expect(touches(seen, f.x, f.y), f.id).toBe(true);
        const chest = def.chests.find((c) => c.requiresFlag === `field:${name}:${f.id}`)!;
        expect(chest, f.id).toBeTruthy();
        expect(Math.hypot(chest.x + 0.5 - f.nook!.cx, chest.y + 0.5 - f.nook!.cy)).toBeLessThan(f.nook!.r);
        expect(seen.has(`${chest.x},${chest.y}`), `${f.id} chest reachable without the obstacle`).toBe(false);
        // with the obstacle gone the chest is reachable
        const b2 = new Set(b); b2.delete(`${f.x},${f.y}`);
        const open = reach(def, m, b2);
        expect(touches(open, chest.x, chest.y) || open.has(`${chest.x},${chest.y}`), `${f.id} chest after clearing`).toBe(true);
        for (const id of Object.keys(chest.items)) expect(ITEMS[id], `${chest.id} ${id}`).toBeTruthy();
      }
    });

    it('chest ids are unique; NPCs and trainers stay on dry, reachable ground', () => {
      const ids = def.chests.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      const b = blockedSet(m, def), seen = reach(def, m, b);
      for (const o of [...def.npcs, ...def.trainers]) {
        if (name === 'an-giang' && o.x < 33) continue; // Phú Quốc: by ferry
        expect(m.terrainAt(o.x, o.y), o.id).not.toBe(T.Water);
        expect(touches(seen, o.x, o.y) || seen.has(`${o.x},${o.y}`), o.id).toBe(true);
      }
    });
  });
}

describe('V22 map: quests for the new spots', () => {
  it("Cà Mau: Ngư dân Tư Sáu's rod (ốc len → rod)", () => {
    const q = quests.find((x) => x.id === 'vn-cm-rod')!;
    expect(q.giver).toBe('cm-fisher');
    expect(q.objectives[0]).toMatchObject({ type: 'collect', target: 'forage' });
    expect(q.rewards.flags).toContain('tool:rod');
    expect(cm.npcs.some((n) => n.id === 'cm-fisher')).toBe(true);
  });
  it("An Giang: Cô Sáu's flood-season harvest (forage + a catch)", () => {
    const q = quests.find((x) => x.id === 'vn-ag-flood-harvest')!;
    expect(q.giver).toBe('ag-sugar-palm');
    expect(q.objectives.map((o) => `${o.type}:${o.target}`)).toEqual(['collect:forage', 'collect:fish', 'talk:ag-sugar-palm']);
    for (const [id, n] of Object.entries(q.rewards.items ?? {})) { expect(ITEMS[id], id).toBeTruthy(); expect(n).toBeGreaterThan(0); }
  });
});
