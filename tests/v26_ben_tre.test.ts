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
import conservation from '../src/data/vietnam/conservation.json';
import type { QuestDef } from '../src/core/quests';

// Vietnam Odyssey, the sixth province: Bến Tre (xứ dừa: làng kẹo dừa, vườn dừa Thới Sơn, rừng tràm, sông Hàm Luông,
// bờ nam sông Cổ Chiên). The road from Trà Vinh crosses the Cổ Chiên bridge once the Cây Dầu badge is won.

const bt = REGION_DEFS['ben-tre'];
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

describe('Vietnam Odyssey: Bến Tre', () => {
  it('the road from Trà Vinh opens with the Cây Dầu badge and both ways land on open ground', () => {
    const out = tv.portals!.find((x) => x.id === 'portal-tv-next')!;
    expect(out.to).toBe('ben-tre');
    expect(out.requires).toEqual(['badge:tra-vinh']);
    expect(new ValleyMap(bt).solidAt(out.toX, out.toY)).toBe(false);
    const back = bt.portals!.find((x) => x.to === 'tra-vinh')!;
    expect(new ValleyMap(tv).solidAt(back.toX, back.toY)).toBe(false);
    // the bridge tile is where the road from the south bank meets the Cổ Chiên
    const m = new ValleyMap(bt);
    expect(m.terrainAt(back.x, back.y)).not.toBe(T.Water);
  });

  it('every NPC, trainer, chest, waypoint, portal, dock, gathering spot and the boss grove is reachable on foot', () => {
    const m = new ValleyMap(bt);
    const land = reach(m, bt.spawn.x, bt.spawn.y);
    const at = (o: { x: number; y: number }) => o.y * m.widthTiles + o.x;
    for (const o of [...bt.npcs, ...bt.trainers, ...bt.waypoints, bt.rescue, bt.worldBoss!, ...bt.chests, ...bt.portals!, ...bt.nodes!, ...bt.docks!]) {
      expect(land.has(at(o)), `${(o as { id: string }).id} @${o.x},${o.y}`).toBe(true);
    }
    // the Cổ Chiên and the Hàm Luông are crossed on bridges; the south bank is mangrove, not water
    let bridges = 0;
    for (let y = 0; y < m.heightTiles; y++) for (let x = 0; x < m.widthTiles; x++) if (m.terrainAt(x, y) === T.Bridge) bridges++;
    expect(bridges).toBeGreaterThan(4);
  });

  it('quest chain: arrival → coconut grove → Thần Dừa Trăm Thân, gated by the Cây Dầu badge', () => {
    const ids = quests.filter((q) => q.id.startsWith('vn-bt-')).map((q) => q.id);
    expect(ids).toEqual(['vn-bt-1', 'vn-bt-2', 'vn-bt-3', 'vn-bt-rescue', 'vn-bt-candy', 'vn-bt-river', 'vn-bt-eco']);
    const s = defaultSave(); s.adventure = newAdventure('vietnam');
    const st = new AdventureState(s);
    expect(st.quests.states['vn-bt-1'].status).toBe('locked');
    st.setFlag('badge:tra-vinh');
    expect(st.quests.states['vn-bt-1'].status).toBe('active');
    const q3 = quests.find((q) => q.id === 'vn-bt-3')!;
    const iTrainer = q3.objectives.findIndex((o) => o.type === 'trainer' && o.target === 'bt-forest-ranger');
    const iBoss = q3.objectives.findIndex((o) => o.type === 'boss' && o.target === 'exeggutor');
    expect(iTrainer).toBeGreaterThanOrEqual(0);
    expect(iTrainer).toBeLessThan(iBoss);
    expect(bt.worldBoss!.requires).toEqual(['beat:bt-forest-ranger']);
    expect(bt.worldBoss!.rewards!.flag).toBe('badge:ben-tre');
    for (const q of quests.filter((x) => x.id.startsWith('vn-bt-'))) for (const o of q.objectives) expect(o.marker?.region, q.id).toBe('ben-tre');
    // the three passport landmarks come from quests of the province
    const flags = quests.filter((x) => x.id.startsWith('vn-bt-')).flatMap((q) => q.rewards.flags ?? []);
    expect(flags.sort()).toEqual(['landmark:cau-co-chien', 'landmark:ham-luong', 'landmark:keo-dua']);
  });

  it('trainer teams live on land and sit a little under the guardian (Lv 23); the rescue is a bird of the river', () => {
    for (const t of bt.trainers) for (const [sp, lv] of t.team) {
      expect(POKEMON.has(sp), sp).toBe(true);
      expect(isAquatic(sp), `${t.id} ${sp}`).toBe(false);
      expect(lv).toBeGreaterThanOrEqual(bt.worldBoss!.level - 9);
      expect(lv).toBeLessThanOrEqual(bt.worldBoss!.level);
    }
    expect(POKEMON.has(bt.rescue.species)).toBe(true);
  });

  it('Exeggutor — Dừa Trăm Thân: no capture, beatable by a party around Lv21–23', () => {
    expect(BOSSES.get('exeggutor')!.capture).toBe(false);
    for (const party of [[['combusken', 23], ['staravia', 21], ['deerling', 21]], [['breloom', 23], ['gyarados', 21], ['wingull', 21]]] as const) {
      const w = new World({ mode: 'adventure', seed: 5, width: 5000, height: 5000 });
      sendParty(w, party, BOSSES.get('exeggutor')!.types); // one on the field (best match-up), the rest wait in their balls
      const t = w.trainer; t.maxHp = t.hp = 1e9;
      const b = w.spawnBoss('exeggutor', bt.worldBoss!.level, false, { x: t.x + 240, y: t.y });
      expect(b.boss!.pm.cfg.weakened).toBeUndefined();
      let time = 0;
      time = fightBoss(w, b, 300); // two Potions, like a player at that point of the journey
      console.info(`[balance] exeggutor Lv${bt.worldBoss!.level} vs ${party[0][0]}: ${b.alive ? 'ALIVE ' + Math.round(b.hp / b.maxHp * 100) + '%' : Math.round(time) + 's'}`);
      expect(b.alive, party[0][0]).toBe(false);
      expect(time, party[0][0]).toBeGreaterThan(25);
    }
  });

  it('the passport page of Bến Tre is playable after Trà Vinh and counts its content', () => {
    const adv = newAdventure('vietnam');
    expect(passportPages(adv, quests.map((q) => q.id)).find((p) => p.def.id === 'ben-tre')!.unlocked).toBe(false);
    adv.flags.push('badge:tra-vinh');
    const page = passportPages(adv, quests.map((q) => q.id)).find((p) => p.def.id === 'ben-tre')!;
    expect(page.playable).toBe(true);
    expect(page.unlocked).toBe(true);
    expect(page.trainers.total).toBe(5);
    expect(page.quests.total).toBe(7);
    expect(page.boss?.name).toContain('Exeggutor');
  });

  it('six restoration sites in the Hàm Luông, linked to the eco quest', () => {
    const sites = (conservation as unknown as { provinces: Record<string, { sites: { id: string }[] }> }).provinces['ben-tre'].sites;
    expect(sites).toHaveLength(6);
    expect(new Set(sites.map((s) => s.id)).size).toBe(6);
    const eco = quests.find((q) => q.id === 'vn-bt-eco')!;
    expect(eco.objectives[0].target).toBe('eco:ben-tre');
    expect(eco.objectives[0].count).toBe(6);
  });
});
