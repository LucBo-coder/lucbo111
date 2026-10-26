import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventure/AdventureState';
import { BOSSES, POKEMON } from '../src/core/data';
import { eligible, REGIONS, regionOfArea } from '../src/core/encounters';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { T } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import { STEP, World } from '../src/core/world';
import vnQuests from '../src/data/vietnam/quests.json';
import type { QuestDef } from '../src/core/quests';
import { defaultSave, migrate, newAdventure } from '../src/systems/saveSchema';

const VN = ['ca-mau', 'an-giang', 'can-tho'];
const quests = vnQuests as unknown as QuestDef[];

describe('Vietnam Odyssey mode', () => {
  it('campaigns are separate: own start, own quest book, old saves stay classic', () => {
    const vn = newAdventure('vietnam');
    expect(vn.region).toBe('ca-mau');
    expect(vn.lastWaypoint).toBe('wp-ca-mau-center');
    const s = defaultSave(); s.adventure = vn;
    const st = new AdventureState(s);
    const ids = Object.keys(st.adv.quests);
    expect(ids.every((id) => id.startsWith('vn-'))).toBe(true);
    expect(st.quests.active().map((q) => q.id)).toContain('vn-cm-1');
    const c = defaultSave(); c.adventure = newAdventure();
    expect(Object.keys(new AdventureState(c).adv.quests).some((id) => id.startsWith('vn-'))).toBe(false);
    // a v6 save without the field loads as the classic journey
    const old = migrate({ ...defaultSave(), adventure: { ...newAdventure(), campaign: undefined } });
    expect(old.adventure!.campaign).toBe('classic');
  });

  it('maps: every object on open ground, both waypoints reachable, Phú Quốc is an island with a ferry', () => {
    for (const id of VN) {
      const d = REGION_DEFS[id];
      const m = new ValleyMap(d);
      for (const s of [d.spawn, ...d.npcs, ...d.trainers, ...d.chests, ...d.waypoints, ...(d.portals ?? [])])
        expect(m.solidAt(s.x, s.y), `${id} ${JSON.stringify(s).slice(0, 50)}`).toBe(false);
      for (const p of d.portals ?? []) expect(new ValleyMap(REGION_DEFS[p.to]).solidAt(p.toX, p.toY), `${id} → ${p.id}`).toBe(false);
      for (const a of d.areas) if (a.habitat !== 'village') expect(regionOfArea(a.id), a.id).toBeTruthy();
    }
    const ag = new ValleyMap(REGION_DEFS['an-giang']);
    expect(ag.terrainAt(16, 76)).not.toBe(T.Water); // island core
    expect(ag.terrainAt(36, 76)).toBe(T.Water); // strait between island and mainland
    const cm = new ValleyMap(REGION_DEFS['ca-mau']);
    let water = 0; for (let y = 90; y < 112; y++) for (let x = 0; x < 30; x++) if (cm.terrainAt(x, y) === T.Water) water++;
    expect(water).toBeGreaterThan(200); // sea at the southern tip
  });

  it('spawns: Lv1–18 (Cần Thơ ≤ 26), no Ice types in the tropical provinces, never legendaries', () => {
    for (const r of [...REGIONS.values()].filter((x) => x.id.startsWith('vn-'))) {
      const pool = eligible({ biome: r.biome, night: false, weather: 'clear' } as never, r);
      expect(pool.length, r.id).toBeGreaterThan(8);
      expect(pool.some((e) => POKEMON.get(e.id)?.types.includes('ice')), r.id).toBe(false);
      expect(pool.every((e) => !e.legendary && !e.mythical)).toBe(true);
      expect(r.level[1]).toBeLessThanOrEqual(r.id.startsWith('vn-ct-') ? 26 : 18);
    }
  });

  it('quests reference real NPCs, trainers, species, areas, puzzles and bosses; the route is gated by badges', () => {
    const d = VN.map((id) => REGION_DEFS[id]);
    const npcs = new Set(d.flatMap((r) => r.npcs.map((n) => n.id)));
    const trainers = new Set(d.flatMap((r) => r.trainers.map((t) => t.id)));
    const areas = new Set(d.flatMap((r) => r.areas.map((a) => a.id)));
    const wps = new Set(d.flatMap((r) => r.waypoints.map((w) => w.id)));
    const docks = new Set(d.flatMap((r) => (r.docks ?? []).map((k) => 'dock:' + k.id)));
    const ids = new Set(quests.map((q) => q.id));
    expect(ids.size).toBe(quests.length);
    for (const q of quests) {
      if (q.giver) expect(npcs.has(q.giver), q.id).toBe(true);
      for (const r of q.requires ?? []) expect(ids.has(r), q.id).toBe(true);
      for (const o of q.objectives) {
        const t = o.target!;
        if (o.type === 'talk') expect(npcs.has(t), `${q.id} ${t}`).toBe(true);
        if (o.type === 'trainer') expect(trainers.has(t), `${q.id} ${t}`).toBe(true);
        if ((o.type === 'capture' || o.type === 'defeat') && t !== '*') expect(POKEMON.has(t), `${q.id} ${t}`).toBe(true);
        // explore: an area, or 'dock:<id>' = landing at a boat dock
        if (o.type === 'explore') expect(areas.has(t) || docks.has(t), `${q.id} ${t}`).toBe(true);
        if (o.type === 'activate') expect(wps.has(t), `${q.id} ${t}`).toBe(true);
        if (o.type === 'boss') expect(BOSSES.has(t), `${q.id} ${t}`).toBe(true);
        if (o.marker) expect(VN).toContain(o.marker.region);
      }
    }
    expect(quests.find((q) => q.id === 'vn-cm-1')!.starter).toEqual(['treecko', 'torchic', 'mudkip']);
    expect(REGION_DEFS['ca-mau'].portals!.find((p) => p.to === 'an-giang')!.requires).toEqual(['badge:ca-mau']);
    expect(REGION_DEFS['ca-mau'].worldBoss!.rewards!.flag).toBe('badge:ca-mau');
    expect(REGION_DEFS['an-giang'].worldBoss!.requires).toEqual(['puzzle:ag-temple-seal']);
  });

  it('regional bosses: phases, no capture window, beatable by a starter-level party', () => {
    for (const [id, lv, party] of [['seviper', 12, [['mudkip', 13], ['wooper', 11], ['lotad', 11]]], ['claydol', 20, [['marshtomp', 20], ['buizel', 18], ['geodude', 18]]]] as const) {
      const w = new World({ mode: 'adventure', seed: 5, width: 5000, height: 5000 });
      for (const [sp, l] of party) w.addPokemon(sp, { level: l });
      const t = w.trainer; t.maxHp = t.hp = 1e9;
      const b = w.spawnBoss(id, lv, false, { x: t.x + 240, y: t.y });
      expect(b.boss!.pm.cfg.weakened, id).toBeUndefined();
      let time = 0;
      for (let i = 0; i < 60 * 240 && b.alive; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); time += STEP; }
      const fainted = w.allies.filter((a) => a.fainted).length;
      console.info(`[balance] ${id} Lv${lv}: ${b.alive ? 'ALIVE ' + Math.round(b.hp / b.maxHp * 100) + '%' : Math.round(time) + 's'} fainted ${fainted}`);
      expect(b.alive, id).toBe(false);
      expect(time, id).toBeGreaterThan(20);
    }
  });
});

describe('Vietnam Odyssey: no progression deadlock', () => {
  it('a boss gate never depends on a reward of the quest that asks for that boss', () => {
    for (const id of VN) {
      const wb = REGION_DEFS[id].worldBoss!;
      const q = quests.find((x) => x.objectives.some((o) => o.type === 'boss' && o.target === wb.id))!;
      for (const f of wb.requires ?? []) expect(q.rewards.flags ?? [], `${id} ${f}`).not.toContain(f);
      // every gate is something the player can do before the boss: beat a trainer of the map or solve its puzzle
      for (const f of wb.requires ?? []) {
        const ok = (f.startsWith('beat:') && REGION_DEFS[id].trainers.some((t) => 'beat:' + t.id === f)) || (f.startsWith('puzzle:') && REGION_DEFS[id].puzzles.some((p) => 'puzzle:' + p.id === f));
        expect(ok, f).toBe(true);
      }
    }
  });
});

describe('Vietnam Odyssey: rendering', () => {
  it('Mekong maps use green ground, dirt paths, mangrove / melaleuca trees — never another theme\'s tiles', async () => {
    const { EX, TOWN } = await import('../src/core/map/tiles');
    const foreign = new Set<number>([EX.sanctum, EX.sanctum2, EX.snow, EX.snow2, EX.ash, EX.ash2, EX.ruin, EX.ruin2]);
    for (const id of VN) {
      const m = new ValleyMap(REGION_DEFS[id]);
      const used = new Set<number>();
      for (let y = 0; y < m.heightTiles; y += 2) for (let x = 0; x < m.widthTiles; x += 2) {
        const t = m.terrainAt(x, y);
        if (t === T.Ruin) continue; // the (fictional) temple ruins of An Giang are paved on purpose
        used.add(m.tileIndexAt(x, y, 0));
      }
      expect([...used].filter((i) => foreign.has(i)), id).toEqual([]);
      expect(used.has(TOWN.grass[0]), id).toBe(true);
      const trees = new Set<number>();
      for (let cy = 0; cy < 7; cy++) for (let cx = 0; cx < 8; cx++) for (const o of m.objectsInChunk(cx, cy)) if (o.kind === 'tree' && o.tile != null) trees.add(o.tile);
      expect(trees.has(EX.melaleuca), id).toBe(true);
      if (id === 'ca-mau') expect(trees.has(EX.mangrove)).toBe(true);
    }
  });
});
