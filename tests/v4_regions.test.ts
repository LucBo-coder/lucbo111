import { describe, expect, it } from 'vitest';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';
import { ECOLOGY, eligible, REGIONS, regionOfArea, rollEncounter } from '../src/core/encounters';
import { LEGENDS } from '../src/core/legends';
import { Rng } from '../src/core/rng';

const NEW = ['frozen-mountains', 'volcanic-lands', 'legendary-sanctuary'];

describe('regions beyond the valley (Frozen Mountains, Volcanic Lands, Legendary Sanctuary)', () => {
  it('each map loads, its spawn / portals / waypoints stand on open ground, and its areas belong to its region', () => {
    for (const id of NEW) {
      const d = REGION_DEFS[id];
      const m = new ValleyMap(d);
      const free = (x: number, y: number) => !m.solidAt(x, y);
      expect(free(d.spawn.x, d.spawn.y), `${id} spawn`).toBe(true);
      for (const p of d.portals ?? []) { expect(free(p.x, p.y + 1), `${id} portal`).toBe(true); expect(REGION_DEFS[p.to], p.to).toBeTruthy(); }
      for (const w of d.waypoints) expect(free(w.x, w.y + 1), `${id} waypoint`).toBe(true);
      for (const a of d.areas) expect(regionOfArea(a.id)?.id, a.id).toBe(id);
      // the theme drives the terrain
      let snow = 0, lava = 0, sanctum = 0;
      for (let y = 4; y < d.height - 4; y += 2) for (let x = 4; x < d.width - 4; x += 2) {
        const t = m.terrainAt(x, y);
        if (t === T.Snow || t === T.SnowDeep || t === T.Ice) snow++;
        if (t === T.Lava) lava++;
        if (t === T.Sanctum) sanctum++;
      }
      if (id === 'frozen-mountains') expect(snow).toBeGreaterThan(500);
      if (id === 'volcanic-lands') { expect(lava).toBeGreaterThan(20); expect(m.solidAt(67, 33)).toBe(true); }
      if (id === 'legendary-sanctuary') expect(sanctum).toBeGreaterThan(300);
    }
  });
  it('the valley has a story-gated portal to each new region, and each region has a way back', () => {
    const v = REGION_DEFS['starter-valley'];
    for (const id of NEW) {
      const p = v.portals!.find((x) => x.to === id)!;
      expect(p, id).toBeTruthy();
      expect(p.requires!.length).toBeGreaterThan(0);
      expect(REGION_DEFS[id].portals!.some((b) => b.to === 'starter-valley')).toBe(true);
    }
  });
  it('level ranges follow the design (Frozen 32–45, Volcanic 42–58, Sanctuary 65–85 / boss 80–100)', () => {
    expect(REGIONS.get('frozen-mountains')!.level).toEqual([32, 45]);
    expect(REGIONS.get('volcanic-lands')!.level).toEqual([42, 58]);
    expect(REGIONS.get('legendary-sanctuary')!.level).toEqual([65, 85]);
    expect(REGIONS.get('legendary-sanctuary')!.boss).toEqual([80, 100]);
  });
  it('snow and volcano species spawn in the wild in their regions; the sanctuary has strong final forms', () => {
    const rng = new Rng(8);
    for (const [id, biome] of [['frozen-mountains', 'snow'], ['volcanic-lands', 'volcano'], ['legendary-sanctuary', 'sanctuary']] as const) {
      const r = REGIONS.get(id)!;
      const pool = eligible({ biome, night: false, weather: 'clear' }, r);
      expect(pool.length, id).toBeGreaterThan(5);
      for (let i = 0; i < 200; i++) {
        const roll = rollEncounter(rng, { biome, night: i % 2 === 0, weather: 'clear' }, r)!;
        const e = ECOLOGY.get(roll.species)!;
        expect(e.biomes).toContain(biome);
        expect(e.legendary || e.mythical).toBe(false);
        expect(roll.level).toBeGreaterThanOrEqual(r.level[0]);
        expect(roll.level).toBeLessThanOrEqual(r.level[1] + 3);
      }
    }
    expect(ECOLOGY.get('swinub')!.method).toBe('wild');
    expect(ECOLOGY.get('slugma')!.method).toBe('wild');
    expect(ECOLOGY.get('dragonite')!.biomes).toContain('sanctuary');
  });
  it('Arceus waits at Lv80 in the Temple of Origin, whose hidden gate stands in the Legendary Sanctuary', () => {
    const site = REGION_DEFS['origin-temple'].legendaries!.find((l) => l.id === 'arceus')!;
    expect(site.level).toBe(80);
    expect(LEGENDS.get('arceus')!.site!.region).toBe('origin-temple');
    expect(REGION_DEFS['legendary-sanctuary'].secrets!.some((s) => s.to === 'origin-temple')).toBe(true);
    expect(REGION_DEFS['origin-temple'].portals![0].to).toBe('legendary-sanctuary');
    expect(REGION_DEFS['starter-valley'].legendaries!.some((l) => l.id === 'arceus')).toBe(false);
  });
});

describe('rivers, bridges and cone attacks', () => {
  it('rivers block the way except where a path crosses them (bridge)', async () => {
    const { ValleyMap: VM } = await import('../src/core/map/valley');
    for (const id of ['frozen-mountains', 'volcanic-lands']) {
      const m = new VM(REGION_DEFS[id]);
      let bridges = 0, river = 0;
      for (let y = 2; y < m.heightTiles - 2; y++) for (let x = 2; x < m.widthTiles - 2; x++) {
        const t = m.terrainAt(x, y);
        if (t === T.Bridge) { bridges++; expect(m.solidAt(x, y)).toBe(false); }
        if ((t === T.Water || t === T.Lava) && y > 40) river++;
      }
      expect(bridges, id).toBeGreaterThan(0);
      expect(river, id).toBeGreaterThan(30);
    }
  });
  it('cone skills hit opponents in front, not behind', async () => {
    const { World, STEP } = await import('../src/core/world');
    const { getSkill } = await import('../src/core/data');
    const { makeWildState } = await import('../src/core/wildAI');
    const w = new World({ mode: 'adventure', seed: 2, width: 3000, height: 3000 });
    const u = w.addPokemon('lapras', { level: 40 });
    u.x = 1500; u.y = 1500;
    const mk = (dx: number) => { const e = w.spawnWild('pidgey', 20, 1500 + dx, 1500, { wild: makeWildState(1500 + dx, 1500, 'timid', {}), hostile: true }); e.maxHp = e.hp = 1e6; e.moveSpeed = 0; return e; };
    const front = mk(120), back = mk(-120);
    w.step(STEP); // builds the spatial grid the hit queries use
    front.x = 1620; front.y = 1500; back.x = 1380; back.y = 1500; u.x = 1500; u.y = 1500;
    const sk = getSkill('icy_wind');
    expect(sk.kind).toBe('cone');
    (w as unknown as { execute: (a: unknown, s: unknown, x: number, y: number, t: unknown) => void }).execute(u, { def: sk, cd: 0, level: 1, powerBonus: 0 }, front.x, front.y, front);
    expect(front.hp).toBeLessThan(1e6);
    expect(back.hp).toBe(1e6);
  });
});
