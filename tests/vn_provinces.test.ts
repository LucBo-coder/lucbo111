import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AdventureState, ITEMS } from '../src/adventure/AdventureState';
import { passportPages, VN_PROVINCES } from '../src/adventure/passport';
import { BOSSES, POKEMON } from '../src/core/data';
import { isAquatic, REGIONS } from '../src/core/encounters';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { World } from '../src/core/world';
import { fightBoss, sendParty } from './bossHelpers';
import { REP_REGIONS } from '../src/core/reputation';
import { defaultSave, newAdventure } from '../src/systems/saveSchema';
import vnQuests from '../src/data/vietnam/quests.json';
import conservation from '../src/data/vietnam/conservation.json';
import type { QuestDef } from '../src/core/quests';
import type { ProvinceSpec } from '../scripts/provinces/types';

// Every Vietnam Odyssey province made from a story spec (scripts/provinces/*.ts → scripts/gen-province.ts): the road
// in and out, everything reachable on foot, the quest chain, trainers, a beatable boss, passport, conservation.

const SPECS = Object.values(import.meta.glob<{ default: ProvinceSpec }>('../scripts/provinces/*.ts', { eager: true }))
  .map((m) => m.default).filter(Boolean)
  .sort((a, b) => VN_PROVINCES.findIndex((p) => p.id === a.id) - VN_PROVINCES.findIndex((p) => p.id === b.id));
const quests = vnQuests as unknown as QuestDef[];
const maps = new Map<string, ValleyMap>();
const mapOf = (id: string) => { let m = maps.get(id); if (!m) maps.set(id, (m = new ValleyMap(REGION_DEFS[id]))); return m; };

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

describe('Vietnam Odyssey: provinces from story specs', () => {
  it('the specs follow the passport route, one after the other', () => {
    expect(SPECS.length).toBeGreaterThan(0);
    for (const s of SPECS) {
      const i = VN_PROVINCES.findIndex((p) => p.id === s.id);
      expect(i, s.id).toBeGreaterThan(0);
      expect(VN_PROVINCES[i - 1].id, s.id).toBe(s.prev.id);
      expect(REGION_DEFS[s.id], s.id).toBeDefined();
    }
  });

  describe.each(SPECS.map((s) => [s.name, s] as const))('%s', (_name, s) => {
    const d = REGION_DEFS[s.id];
    const pre = `vn-${s.prefix}-`;
    const own = quests.filter((q) => q.id.startsWith(pre));
    const boss = d.worldBoss!;

    it('gates both ways land on open ground; the way in opens with the previous badge', () => {
      const gate = REGION_DEFS[s.prev.id].portals!.find((p) => p.id === s.prev.portal.id)!;
      expect(gate.to).toBe(s.id);
      expect(gate.requires).toEqual([`badge:${s.prev.id}`]);
      expect(mapOf(s.id).solidAt(gate.toX, gate.toY)).toBe(false);
      const back = d.portals!.find((p) => p.to === s.prev.id)!;
      expect(back, 'gate back').toBeDefined();
      expect(mapOf(s.prev.id).solidAt(back.toX, back.toY)).toBe(false);
      // the gate on the previous map can be walked to
      const pd = REGION_DEFS[s.prev.id], pm = mapOf(s.prev.id);
      expect(reach(pm, pd.spawn.x, pd.spawn.y).has(gate.y * pm.widthTiles + gate.x), 'gate reachable').toBe(true);
    });

    it('every NPC, trainer, chest, waypoint, portal, dock, node, the rescue and the boss are reachable on foot', () => {
      const m = mapOf(s.id), land = reach(m, d.spawn.x, d.spawn.y);
      const at = (o: { x: number; y: number }) => Math.floor(o.y) * m.widthTiles + Math.floor(o.x);
      expect(land.has(at(s.entry)), 'landing').toBe(true);
      for (const o of [...d.npcs, ...d.trainers, ...d.waypoints, d.rescue, boss, ...d.chests, ...d.portals!, ...(d.nodes ?? []), ...(d.docks ?? [])]) {
        expect(land.has(at(o)), `${(o as { id: string }).id} @${o.x},${o.y}`).toBe(true);
      }
      expect(d.waypoints.length).toBeGreaterThan(0);
      expect(d.trainers.length).toBeGreaterThanOrEqual(4);
    });

    it('quest chain: locked until the previous badge, trainer before the boss, three landmarks, valid rewards', () => {
      expect(own.map((q) => q.id)).toEqual(s.quests.map((q) => pre + q.id));
      const st = new AdventureState(Object.assign(defaultSave(), { adventure: newAdventure('vietnam') }));
      expect(st.quests.states[own[0].id].status).toBe('locked');
      st.setFlag(`badge:${s.prev.id}`);
      expect(st.quests.states[own[0].id].status).toBe('active');
      const bq = own.find((q) => q.objectives.some((o) => o.type === 'boss'))!;
      const iBoss = bq.objectives.findIndex((o) => o.type === 'boss');
      expect(bq.objectives[iBoss].target).toBe(boss.id);
      const gateTrainer = boss.requires![0].replace('beat:', '');
      expect(bq.objectives.findIndex((o) => o.type === 'trainer' && o.target === gateTrainer)).toBeLessThan(iBoss);
      expect(bq.objectives.findIndex((o) => o.type === 'trainer' && o.target === gateTrainer)).toBeGreaterThanOrEqual(0);
      expect(boss.rewards!.flag).toBe(`badge:${s.id}`);
      for (const q of own) {
        for (const o of q.objectives) if (o.marker) expect(o.marker.region, q.id).toBe(s.id);
        for (const k of Object.keys(q.rewards.items ?? {})) expect(ITEMS[k], `${q.id} ${k}`).toBeDefined();
      }
      const flags = own.flatMap((q) => q.rewards.flags ?? []);
      expect(flags.sort()).toEqual(s.landmarks.map(([f]) => f).sort());
      for (const c of d.chests) for (const k of Object.keys(c.items)) expect(ITEMS[k], `${c.id} ${k}`).toBeDefined();
      for (const t of d.trainers) for (const k of Object.keys(t.rewards.items ?? {})) expect(ITEMS[k], `${t.id} ${k}`).toBeDefined();
      for (const k of [...Object.keys(boss.rewards!.first), ...Object.keys(boss.rewards!.repeat)]) expect(ITEMS[k], k).toBeDefined();
    });

    it('trainers field land Pokémon at the province\'s levels; encounter regions and reputation exist', () => {
      const lo = Math.min(...d.areas.map((a) => a.level[0]));
      for (const t of d.trainers) for (const [sp, lv] of t.team) {
        expect(POKEMON.has(sp), sp).toBe(true);
        expect(isAquatic(sp), `${t.id} ${sp}`).toBe(false);
        expect(lv, `${t.id} ${sp}`).toBeGreaterThanOrEqual(lo - 2);
        expect(lv, `${t.id} ${sp}`).toBeLessThanOrEqual(boss.level);
      }
      expect(POKEMON.has(d.rescue.species)).toBe(true);
      for (const [area] of Object.entries(s.biomes)) expect(REGIONS.get(`vn-${area}`), area).toBeDefined();
      expect(REP_REGIONS[s.id]?.name).toBe(s.name);
    });

    it(`${s.boss.name}: no capture, beatable by a party at its level`, () => {
      const bd = BOSSES.get(boss.id)!;
      expect(bd.capture).toBe(false);
      expect(existsSync(`public/assets/pmd/${bd.sprite}`), 'animated sprite').toBe(true);
      for (const party of [['venusaur', 'charizard', 'blastoise'], ['lucario', 'gyarados', 'tyranitar']]) {
        const w = new World({ mode: 'adventure', seed: 5, width: 5000, height: 5000 });
        sendParty(w, party.map((sp) => [sp, boss.level] as const), BOSSES.get(boss.id)!.types); // one on the field (best match-up), the rest wait in their balls
        const t = w.trainer; t.maxHp = t.hp = 1e9;
        const b = w.spawnBoss(boss.id, boss.level, false, { x: t.x + 240, y: t.y });
        let time = 0;
        time = fightBoss(w, b, 300); // two Potions, like a player at that point of the journey
        console.info(`[balance] ${boss.id} Lv${boss.level} vs ${party[0]}: ${b.alive ? 'ALIVE ' + Math.round(b.hp / b.maxHp * 100) + '%' : Math.round(time) + 's'}`);
        expect(b.alive, party[0]).toBe(false);
        expect(time, party[0]).toBeGreaterThan(20);
      }
    });

    it('passport page opens after the previous province; six restoration sites tied to the eco quest', () => {
      const adv = newAdventure('vietnam');
      const page = () => passportPages(adv, quests.map((q) => q.id)).find((p) => p.def.id === s.id)!;
      expect(page().unlocked).toBe(false);
      adv.flags.push(`badge:${s.prev.id}`);
      expect(page().playable).toBe(true);
      expect(page().unlocked).toBe(true);
      expect(page().quests.total).toBe(s.quests.length);
      expect(page().boss?.name).toBe(boss.name);
      const p = (conservation as unknown as { provinces: Record<string, { sites: { id: string }[]; unlock: string }> }).provinces[s.id];
      expect(p.sites).toHaveLength(6);
      expect(own.some((q) => q.objectives.some((o) => o.target === `eco:${s.id}` && o.count === 6))).toBe(true);
      expect(own.map((q) => q.id)).toContain(p.unlock);
    });
  });
});
