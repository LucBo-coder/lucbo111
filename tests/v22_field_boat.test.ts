import { describe, expect, it } from 'vitest';
import vnQuests from '../src/data/vietnam/quests.json';
import { AdventureState, ITEMS } from '../src/adventure/AdventureState';
import {
  canUse, currentSpeed, FIELD_ABILITIES, fieldFlag, fieldUser, nookRing, pushTarget, riverCurrent, tide, tideName, type FieldDef, type PartyMember,
} from '../src/core/field';
import { POKEMON } from '../src/core/data';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { T } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import { defaultSave, migrate } from '../src/systems/saveSchema';

const mon = (species: string, level: number): PartyMember => ({ species, name: POKEMON.get(species)!.name, level, types: POKEMON.get(species)!.types });
const flags = (...f: string[]) => ({ has: (x: string) => f.includes(x) });

/** Tiles reachable on foot (solid blocks) or by boat (only water / bridges). */
function flood(m: ValleyMap, x: number, y: number, boat = false): Set<number> {
  const ok = (tx: number, ty: number) => boat ? [T.Water, T.Bridge].includes(m.terrainAt(tx, ty) as never) : !m.solidAt(tx, ty);
  const seen = new Set<number>([y * m.widthTiles + x]), q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = ny * m.widthTiles + nx;
      if (nx < 0 || ny < 0 || nx >= m.widthTiles || ny >= m.heightTiles || seen.has(k) || !ok(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

describe('exploration abilities', () => {
  it('the right party member does the job; level and type both count', () => {
    expect(fieldUser('cut', [mon('charmander', 30), mon('bulbasaur', 5), mon('treecko', 9)])?.species).toBe('treecko');
    expect(fieldUser('cut', [mon('bulbasaur', 5)])).toBeNull(); // too low
    expect(fieldUser('smash', [mon('machop', 14)])?.species).toBe('machop');
    expect(fieldUser('strength', [mon('sudowoodo', 30)])).toBeNull(); // rock alone cannot push
    expect(fieldUser('strength', [mon('mudkip', 18)])).toBeNull();
    expect(fieldUser('strength', [mon('marshtomp', 18)])?.species).toBe('marshtomp'); // water / ground
    const no = canUse('smash', [mon('pidgey', 50)], flags());
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.reason).toBe(FIELD_ABILITIES.smash.hint);
  });

  it('the boat needs its flag, not a Pokémon', () => {
    expect(canUse('boat', [], flags()).ok).toBe(false);
    expect(canUse('boat', [], flags('vehicle:ghe')).ok).toBe(true);
  });

  it('a nook ring leaves exactly one gap: the obstacle, with walls overlapping its collider', () => {
    const f: FieldDef = { id: 'x', ability: 'cut', x: 10, y: 12, nook: { cx: 13.5, cy: 12.5, r: 3, wall: 'tree' } };
    const ring = nookRing(f);
    expect(ring.length).toBeGreaterThan(15);
    for (const p of ring) expect(Math.hypot(p.x - 13.5, p.y - 12.5)).toBeCloseTo(3, 5);
    // neighbours along the ring are under one tile apart, the two next to the gap within 0.8 tile of the obstacle
    const ob = { x: 10.5, y: 12.5 };
    const near = ring.map((p) => Math.hypot(p.x - ob.x, p.y - ob.y)).sort((a, b) => a - b);
    expect(near[0]).toBeLessThan(0.8);
    expect(near[1]).toBeLessThan(0.8);
    for (let i = 1; i < ring.length; i++) expect(Math.hypot(ring[i].x - ring[i - 1].x, ring[i].y - ring[i - 1].y)).toBeLessThan(0.9);
  });

  it('boulders move one tile away from the player along the main axis, never into a blocked tile', () => {
    const open = () => true;
    expect(pushTarget(5, 5, 4.2, 5.6, open)).toEqual([6, 5]); // player west → east
    expect(pushTarget(5, 5, 5.5, 6.9, open)).toEqual([5, 4]); // player south → north
    expect(pushTarget(5, 5, 4.2, 5.6, (x) => x !== 6)).toBeNull();
  });

  it('valley nooks: walls on open ground, the chest inside sealed by the obstacle flag, unreachable until cleared', () => {
    const d = REGION_DEFS['starter-valley'], m = new ValleyMap(d);
    expect(d.field?.length).toBe(3);
    for (const f of d.field!) {
      const chest = d.chests.find((c) => c.requiresFlag === fieldFlag('starter-valley', f.id))!;
      expect(chest, f.id).toBeTruthy();
      for (const k of Object.keys(chest.items)) expect(ITEMS[k], k).toBeTruthy();
      expect(m.solidAt(f.x, f.y), f.id).toBe(false);
      for (const p of nookRing(f)) expect(m.solidAt(Math.floor(p.x), Math.floor(p.y)), `${f.id} wall`).toBe(false);
      // the chest is inside the ring, the obstacle in its gap, the hole (strength) just inside
      expect(Math.hypot(chest.x + 0.5 - f.nook!.cx, chest.y + 0.5 - f.nook!.cy)).toBeLessThan(f.nook!.r - 0.9);
      expect(Math.hypot(f.x + 0.5 - f.nook!.cx, f.y + 0.5 - f.nook!.cy)).toBeCloseTo(f.nook!.r, 1);
      if (f.to) expect(Math.hypot(f.to[0] + 0.5 - f.nook!.cx, f.to[1] + 0.5 - f.nook!.cy)).toBeLessThan(f.nook!.r);
      // no authored chunk object (tree, rock, NPC...) sits on the obstacle, its hole or the chest, other than the chest itself
      const objs = [] as { x: number; y: number; kind: string; id: string }[];
      for (let cy = 0; cy < Math.ceil(d.height / d.chunk); cy++) for (let cx = 0; cx < Math.ceil(d.width / d.chunk); cx++) objs.push(...m.objectsInChunk(cx, cy));
      for (const [tx, ty] of [[f.x, f.y], ...(f.to ? [f.to] : [])]) {
        const blocking = objs.filter((o) => o.kind !== 'chest' && Math.hypot(o.x - (tx + 0.5), o.y - (ty + 0.5)) < 0.6 && !o.id.startsWith('nook-'));
        expect(blocking.map((o) => o.id), `${f.id} @${tx},${ty}`).toEqual([]);
      }
    }
  });

  it('a pushed boulder and a cleared obstacle survive save → reload', () => {
    const st = new AdventureState(defaultSave());
    st.adv.boulders = { 'sv-boulder': [22, 66] };
    st.setFlag(fieldFlag('starter-valley', 'sv-thicket'));
    const back = new AdventureState(migrate(JSON.parse(JSON.stringify(st.save))));
    expect(back.adv.boulders).toEqual({ 'sv-boulder': [22, 66] });
    expect(back.hasFlag('field:starter-valley:sv-thicket')).toBe(true);
  });
});

describe('boats on the Hậu River (Cần Thơ)', () => {
  const d = REGION_DEFS['can-tho'];
  const m = new ValleyMap(d);
  const at = (x: number, y: number) => y * m.widthTiles + x;

  it('every dock: land on its bank, boat tile on water, and all docks share one waterway', () => {
    expect(d.docks?.length).toBe(5);
    const water = flood(m, d.docks![0].wx, d.docks![0].wy, true);
    for (const k of d.docks!) {
      expect(m.solidAt(k.x, k.y), `${k.id} land`).toBe(false);
      expect(m.terrainAt(k.wx, k.wy), `${k.id} water`).toBe(T.Water);
      expect(water.has(at(k.wx, k.wy)), `${k.id} connected`).toBe(true);
      expect(Math.hypot(k.wx - k.x, k.wy - k.y)).toBeLessThanOrEqual(3); // the E prompt reaches from both ends
    }
  });

  it('the river islet and its chest are reachable only by boat', () => {
    const land = flood(m, d.spawn.x, d.spawn.y);
    const islet = d.docks!.find((k) => k.id === 'ct-dock-baibo')!;
    const chest = d.chests.find((c) => c.id === 'chest-ct-baibo')!;
    const onIslet = flood(m, islet.x, islet.y);
    expect(onIslet.has(at(chest.x, chest.y))).toBe(true);
    expect(land.has(at(islet.x, islet.y))).toBe(false);
    // the mainland docks are on the mainland
    for (const id of ['ct-dock-ninhkieu', 'ct-dock-cairang', 'ct-dock-phongdien']) {
      const k = d.docks!.find((x) => x.id === id)!;
      expect(land.has(at(k.x, k.y)), id).toBe(true);
    }
  });

  it('the current follows the river downstream and is strongest at low tide', () => {
    const c = riverCurrent(d.rivers!, 102, 52, 30);
    expect(c.vy).toBeGreaterThan(0); // the Hậu flows south past Ninh Kiều
    expect(Math.hypot(c.vx, c.vy)).toBeCloseTo(30, 5);
    expect(riverCurrent(d.rivers!, 30, 30, 30)).toEqual({ vx: 0, vy: 0 }); // fields: no river
    expect(tide(0)).toBeCloseTo(1); // high water at midnight / noon
    expect(tide(360)).toBeCloseTo(-1);
    expect(currentSpeed(360)).toBeGreaterThan(currentSpeed(0));
    expect(tideName(0)).toBe('Nước lớn');
    expect(tideName(360)).toBe('Nước ròng');
    expect(tideName(180)).toBe('Nước đang rút');
    expect(tideName(540)).toBe('Nước đang lên');
  });

  it('boat quests: the boat flag comes from the ferry girl, the trip lands at real docks', () => {
    const q = vnQuests as { id: string; requires?: string[]; rewards: { flags?: string[] }; objectives: { type: string; target?: string }[] }[];
    const boat = q.find((x) => x.id === 'vn-ct-boat')!, river = q.find((x) => x.id === 'vn-ct-river')!;
    expect(boat.rewards.flags).toContain(FIELD_ABILITIES.boat.requiresFlag);
    expect(river.requires).toEqual(['vn-ct-boat']);
    const docks = new Set(d.docks!.map((k) => 'dock:' + k.id));
    for (const o of river.objectives.filter((x) => x.type === 'explore')) expect(docks.has(o.target!)).toBe(true);
  });
});
