import { describe, expect, it } from 'vitest';
import { POKEMON } from '../src/core/data';
import { bogPoisonChance } from '../src/core/environment';
import { eligible, REGIONS } from '../src/core/encounters';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { T } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import questsJson from '../src/data/world/quests.json';
import type { QuestDef } from '../src/core/quests';

const NEW = ['misty-swamp', 'coral-coast'];
const quests = questsJson as QuestDef[];

describe('0.9.0 regions: Đầm Lầy Sương Mù, Bờ Biển San Hô', () => {
  it('every placed object stands on open ground; spawn, camp and the way back work', () => {
    for (const id of NEW) {
      const d = REGION_DEFS[id];
      const m = new ValleyMap(d);
      const spots = [d.spawn, ...d.npcs, ...d.trainers, ...d.chests, ...d.waypoints, ...(d.portals ?? [])];
      for (const s of spots) expect(m.solidAt(s.x, s.y), `${id} ${JSON.stringify(s).slice(0, 40)}`).toBe(false);
      const back = d.portals!.find((p) => p.to === 'starter-valley')!;
      const valley = new ValleyMap(REGION_DEFS['starter-valley']);
      expect(valley.solidAt(back.toX, back.toY)).toBe(false);
    }
    // the valley gates lead to open ground in the new maps
    for (const p of REGION_DEFS['starter-valley'].portals!.filter((x) => NEW.includes(x.to))) {
      expect(new ValleyMap(REGION_DEFS[p.to]).solidAt(p.toX, p.toY), p.id).toBe(false);
      expect(p.requires?.length).toBeGreaterThan(0);
    }
  });

  it('themes: swamp has toxic puddles + mud + boardwalks, coast has sand + sea', () => {
    const sw = new ValleyMap(REGION_DEFS['misty-swamp']);
    const co = new ValleyMap(REGION_DEFS['coral-coast']);
    const count = (m: ValleyMap, t: number) => { let n = 0; for (let y = 0; y < m.heightTiles; y++) for (let x = 0; x < m.widthTiles; x++) if (m.terrainAt(x, y) === t) n++; return n; };
    expect(count(sw, T.Bog)).toBeGreaterThan(100);
    expect(count(sw, T.Mud)).toBeGreaterThan(100);
    expect(count(co, T.Sand)).toBeGreaterThan(300);
    expect(count(co, T.Water)).toBeGreaterThan(800);
    expect(sw.solidAt(...([...Array(sw.widthTiles * sw.heightTiles).keys()].map((k) => [k % sw.widthTiles, Math.floor(k / sw.widthTiles)] as [number, number]).find(([x, y]) => sw.terrainAt(x, y) === T.Bog)!))).toBe(false); // puddles are walkable
    expect(bogPoisonChance(['grass'])).toBeGreaterThan(0);
    expect(bogPoisonChance(['poison'])).toBe(0);
    expect(bogPoisonChance(['steel', 'flying'])).toBe(0);
  });

  it('wild pools: the regions have their own biome pool at their level range', () => {
    for (const id of NEW) {
      const r = REGIONS.get(id)!;
      expect(r, id).toBeTruthy();
      const pool = eligible({ biome: r.biome, night: false, weather: 'clear' } as never, r);
      expect(pool.length, id).toBeGreaterThan(15);
      expect(pool.every((e) => !e.legendary && !e.mythical)).toBe(true);
    }
  });

  it('quests point to real NPCs, trainers, species and areas; the coast opens after the swamp', () => {
    const npcs = new Set(Object.values(REGION_DEFS).flatMap((d) => d.npcs.map((n) => n.id)));
    const trainers = new Set(Object.values(REGION_DEFS).flatMap((d) => d.trainers.map((t) => t.id)));
    const areas = new Set(Object.values(REGION_DEFS).flatMap((d) => d.areas.map((a) => a.id)));
    const ids = new Set(quests.map((q) => q.id));
    expect(ids.size).toBe(quests.length);
    for (const q of quests.filter((x) => x.id.startsWith('q-swamp') || x.id.startsWith('q-coast'))) {
      if (q.giver) expect(npcs.has(q.giver), q.id).toBe(true);
      for (const r of q.requires ?? []) expect(ids.has(r), q.id).toBe(true);
      for (const o of q.objectives) {
        if (o.type === 'talk') expect(npcs.has(o.target!), `${q.id} ${o.target}`).toBe(true);
        if (o.type === 'trainer') expect(trainers.has(o.target!), `${q.id} ${o.target}`).toBe(true);
        if (o.type === 'capture' || o.type === 'defeat') expect(POKEMON.has(o.target!), `${q.id} ${o.target}`).toBe(true);
        if (o.type === 'explore') expect(areas.has(o.target!), `${q.id} ${o.target}`).toBe(true);
      }
    }
    expect(quests.find((q) => q.id === 'q-swamp-main')!.rewards.flags).toContain('region:coral-coast');
    expect(REGION_DEFS['starter-valley'].portals!.find((p) => p.to === 'coral-coast')!.requires).toEqual(['region:coral-coast']);
    expect(quests.find((q) => q.id === 'q-main-4')!.title).toBe('Thần Rừng thức giấc'); // untouched
  });
});
