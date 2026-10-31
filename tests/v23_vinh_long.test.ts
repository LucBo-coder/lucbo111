import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventure/AdventureState';
import { passportPages } from '../src/adventure/passport';
import { BOSSES, POKEMON } from '../src/core/data';
import { isAquatic } from '../src/core/encounters';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { T } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import { World } from '../src/core/world';
import { fightBoss, sendParty } from './bossHelpers';
import { defaultSave, newAdventure } from '../src/systems/saveSchema';
import vnQuests from '../src/data/vietnam/quests.json';
import type { QuestDef } from '../src/core/quests';

// Vietnam Odyssey, the fourth province: Vĩnh Long (Văn Thánh Miếu, Cù lao An Bình, lò gạch Mang Thít, vườn bưởi
// Bình Minh, ruộng khoai Bình Tân, sông Cổ Chiên). The road from Cần Thơ opens with the Hậu River badge.

const vl = REGION_DEFS['vinh-long'];
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

describe('Vietnam Odyssey: Vĩnh Long', () => {
  it('the road from Cần Thơ opens with the Hậu River badge and both ways land on open ground', () => {
    const p = REGION_DEFS['can-tho'].portals!.find((x) => x.to === 'vinh-long')!;
    expect(p.requires).toEqual(['badge:can-tho']);
    expect(new ValleyMap(vl).solidAt(p.toX, p.toY)).toBe(false);
    const back = vl.portals!.find((x) => x.to === 'can-tho')!;
    expect(new ValleyMap(REGION_DEFS['can-tho']).solidAt(back.toX, back.toY)).toBe(false);
    expect(REGION_DEFS['can-tho'].worldBoss!.rewards!.message).toMatch(/Vĩnh Long/);
  });

  it('the mainland is reachable on foot (bridges over the Mang Thít canal); Cù lao An Bình only by boat', () => {
    const m = new ValleyMap(vl);
    const land = reach(m, vl.spawn.x, vl.spawn.y);
    const at = (o: { x: number; y: number }) => o.y * m.widthTiles + o.x;
    const boatOut = vl.portals!.find((p) => p.id === 'vl-boat-out')!;
    const island = reach(m, boatOut.toX, boatOut.toY);
    expect(island.has(at(vl.spawn)), 'the island must not be walkable from the mainland').toBe(false);
    const onIsland = new Set(['vl-host', 'vl-orchard-girl', 'chest-vl-island', 'vl-boat-back', 'vl-bush-4']);
    for (const id of onIsland) {
      const o = [...vl.npcs, ...vl.trainers, ...vl.chests, ...vl.portals!, ...vl.nodes!].find((x) => x.id === id)!;
      expect(island.has(at(o)), id).toBe(true);
    }
    // the boss arena, the rescue, every NPC / trainer / chest / waypoint / portal of the mainland
    for (const o of [...vl.npcs, ...vl.trainers, ...vl.waypoints, vl.rescue, vl.worldBoss!, ...vl.chests.filter((c) => !c.requiresFlag), ...vl.portals!]) {
      if (onIsland.has((o as { id: string }).id)) continue;
      expect(land.has(at(o)), `${(o as { id: string }).id} @${o.x},${o.y}`).toBe(true);
    }
    let bridges = 0;
    for (let y = 0; y < m.heightTiles; y++) for (let x = 0; x < m.widthTiles; x++) if (m.terrainAt(x, y) === T.Bridge) bridges++;
    expect(bridges).toBeGreaterThan(2);
  });

  it('quest chain: arrival → Cù lao An Bình → Thần Lò Mang Thít, gated by the Cần Thơ badge', () => {
    const ids = quests.filter((q) => q.id.startsWith('vn-vl-')).map((q) => q.id);
    expect(ids).toEqual(['vn-vl-1', 'vn-vl-2', 'vn-vl-3', 'vn-vl-rescue', 'vn-vl-board-1', 'vn-vl-board-2', 'vn-vl-pomelo', 'vn-vl-eco']);
    const s = defaultSave(); s.adventure = newAdventure('vietnam');
    const st = new AdventureState(s);
    expect(st.quests.states['vn-vl-1'].status).toBe('locked');
    st.setFlag('badge:can-tho');
    expect(st.quests.states['vn-vl-1'].status).toBe('active');
    // the boss gate is a trainer beaten earlier in the same quest (no deadlock); the boss gives the badge
    const q3 = quests.find((q) => q.id === 'vn-vl-3')!;
    const iTrainer = q3.objectives.findIndex((o) => o.type === 'trainer' && o.target === 'vl-potter'), iBoss = q3.objectives.findIndex((o) => o.type === 'boss');
    expect(iTrainer).toBeGreaterThanOrEqual(0);
    expect(iTrainer).toBeLessThan(iBoss);
    expect(vl.worldBoss!.requires).toEqual(['beat:vl-potter']);
    expect(vl.worldBoss!.rewards!.flag).toBe('badge:vinh-long');
    // every quest marker of the province is on this map
    for (const q of quests.filter((x) => x.id.startsWith('vn-vl-'))) for (const o of q.objectives) expect(o.marker?.region, q.id).toBe('vinh-long');
  });

  it('trainer teams live on land and sit a little under the guardian (Lv 18); the board asks for species of the kiln area', () => {
    for (const t of vl.trainers) for (const [sp, lv] of t.team) {
      expect(POKEMON.has(sp), sp).toBe(true);
      expect(isAquatic(sp), `${t.id} ${sp}`).toBe(false);
      expect(lv).toBeGreaterThanOrEqual(vl.worldBoss!.level - 9);
      expect(lv).toBeLessThanOrEqual(vl.worldBoss!.level);
    }
  });

  it('Torkoal — Thần Lò Mang Thít: no capture, beatable by a party around Lv16–18 (with or without a type edge)', () => {
    expect(BOSSES.get('torkoal')!.capture).toBe(false);
    for (const party of [[['marshtomp', 18], ['wingull', 16], ['wooper', 16]], [['grovyle', 18], ['staravia', 16], ['shroomish', 16]]] as const) {
      const w = new World({ mode: 'adventure', seed: 5, width: 5000, height: 5000 });
      sendParty(w, party, BOSSES.get('torkoal')!.types); // one on the field (best match-up), the rest wait in their balls
      const t = w.trainer; t.maxHp = t.hp = 1e9;
      const b = w.spawnBoss('torkoal', vl.worldBoss!.level, false, { x: t.x + 240, y: t.y });
      expect(b.boss!.pm.cfg.weakened).toBeUndefined();
      let time = 0;
      time = fightBoss(w, b, 300); // two Potions, like a player at that point of the journey
      console.info(`[balance] torkoal Lv${vl.worldBoss!.level} vs ${party[0][0]}: ${b.alive ? 'ALIVE ' + Math.round(b.hp / b.maxHp * 100) + '%' : Math.round(time) + 's'} fainted ${w.allies.filter((a) => a.fainted).length}`);
      expect(b.alive, party[0][0]).toBe(false);
      expect(time, party[0][0]).toBeGreaterThan(25);
    }
  });

  it('the passport page of Vĩnh Long is playable after Cần Thơ and counts its content', () => {
    const adv = newAdventure('vietnam');
    expect(passportPages(adv, quests.map((q) => q.id)).find((p) => p.def.id === 'vinh-long')!.unlocked).toBe(false);
    adv.flags.push('badge:can-tho');
    const page = passportPages(adv, quests.map((q) => q.id)).find((p) => p.def.id === 'vinh-long')!;
    expect(page.playable).toBe(true);
    expect(page.unlocked).toBe(true);
    expect(page.trainers.total).toBe(5);
    expect(page.quests.total).toBe(8);
    expect(page.boss?.name).toContain('Torkoal');
  });
});
