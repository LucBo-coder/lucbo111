import { describe, expect, it } from 'vitest';
import valleyJson from '../src/data/world/starter-valley.json';
import { AdventureState, ITEMS } from '../src/adventure/AdventureState';
import { POKEMON } from '../src/core/data';
import { FISH_WINDOW, fishOutcome, GATHER_TABLES, gatherTable, nearestWater, nodeCooldownLeft, rollGather } from '../src/core/gathering';
import { T } from '../src/core/map/tiles';
import { ValleyMap, type RegionDef } from '../src/core/map/valley';
import { defaultSave, migrate } from '../src/systems/saveSchema';

const def = valleyJson as unknown as RegionDef;
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('gathering tables (data/world/gathering.json)', () => {
  it('every item and Pokémon in the tables exists, levels and weights are sane', () => {
    for (const [id, t] of Object.entries(GATHER_TABLES)) {
      expect(['fish', 'forage'], id).toContain(t.kind);
      expect(t.cooldown, id).toBeGreaterThan(0);
      expect(t.items.length, id).toBeGreaterThan(0);
      for (const it of t.items) { expect(ITEMS[it.id], `${id} → ${it.id}`).toBeTruthy(); expect(it.qty[0]).toBeLessThanOrEqual(it.qty[1]); expect(it.weight).toBeGreaterThan(0); }
      for (const p of t.pokemon) { expect(POKEMON.has(p.species), `${id} → ${p.species}`).toBe(true); expect(p.level[0]).toBeLessThanOrEqual(p.level[1]); }
    }
    expect(gatherTable('lake-fish')?.requiresFlag).toBe('tool:rod');
  });

  it('rolls: the Pokémon chance decides the kind, weights pick the entry, quantities stay in range', () => {
    const t = gatherTable('lake-fish')!;
    const mon = rollGather(t, seq(0, 0, 0)); // under pokemonChance → first species
    expect(mon).toEqual({ type: 'pokemon', species: 'magikarp', level: t.pokemon[0].level[0] });
    const item = rollGather(t, seq(0.99, 0, 0.99)); // over pokemonChance → first item, top quantity
    expect(item).toEqual({ type: 'item', id: t.items[0].id, qty: t.items[0].qty[1] });
    // many random rolls: rare entries appear rarely, results always valid
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const r = rollGather(t);
      const k = r.type === 'item' ? r.id : r.species;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.get('magikarp')!).toBeGreaterThan(counts.get('feebas') ?? 0);
    expect(counts.get('oranberry')!).toBeGreaterThan(counts.get('prism-scale') ?? 0);
  });

  it('fishing reaction window and node refill timer', () => {
    expect(fishOutcome(2, null)).toBe('waiting');
    expect(fishOutcome(2, 1.9)).toBe('early');
    expect(fishOutcome(2, 2 + FISH_WINDOW * 0.5)).toBe('hooked');
    expect(fishOutcome(2, 2 + FISH_WINDOW + 0.01)).toBe('late');
    const t = gatherTable('meadow-forage')!;
    expect(nodeCooldownLeft(undefined, 'bush-1', t, 100)).toBe(0);
    expect(nodeCooldownLeft({ 'bush-1': 100 }, 'bush-1', t, 130)).toBe(t.cooldown - 30);
    expect(nodeCooldownLeft({ 'bush-1': 100 }, 'bush-1', t, 100 + t.cooldown)).toBe(0);
    // the timer is saved with the adventure
    const save = defaultSave();
    new AdventureState(save).adv.nodes = { 'bush-1': 100 };
    expect(migrate(JSON.parse(JSON.stringify(save))).adventure!.nodes).toEqual({ 'bush-1': 100 });
  });
});

describe('Starter Valley resource nodes', () => {
  const m = new ValleyMap(def);
  const nodes = def.nodes ?? [];

  it('four fishing spots stand on the Crystal Lake shore, next to water toward the lake centre', () => {
    const fish = nodes.filter((n) => n.table === 'lake-fish');
    expect(fish.length).toBe(4);
    for (const n of fish) {
      expect(m.areaAt(n.x, n.y)?.id, n.id).toBe('lake');
      expect(m.solidAt(n.x, n.y), `${n.id} walkable`).toBe(false);
      // where the bobber lands (1.5 tiles toward the centre) is water
      const dx = def.lake.cx - (n.x + 0.5), dy = def.lake.cy - (n.y + 0.5), d = Math.hypot(dx, dy);
      expect(m.solidAt(Math.floor(n.x + 0.5 + (dx / d) * 1.5), Math.floor(n.y + 0.5 + (dy / d) * 1.5)), `${n.id} bobber on water`).toBe(true);
    }
  });

  it('berry bushes are spread over the meadow, on open ground, outside the camp', () => {
    const bushes = nodes.filter((n) => n.table === 'meadow-forage');
    expect(bushes.length).toBeGreaterThanOrEqual(5);
    for (const n of bushes) {
      expect(m.areaAt(n.x, n.y)?.id, n.id).toBe('meadow');
      expect(m.solidAt(n.x, n.y), `${n.id} walkable`).toBe(false);
    }
    for (let i = 0; i < bushes.length; i++) for (let j = i + 1; j < bushes.length; j++) {
      expect(Math.hypot(bushes[i].x - bushes[j].x, bushes[i].y - bushes[j].y)).toBeGreaterThan(8);
    }
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
  });

  it('the fishing quest chain: forage for bait → the rod → three catches', () => {
    const st = new AdventureState(defaultSave());
    st.addPokemon('charmander', 8, 'starter');
    st.notify({ type: 'talk', target: 'prof' });
    st.notify({ type: 'capture', target: 'pidgey' });
    for (const q of st.notify({ type: 'talk', target: 'prof' })) st.grant(q.rewards);
    const feed = (ev: Parameters<AdventureState['notify']>[0]) => { const d = st.notify(ev); for (const q of d) st.grant(q.rewards); return d.map((q) => q.id); };
    expect(st.quests.states['q-fish-1'].status).toBe('available');
    st.startQuest('q-fish-1');
    expect(feed({ type: 'collect', target: 'fish' })).toEqual([]); // fishing does not count as foraging
    for (let i = 0; i < 3; i++) feed({ type: 'collect', target: 'forage' });
    expect(st.hasFlag('tool:rod')).toBe(false);
    expect(feed({ type: 'talk', target: 'sv-fisher' })).toEqual(['q-fish-1']);
    expect(st.hasFlag('tool:rod')).toBe(true);
    st.startQuest('q-fish-2');
    for (let i = 0; i < 3; i++) feed({ type: 'collect', target: 'fish' });
    const nets = st.item('netball');
    expect(feed({ type: 'talk', target: 'sv-fisher' })).toEqual(['q-fish-2']);
    expect(st.item('netball')).toBe(nets + 3);
    expect(def.npcs.some((n) => n.id === 'sv-fisher')).toBe(true);
  });
});

describe('Rừng Ngọc Lục Bảo — its own map (V21)', () => {
  it('is registered, gated by region:emerald-forest from the valley, and links back', async () => {
    const { REGION_DEFS } = await import('../src/core/map/regionDefs');
    const { REGIONS, regionOfArea } = await import('../src/core/encounters');
    const ew = REGION_DEFS['emerald-woods'];
    expect(ew?.name).toBe('Rừng Ngọc Lục Bảo');
    const gate = def.portals!.find((p) => p.to === 'emerald-woods')!;
    expect(gate.requires).toEqual(['region:emerald-forest']);
    const back = ew.portals!.find((p) => p.to === 'starter-valley')!;
    const vm = new ValleyMap(def), em = new ValleyMap(ew);
    expect(vm.solidAt(back.toX, back.toY)).toBe(false);
    expect(em.solidAt(gate.toX, gate.toY)).toBe(false);
    // the valley keeps its forest edge (quests, roaming legends) and the new areas have encounter levels
    expect(def.areas.some((a) => a.id === 'forest')).toBe(true);
    for (const a of ew.areas) expect(regionOfArea(a.id)?.id).toBe('emerald-woods');
    expect(REGIONS.get('emerald-woods')?.unlock).toBe('region:emerald-forest');
  });

  it('every part of the map is reachable on foot from the arrival point (the stream has a bridge)', async () => {
    const { REGION_DEFS } = await import('../src/core/map/regionDefs');
    const ew = REGION_DEFS['emerald-woods'];
    const m = new ValleyMap(ew);
    const seen = new Set<number>(), q: [number, number][] = [[ew.spawn.x, ew.spawn.y]];
    seen.add(ew.spawn.y * ew.width + ew.spawn.x);
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * ew.width + nx;
        if (seen.has(k) || m.solidAt(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const targets = [...ew.npcs, ...ew.trainers, ...ew.chests, ...ew.waypoints, ...(ew.nodes ?? []), ...ew.portals!];
    for (const o of targets) {
      const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((o.y + dy) * ew.width + o.x + dx));
      expect(near, `${(o as { id: string }).id} reachable`).toBe(true);
    }
  });

  it('fishing spots on every map put the bobber on water; nodes use known tables', async () => {
    const { REGION_DEFS } = await import('../src/core/map/regionDefs');
    for (const d of Object.values(REGION_DEFS)) {
      const m = new ValleyMap(d);
      for (const n of d.nodes ?? []) {
        const t = gatherTable(n.table);
        expect(t, `${d.id}/${n.id}`).toBeTruthy();
        expect(m.solidAt(n.x, n.y), `${d.id}/${n.id} walkable`).toBe(false);
        if (t!.kind !== 'fish') continue;
        // 1.5 tiles toward the lake centre — or, on a river / canal bank (V22), the nearest water tile
        const dx = d.lake.cx - (n.x + 0.5), dy = d.lake.cy - (n.y + 0.5), r = Math.hypot(dx, dy);
        const lakeward = m.terrainAt(Math.floor(n.x + 0.5 + (dx / r) * 1.5), Math.floor(n.y + 0.5 + (dy / r) * 1.5)) === T.Water;
        expect(lakeward || !!nearestWater(m, n.x, n.y, 3), `${d.id}/${n.id} bobber`).toBe(true);
      }
    }
  });
});
