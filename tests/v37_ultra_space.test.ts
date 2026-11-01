import { describe, expect, it } from 'vitest';
import { ECOLOGY, REGIONS, regionOfArea, rollEncounter } from '../src/core/encounters';
import { regionDef } from '../src/core/map/regionDefs';
import { T } from '../src/core/map/tiles';
import { ValleyMap } from '../src/core/map/valley';
import { Rng } from '../src/core/rng';
import {
  GIANTS_AFTER, riftCandidates, ULTRA_AWAKE, ULTRA_BEASTS, ULTRA_SPACE, ULTRA_SPACE_SITES, ULTRA_STIR, ultraAwake, ultraStir,
  ULTRA_WORLDS, type UltraWake, wormholeCandidates, wormholeHint,
} from '../src/core/ultraWormhole';

// Không Gian Ultra (data/world/ultra-space.json): the dimension beyond the Ultra Wormholes — nine worlds, each with its
// own Ultra Beast and its own wild Pokémon, Necrozma at the heart; small rifts there bring the Gen 5–9 legends.

const def = regionDef(ULTRA_SPACE);

describe('Ultra Space', () => {
  it('is a map of nine worlds, each its own wild region with its own species list', () => {
    expect(def.id).toBe(ULTRA_SPACE);
    expect(def.areas).toHaveLength(9);
    expect(def.floating!.length).toBeGreaterThanOrEqual(9); // the city island, eight worlds, drifting rocks
    for (const a of def.areas) {
      const r = regionOfArea(a.id)!;
      expect(r, a.id).toBeTruthy();
      expect(r.species?.length, a.id).toBeGreaterThanOrEqual(8);
      for (const id of r.species!) {
        const e = ECOLOGY.get(id)!;
        expect(e, `${a.id}:${id}`).toBeTruthy();
        expect(e.method, `${a.id}:${id}`).toBe('wild');
        expect(e.minLevel, `${a.id}:${id}`).toBeLessThanOrEqual(r.level[1]);
      }
    }
  });

  it('wild Pokémon there come only from the world’s own list, at its levels', () => {
    const rng = new Rng(11);
    for (const a of def.areas) {
      const r = REGIONS.get(regionOfArea(a.id)!.id)!;
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) for (const night of [false, true]) {
        const roll = rollEncounter(rng, { biome: r.biome, night, weather: 'clear' }, r);
        if (!roll) continue;
        expect(r.species, `${r.id}:${roll.species}`).toContain(roll.species);
        expect(roll.level).toBeGreaterThanOrEqual(r.level[0]);
        seen.add(roll.species);
      }
      expect(seen.size, r.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('every Ultra Beast lives at a site of its own, with no stone ring; Necrozma waits for three of them', () => {
    for (const id of ULTRA_BEASTS) expect(ULTRA_SPACE_SITES.has(id), id).toBe(true);
    for (const l of def.legendaries!) expect(l.ring, l.id).toBe(false);
    const nec = def.legendaries!.find((l) => l.id === 'necrozma')!;
    expect(nec.requires).toEqual(['boss:nihilego', 'boss:xurkitree', 'boss:guzzlord']);
    expect(wormholeHint('nihilego')).toContain('Không Gian Ultra — Biển Sâu Ultra');
    expect(wormholeHint('nihilego')).toContain(`hạ ${ULTRA_STIR} Pokémon hoang dã`);
    expect(wormholeHint('zekrom')).toContain('Vết nứt');
  });

  it('after Necrozma a Cosmog asks to come along; nurses heal the party on the way', () => {
    const c = def.legendaries!.find((l) => l.id === 'cosmog')!;
    expect(c.gift).toBe(true);
    expect(c.requires).toEqual(['boss:necrozma']);
    const nurses = def.npcs.filter((n) => (n as { role?: string }).role === 'nurse');
    expect(nurses.length).toBeGreaterThanOrEqual(2);
  });

  it('floating islands in the void: every site, gateway and chest is reached on foot and through the gateways', () => {
    const m = new ValleyMap(def);
    const W = m.widthTiles, seen = new Uint8Array(W * m.heightTiles);
    // the void all around: no walking off an island's edge
    expect(m.terrainAt(2, 2)).toBe(T.Void);
    expect(m.solidAt(2, 2)).toBe(true);
    expect(m.habitatAt(2, 2)).toBeNull();
    expect(m.shotSolidAt(2, 2)).toBe(false); // shots and flyers cross it
    expect(m.solidAt(def.spawn.x, def.spawn.y)).toBe(false);
    const q: number[] = [];
    const visit = (x: number, y: number) => { const k = x + y * W; if (!seen[k] && !m.solidAt(x, y)) { seen[k] = 1; q.push(k); } };
    const near = (x: number, y: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (seen[x + dx + (y + dy) * W]) return true;
      return false;
    };
    visit(def.spawn.x, def.spawn.y);
    const gates = (def.portals ?? []).filter((p) => p.to === ULTRA_SPACE);
    expect(gates.length).toBe(16); // a pair per world
    for (let used = new Set<string>(), changed = true; changed;) {
      changed = false;
      while (q.length) {
        const k = q.pop()!, x = k % W, y = (k - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < m.heightTiles) visit(x + dx, y + dy);
      }
      for (const g of gates) if (!used.has(g.id) && near(g.x, g.y, 1)) {
        used.add(g.id);
        expect(m.solidAt(g.toX, g.toY), g.id).toBe(false);
        visit(g.toX, g.toY);
        changed = true;
      }
    }
    for (const l of def.legendaries!) expect(near(l.x, l.y, 2), l.id).toBe(true);
    for (const p of def.portals ?? []) expect(near(p.x, p.y, 1), p.id).toBe(true);
    for (const c of def.chests) expect(near(c.x, c.y, 1), c.id).toBe(true);
    for (const n of def.npcs) expect(near(n.x, n.y, 1), n.id).toBe(true);
    // the islands are apart: from the arrival, without the gateways, the worlds cannot be walked to
    const alone = new Uint8Array(W * m.heightTiles), q2 = [def.spawn.x + def.spawn.y * W];
    alone[q2[0]] = 1;
    while (q2.length) {
      const k = q2.pop()!, x = k % W, y = (k - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = x + dx + (y + dy) * W;
        if (!alone[nk] && !m.solidAt(x + dx, y + dy)) { alone[nk] = 1; q2.push(nk); }
      }
    }
    const nih = def.legendaries!.find((l) => l.id === 'nihilego')!;
    expect(alone[nih.x + nih.y * W]).toBe(0);
  });

  it('rifts there bring the Gen 5–9 legends, never Ultra Space’s own residents', () => {
    const all = wormholeCandidates(() => false, GIANTS_AFTER), rift = riftCandidates(() => false, GIANTS_AFTER);
    expect(rift.length).toBeGreaterThan(40);
    for (const id of ULTRA_SPACE_SITES.keys()) expect(rift, id).not.toContain(id);
    for (const id of ULTRA_BEASTS) expect(rift, id).not.toContain(id);
    expect(rift).toContain('zekrom');
    expect(all.length - rift.length).toBe([...ULTRA_SPACE_SITES.keys()].filter((id) => all.includes(id)).length);
  });

  it('an Ultra Beast sleeps until its world is stirred: ULTRA_STIR wild Pokémon beaten there wake it for a while', () => {
    expect(ULTRA_WORLDS.get('ultra-deep-sea')).toEqual(['nihilego']);
    expect(ULTRA_WORLDS.get('ultra-jungle')).toEqual(['buzzwole', 'pheromosa']);
    expect(ULTRA_WORLDS.has('ultra-megalopolis')).toBe(false); // Necrozma is not an Ultra Beast
    const w: UltraWake = { stir: {}, awake: {} }, rng = new Rng(1), none = () => false;
    expect(ultraAwake(w, 'nihilego', 0)).toBe(false);
    expect(ultraAwake(w, 'necrozma', 0)).toBe(true);
    for (let i = 1; i < ULTRA_STIR; i++) expect(ultraStir(w, 'ultra-deep-sea', none, 10, rng)).toBeNull();
    expect(w.stir['ultra-deep-sea']).toBe(ULTRA_STIR - 1);
    // beating Pokémon in another world does not count here
    expect(ultraStir(w, 'ultra-ruin', none, 10, rng)).toBeNull();
    expect(w.stir['ultra-deep-sea']).toBe(ULTRA_STIR - 1);
    expect(ultraStir(w, 'ultra-deep-sea', none, 10, rng)).toBe('nihilego');
    expect(w.stir['ultra-deep-sea']).toBe(0);
    expect(ultraAwake(w, 'nihilego', 10 + ULTRA_AWAKE - 1)).toBe(true);
    expect(ultraAwake(w, 'nihilego', 10 + ULTRA_AWAKE)).toBe(false);
    // while it is awake (or once caught) its world stays still
    expect(ultraStir(w, 'ultra-deep-sea', none, 20, rng)).toBeNull();
    expect(w.stir['ultra-deep-sea']).toBe(0);
    expect(ultraStir(w, 'ultra-deep-sea', (id) => id === 'nihilego', 10 + ULTRA_AWAKE + 1, rng)).toBeNull();
    // a world of two: one wakes, the other can still be stirred awake
    let first: string | null = null;
    for (let i = 0; i < ULTRA_STIR; i++) first = ultraStir(w, 'ultra-jungle', none, 50, rng) ?? first;
    expect(['buzzwole', 'pheromosa']).toContain(first);
    let second: string | null = null;
    for (let i = 0; i < ULTRA_STIR; i++) second = ultraStir(w, 'ultra-jungle', none, 60, rng) ?? second;
    expect(second).toBe(first === 'buzzwole' ? 'pheromosa' : 'buzzwole');
  });
});
