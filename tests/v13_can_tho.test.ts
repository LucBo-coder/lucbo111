import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventure/AdventureState';
import { passportPages } from '../src/adventure/passport';
import { BOSSES, POKEMON } from '../src/core/data';
import { isAquatic } from '../src/core/encounters';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { T } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import { STEP, World } from '../src/core/world';
import { defaultSave, newAdventure } from '../src/systems/saveSchema';
import vnQuests from '../src/data/vietnam/quests.json';
import type { QuestDef } from '../src/core/quests';

const ct = REGION_DEFS['can-tho'];
const quests = vnQuests as unknown as QuestDef[];

/** Walkable tiles reachable from (x, y). */
function reach(m: ValleyMap, x: number, y: number): Set<number> {
  const seen = new Set<number>([y * m.widthTiles + x]);
  const q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = ny * m.widthTiles + nx;
      if (nx < 0 || ny < 0 || nx >= m.widthTiles || ny >= m.heightTiles || seen.has(k) || m.solidAt(nx, ny)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

describe('Vietnam Odyssey: Cần Thơ', () => {
  it('the road from An Giang opens with the Bảy Núi badge and leads to open ground', () => {
    const p = REGION_DEFS['an-giang'].portals!.find((x) => x.to === 'can-tho')!;
    expect(p.requires).toEqual(['badge:an-giang']);
    expect(new ValleyMap(ct).solidAt(p.toX, p.toY)).toBe(false);
    expect(REGION_DEFS['an-giang'].worldBoss!.rewards!.flag).toBe('badge:an-giang');
  });

  it('everything on the mainland is reachable on foot; Cồn Sơn is an island reached by boat', () => {
    const m = new ValleyMap(ct);
    const land = reach(m, ct.spawn.x, ct.spawn.y);
    const at = (o: { x: number; y: number }) => o.y * m.widthTiles + o.x;
    const boatOut = ct.portals!.find((p) => p.id === 'ct-boat-out')!, boatBack = ct.portals!.find((p) => p.id === 'ct-boat-back')!;
    const island = reach(m, boatOut.toX, boatOut.toY);
    expect(island.has(at(ct.spawn)), 'island must not be walkable from the mainland').toBe(false);
    expect(island.has(at(boatBack))).toBe(true);
    expect(island.has(at(ct.worldBoss!))).toBe(true);
    expect(island.has(at(ct.chests.find((c) => c.id === 'chest-ct-island')!))).toBe(true);
    for (const o of [...ct.npcs, ...ct.trainers, ...ct.waypoints, ct.rescue, ...ct.chests.filter((c) => c.id !== 'chest-ct-island'), ...ct.portals!.filter((p) => p !== boatBack)])
      expect(land.has(at(o)), `${'id' in o ? o.id : ''} @${o.x},${o.y}`).toBe(true);
    // the Hậu River separates them; the Cần Thơ River is crossed by a bridge on the road to the floating market
    expect(m.terrainAt(106, 24)).toBe(T.Water);
    let bridges = 0;
    for (let y = 0; y < m.heightTiles; y++) for (let x = 0; x < m.widthTiles; x++) if (m.terrainAt(x, y) === T.Bridge) bridges++;
    expect(bridges).toBeGreaterThan(4);
  });

  it('quest chain: arrival → floating market → Chúa Sông Hậu, gated by the An Giang badge', () => {
    const ids = quests.filter((q) => q.id.startsWith('vn-ct-')).map((q) => q.id);
    expect(ids).toEqual(['vn-ct-1', 'vn-ct-2', 'vn-ct-3', 'vn-ct-rescue', 'vn-ct-board-1', 'vn-ct-board-2']);
    const s = defaultSave(); s.adventure = newAdventure('vietnam');
    const st = new AdventureState(s);
    expect(st.quests.states['vn-ct-1'].status).toBe('locked');
    st.setFlag('badge:an-giang');
    expect(st.quests.states['vn-ct-1'].status).toBe('active');
    const boss = quests.find((q) => q.id === 'vn-ct-3')!;
    expect(boss.objectives.find((o) => o.type === 'boss')!.target).toBe('whiscash');
    // the boss gate is a trainer of the map, beaten in the quest *before* the boss quest (no deadlock)
    expect(ct.worldBoss!.requires).toEqual(['beat:ct-vendor']);
    expect(quests.find((q) => q.id === 'vn-ct-2')!.objectives.some((o) => o.type === 'trainer' && o.target === 'ct-vendor')).toBe(true);
    expect(ct.worldBoss!.rewards!.flag).toBe('badge:can-tho');
  });

  it('trainer teams live on land (no fish), levels fit Lv16–26', () => {
    for (const t of ct.trainers) for (const [sp, lv] of t.team) {
      expect(POKEMON.has(sp), sp).toBe(true);
      expect(isAquatic(sp), `${t.id} ${sp}`).toBe(false);
      expect(lv, `${t.id} ${sp}`).toBeGreaterThanOrEqual(16);
      expect(lv, `${t.id} ${sp}`).toBeLessThanOrEqual(26);
    }
  });

  it('Whiscash — Chúa Sông Hậu: 3 phases, no capture, beatable by a party around Lv22–24', () => {
    const b0 = BOSSES.get('whiscash')!;
    expect(b0.capture).toBe(false);
    // a grass party (4× weakness) and a party with no type advantage
    for (const party of [[['grovyle', 24], ['lombre', 22], ['breloom', 22]], [['marshtomp', 24], ['pelipper', 23], ['staravia', 22]]] as const) {
      const w = new World({ mode: 'adventure', seed: 5, width: 5000, height: 5000 });
      for (const [sp, l] of party) w.addPokemon(sp, { level: l });
      const t = w.trainer; t.maxHp = t.hp = 1e9;
      const b = w.spawnBoss('whiscash', ct.worldBoss!.level, false, { x: t.x + 240, y: t.y });
      expect(b.boss!.pm.cfg.weakened).toBeUndefined();
      let time = 0;
      for (let i = 0; i < 60 * 240 && b.alive; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); time += STEP; }
      console.info(`[balance] whiscash Lv${ct.worldBoss!.level} vs ${party[0][0]}: ${b.alive ? 'ALIVE ' + Math.round(b.hp / b.maxHp * 100) + '%' : Math.round(time) + 's'} fainted ${w.allies.filter((a) => a.fainted).length}`);
      expect(b.alive, party[0][0]).toBe(false);
      expect(time, party[0][0]).toBeGreaterThan(25);
    }
  });

  it('the passport page of Cần Thơ is playable and counts its content', () => {
    const adv = newAdventure('vietnam');
    adv.flags.push('badge:an-giang');
    const page = passportPages(adv, quests.map((q) => q.id)).find((p) => p.def.id === 'can-tho')!;
    expect(page.playable).toBe(true);
    expect(page.unlocked).toBe(true);
    expect(page.trainers.total).toBe(4);
    expect(page.quests.total).toBe(6);
    expect(page.boss?.name).toContain('Whiscash');
  });
});
