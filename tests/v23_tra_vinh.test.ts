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

// Vietnam Odyssey, the fifth province: Trà Vinh (Ao Bà Om, Chùa Âng, Chùa Hang, biển Ba Động, dừa sáp Cầu Kè, rừng
// ngập mặn Duyên Hải). The road from Vĩnh Long opens with the Red Clay badge.

const tv = REGION_DEFS['tra-vinh'];
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

describe('Vietnam Odyssey: Trà Vinh', () => {
  it('the road from Vĩnh Long opens with the Red Clay badge and both ways land on open ground', () => {
    const p = REGION_DEFS['vinh-long'].portals!.find((x) => x.to === 'tra-vinh')!;
    expect(p.requires).toEqual(['badge:vinh-long']);
    expect(new ValleyMap(tv).solidAt(p.toX, p.toY)).toBe(false);
    const back = tv.portals!.find((x) => x.to === 'vinh-long')!;
    expect(new ValleyMap(REGION_DEFS['vinh-long']).solidAt(back.toX, back.toY)).toBe(false);
    expect(REGION_DEFS['vinh-long'].worldBoss!.rewards!.message).toMatch(/Trà Vinh/);
    // the next road (Bến Tre) is there but sealed
    expect(tv.portals!.find((x) => x.id === 'portal-tv-next')!.requires).toEqual(['vn:ben-tre-open']);
  });

  it('every NPC, trainer, chest, waypoint, portal, gathering spot and the boss grove is reachable on foot', () => {
    const m = new ValleyMap(tv);
    const land = reach(m, tv.spawn.x, tv.spawn.y);
    const at = (o: { x: number; y: number }) => o.y * m.widthTiles + o.x;
    for (const o of [...tv.npcs, ...tv.trainers, ...tv.waypoints, tv.rescue, tv.worldBoss!, ...tv.chests.filter((c) => !c.requiresFlag), ...tv.portals!, ...tv.nodes!]) {
      expect(land.has(at(o)), `${(o as { id: string }).id} @${o.x},${o.y}`).toBe(true);
    }
    // Ao Bà Om is a pond (water), the Cổ Chiên and the Duyên Hải canal are crossed on bridges, the sea is in the east
    expect(m.terrainAt(15, 87)).toBe(T.Water);
    expect(m.terrainAt(124, 56)).not.toBe(T.Grass);
    let bridges = 0;
    for (let y = 0; y < m.heightTiles; y++) for (let x = 0; x < m.widthTiles; x++) if (m.terrainAt(x, y) === T.Bridge) bridges++;
    expect(bridges).toBeGreaterThan(4);
  });

  it('quest chain: arrival → Chùa Hang → Thần Cây Dầu, gated by the Vĩnh Long badge', () => {
    const ids = quests.filter((q) => q.id.startsWith('vn-tv-')).map((q) => q.id);
    expect(ids).toEqual(['vn-tv-1', 'vn-tv-2', 'vn-tv-3', 'vn-tv-rescue', 'vn-tv-board-1', 'vn-tv-board-2', 'vn-tv-sea', 'vn-tv-coconut', 'vn-tv-eco']);
    const s = defaultSave(); s.adventure = newAdventure('vietnam');
    const st = new AdventureState(s);
    expect(st.quests.states['vn-tv-1'].status).toBe('locked');
    st.setFlag('badge:vinh-long');
    expect(st.quests.states['vn-tv-1'].status).toBe('active');
    const q3 = quests.find((q) => q.id === 'vn-tv-3')!;
    const iTrainer = q3.objectives.findIndex((o) => o.type === 'trainer' && o.target === 'tv-keeper'), iBoss = q3.objectives.findIndex((o) => o.type === 'boss');
    expect(iTrainer).toBeGreaterThanOrEqual(0);
    expect(iTrainer).toBeLessThan(iBoss);
    expect(tv.worldBoss!.requires).toEqual(['beat:tv-keeper']);
    expect(tv.worldBoss!.rewards!.flag).toBe('badge:tra-vinh');
    for (const q of quests.filter((x) => x.id.startsWith('vn-tv-'))) for (const o of q.objectives) expect(o.marker?.region, q.id).toBe('tra-vinh');
    // the three passport landmarks come from quests of the province
    const flags = quests.filter((x) => x.id.startsWith('vn-tv-')).flatMap((q) => q.rewards.flags ?? []);
    expect(flags.sort()).toEqual(['landmark:ao-ba-om', 'landmark:ba-dong', 'landmark:chua-hang']);
  });

  it('trainer teams live on land and fit Lv28–34; capture targets live on the Ba Động coast', () => {
    for (const t of tv.trainers) for (const [sp, lv] of t.team) {
      expect(POKEMON.has(sp), sp).toBe(true);
      expect(isAquatic(sp), `${t.id} ${sp}`).toBe(false);
      expect(lv).toBeGreaterThanOrEqual(28);
      expect(lv).toBeLessThanOrEqual(34);
    }
    for (const sp of ['wingull', 'krabby']) expect(POKEMON.has(sp)).toBe(true);
  });

  it('Trevenant — Thần Cây Dầu: no capture, beatable by a party around Lv32–34 (with or without a type edge)', () => {
    expect(BOSSES.get('trevenant')!.capture).toBe(false);
    for (const party of [[['combusken', 34], ['staravia', 32], ['murkrow', 32]], [['marshtomp', 34], ['pelipper', 32], ['quagsire', 32]]] as const) {
      const w = new World({ mode: 'adventure', seed: 5, width: 5000, height: 5000 });
      for (const [sp, l] of party) w.addPokemon(sp, { level: l });
      const t = w.trainer; t.maxHp = t.hp = 1e9;
      const b = w.spawnBoss('trevenant', tv.worldBoss!.level, false, { x: t.x + 240, y: t.y });
      expect(b.boss!.pm.cfg.weakened).toBeUndefined();
      let time = 0;
      for (let i = 0; i < 60 * 300 && b.alive; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); time += STEP; }
      console.info(`[balance] trevenant Lv${tv.worldBoss!.level} vs ${party[0][0]}: ${b.alive ? 'ALIVE ' + Math.round(b.hp / b.maxHp * 100) + '%' : Math.round(time) + 's'} fainted ${w.allies.filter((a) => a.fainted).length}`);
      expect(b.alive, party[0][0]).toBe(false);
      expect(time, party[0][0]).toBeGreaterThan(25);
    }
  });

  it('the passport page of Trà Vinh is playable after Vĩnh Long and counts its content', () => {
    const adv = newAdventure('vietnam');
    expect(passportPages(adv, quests.map((q) => q.id)).find((p) => p.def.id === 'tra-vinh')!.unlocked).toBe(false);
    adv.flags.push('badge:vinh-long');
    const page = passportPages(adv, quests.map((q) => q.id)).find((p) => p.def.id === 'tra-vinh')!;
    expect(page.playable).toBe(true);
    expect(page.unlocked).toBe(true);
    expect(page.trainers.total).toBe(5);
    expect(page.quests.total).toBe(9);
    expect(page.boss?.name).toContain('Trevenant');
  });
});
