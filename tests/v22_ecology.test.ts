import { afterEach, describe, expect, it, vi } from 'vitest';
import valleyJson from '../src/data/world/starter-valley.json';
import { ECOLOGY, REGIONS, SpawnContext } from '../src/core/encounters';
import { POKEMON } from '../src/core/data';
import { activeRare, PACKS, planPack, RARE_RULES, rareHints, rollRare, TERRITORIES, territoryOf, TERRITORY_WARN } from '../src/core/ecologyRules';
import { RegionDef, ValleyMap } from '../src/core/map/valley';
import { TILE_PX } from '../src/core/map/tiles';
import type { MapProvider } from '../src/core/map/mapProvider';
import { makeWildState } from '../src/core/wildAI';
import { STEP, World, type Unit } from '../src/core/world';
import { Rng } from '../src/core/rng';
import { SpawnManager } from '../src/adventure/SpawnManager';

const valley = () => new ValleyMap(valleyJson as unknown as RegionDef);
function advWorld(map: MapProvider = valley()) {
  const w = new World({
    mode: 'adventure', seed: 5, width: map.widthTiles * TILE_PX, height: map.heightTiles * TILE_PX,
    terrain: {
      blocksMove: (x, y) => map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
      blocksShot: (x, y) => map.shotSolidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
    },
  });
  w.teleport(44 * TILE_PX, 70 * TILE_PX);
  return w;
}
const steps = (w: World, sec: number) => { for (let i = 0; i < sec * 60; i++) w.step(STEP); };
const ctx = (o: Partial<SpawnContext>): SpawnContext => ({ biome: 'meadow', night: false, weather: 'clear', ...o });

describe('V22 ecology rules: data', () => {
  it('every pack, territory and rare species exists (dex + ecology), leaders included, nothing legendary', () => {
    const ids = [...PACKS.values()].flatMap((p) => [p.species, ...(p.leader ? [p.leader] : [])]).concat([...TERRITORIES.keys()], RARE_RULES.map((r) => r.species));
    for (const id of ids) {
      expect(POKEMON.get(id), id).toBeTruthy();
      expect(ECOLOGY.get(id), id).toBeTruthy();
      expect(ECOLOGY.get(id)!.legendary || ECOLOGY.get(id)!.mythical, id).toBe(false);
    }
    for (const p of PACKS.values()) { expect(p.size[0]).toBeGreaterThanOrEqual(2); expect(p.size[1]).toBeGreaterThanOrEqual(p.size[0]); expect(p.size[1]).toBeLessThanOrEqual(4); }
    for (const r of RARE_RULES) {
      expect(r.chance, r.id).toBeGreaterThan(0);
      expect(r.chance, r.id).toBeLessThanOrEqual(0.1);
      expect(r.hint.length, r.id).toBeGreaterThan(10);
      for (const reg of r.regions ?? []) expect(REGIONS.get(reg), r.id).toBeTruthy();
    }
    expect(new Set(RARE_RULES.map((r) => r.id)).size).toBe(RARE_RULES.length);
  });
});

describe('V22 ecology rules: packs', () => {
  const meadow = REGIONS.get('starter-valley')!;
  it('pack size stays inside the rule; an evolved leader only when its level floor is close', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 40; i++) {
      const plan = planPack(rng, { species: 'poochyena', level: 5 }, meadow);
      expect(plan.length + 1).toBeGreaterThanOrEqual(2);
      expect(plan.length + 1).toBeLessThanOrEqual(3);
      expect(plan.filter((m) => m.leader).length).toBe(1);
      // Lv 5 pups: no Lv 18 Mightyena, the strongest Poochyena leads
      expect(plan.every((m) => m.species === 'poochyena')).toBe(true);
      expect(plan.find((m) => m.leader)!.level).toBe(7);
    }
    const late = planPack(rng, { species: 'poochyena', level: 16 }, REGIONS.get('misty-swamp')!);
    const lead = late.find((m) => m.leader)!;
    expect(lead.species).toBe('mightyena');
    expect(lead.level).toBe(18);
    expect(planPack(rng, { species: 'pidgey', level: 5 }, meadow)).toEqual([]);
  });

  it('attacking one member brings the pack in; the timid ones scatter, the leader fights', () => {
    const w = advWorld();
    const t = w.trainer;
    const mk = (sp: string, dx: number, temper: 'neutral' | 'timid', leader = false): Unit => {
      const ws = makeWildState(t.x + dx, t.y + 200, temper, { aggroR: 10 });
      ws.pack = 7; ws.leader = leader;
      return w.spawnWild(sp, 6, t.x + dx, t.y + 200, { wild: ws });
    };
    const a = mk('doduo', 0, 'neutral'), b = mk('doduo', 40, 'neutral'), c = mk('doduo', -40, 'neutral');
    const loner = w.spawnWild('doduo', 6, t.x + 80, t.y + 200, { wild: makeWildState(t.x + 80, t.y + 200, 'neutral', { aggroR: 10 }) });
    w.applyDamage(a, 1, t);
    w.step(STEP); w.step(STEP);
    expect(b.hostile && c.hostile).toBe(true);
    expect(b.wild!.lastAttacker).toBe(t);
    expect(loner.hostile).toBe(false);

    const w2 = advWorld();
    const t2 = w2.trainer;
    const mk2 = (dx: number, leader: boolean): Unit => {
      const ws = makeWildState(t2.x + dx, t2.y + 200, 'timid', { aggroR: 10 });
      ws.pack = 9; ws.leader = leader;
      return w2.spawnWild('mareep', 6, t2.x + dx, t2.y + 200, { wild: ws });
    };
    const hit = mk2(0, false), mate = mk2(40, false), lead = mk2(-40, true);
    w2.applyDamage(hit, 1, t2);
    w2.step(STEP); w2.step(STEP);
    expect(mate.wild!.mode).toBe('flee');
    expect(lead.hostile).toBe(true);
    expect(['chase', 'attack']).toContain(lead.wild!.mode);
  });

  it('when the leader falls, non-aggressive followers break off and flee; followers drift after a live leader', () => {
    const w = advWorld();
    const t = w.trainer;
    const lw = makeWildState(t.x + 300, t.y, 'neutral', { aggroR: 10 }); lw.pack = 3; lw.leader = true;
    const leader = w.spawnWild('dodrio', 30, t.x + 300, t.y, { wild: lw });
    const fw = makeWildState(t.x + 340, t.y, 'neutral', { aggroR: 10 }); fw.pack = 3; fw.follow = leader;
    const f = w.spawnWild('doduo', 28, t.x + 340, t.y, { wild: fw });
    // calm: the follower's home moves with the leader
    leader.x += 200; leader.wild!.homeX += 200;
    steps(w, 6);
    expect(Math.abs(f.wild!.homeX - leader.x)).toBeLessThan(260);
    f.hostile = true; fw.mode = 'chase';
    w.removeEnemy(leader);
    w.step(STEP);
    expect(f.wild!.mode).toBe('flee');
    expect(f.wild!.follow).toBeNull();
    expect(f.hostile).toBe(false);
  });
});

describe('V22 ecology rules: territory', () => {
  it('stepping inside draws a warning, then a charge; leaving the territory ends the chase', () => {
    const w = advWorld();
    const t = w.trainer;
    const r = territoryOf('tauros');
    expect(r).toBeGreaterThan(150);
    const hx = t.x + r + 120, hy = t.y;
    const bull = w.spawnWild('tauros', 8, hx, hy, { wild: makeWildState(hx, hy, 'neutral', { territory: r }) });
    // outside the territory: a neutral Tauros does not care, even within its old aggro radius
    steps(w, 2);
    expect(bull.hostile).toBe(false);
    expect(bull.wild!.mode).not.toBe('alert');
    // step onto its ground: a warning first…
    w.teleport(hx - r * 0.6, hy);
    steps(w, 0.6);
    expect(bull.wild!.mode).toBe('alert');
    expect(bull.hostile).toBe(false);
    // …then the charge
    steps(w, TERRITORY_WARN);
    expect(bull.hostile).toBe(true);
    // walk well out of the territory: it gives up and heads home
    w.teleport(hx - r * 2.2, hy);
    w.trainer.hp = w.trainer.maxHp;
    steps(w, 4);
    expect(bull.hostile).toBe(false);
    expect(['return', 'idle', 'wander', 'eat']).toContain(bull.wild!.mode);
  });

  it('a warning that ends with the intruder gone outside calms down without a fight', () => {
    const w = advWorld();
    const t = w.trainer;
    const r = territoryOf('kangaskhan');
    const hx = t.x + r * 0.7, hy = t.y;
    const k = w.spawnWild('kangaskhan', 8, hx, hy, { wild: makeWildState(hx, hy, 'neutral', { territory: r }) });
    steps(w, 0.4);
    expect(k.wild!.mode).toBe('alert');
    w.teleport(hx - r * 1.6, hy);
    steps(w, TERRITORY_WARN + 0.3);
    expect(k.hostile).toBe(false);
  });
});

describe('V22 ecology rules: rare conditions', () => {
  const rocky = REGIONS.get('rocky-highlands')!;
  it('conditions: biome + time + weather (+ hour window, region, water)', () => {
    expect(activeRare(ctx({ biome: 'rocky', night: true, weather: 'thunderstorm' }), rocky).map((r) => r.id)).toContain('absol-storm');
    expect(activeRare(ctx({ biome: 'rocky', night: false, weather: 'thunderstorm' }), rocky).map((r) => r.id)).not.toContain('absol-storm');
    expect(activeRare(ctx({ biome: 'rocky', night: true, weather: 'clear' }), rocky).map((r) => r.id)).not.toContain('absol-storm');
    const forest = REGIONS.get('emerald-forest')!;
    expect(activeRare(ctx({ biome: 'forest', weather: 'clear' }), forest, 360).map((r) => r.id)).toContain('chatot-dawn');
    expect(activeRare(ctx({ biome: 'forest', weather: 'clear' }), forest, 720).map((r) => r.id)).not.toContain('chatot-dawn');
    expect(activeRare(ctx({ biome: 'forest', weather: 'clear' }), forest).map((r) => r.id)).not.toContain('chatot-dawn'); // no clock: hour rules off
    const lake = REGIONS.get('crystal-lake')!;
    expect(activeRare(ctx({ biome: 'lake', aquatic: true }), lake, 300).map((r) => r.id)).toEqual(['relicanth-dawn']);
    expect(activeRare(ctx({ biome: 'lake' }), lake, 300).map((r) => r.id)).not.toContain('relicanth-dawn');
    // region-bound rules: Seviper of U Minh only in Cà Mau's forest / mangrove
    const uminh = REGIONS.get('vn-cm-uminh')!;
    expect(activeRare(ctx({ biome: 'forest', night: true, weather: 'rain' }), uminh).map((r) => r.id)).toContain('seviper-uminh');
    expect(activeRare(ctx({ biome: 'forest', night: true, weather: 'rain' }), forest).map((r) => r.id)).not.toContain('seviper-uminh');
    expect(rareHints(uminh).some((h) => h.includes('U Minh'))).toBe(true);
  });

  it('a rare roll is rare (≈ chance), lands in the region level range and is at least "rare" tier', () => {
    const rng = new Rng(11);
    const c = ctx({ biome: 'rocky', night: true, weather: 'thunderstorm' });
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const r = rollRare(rng, c, rocky);
      if (!r) continue;
      hits++;
      expect(r.species).toBe('absol');
      expect(r.rule).toBe('absol-storm');
      expect(['rare', 'epic', 'ultra']).toContain(r.rarity);
      expect(r.level).toBeGreaterThanOrEqual(rocky.level[0]);
      expect(r.level).toBeLessThanOrEqual(rocky.level[1] + 3);
    }
    expect(hits / 4000).toBeGreaterThan(0.05);
    expect(hits / 4000).toBeLessThan(0.11);
    expect(rollRare(rng, ctx({ biome: 'rocky', weather: 'clear' }), rocky)).toBeNull();
  });
});

describe('V22 ecology in the spawner', () => {
  // the spawner rolls with Math.random: seed it, or a rare run sees no pack within the two simulated minutes
  afterEach(() => { vi.restoreAllMocks(); });
  it('pack species arrive with their group (shared pack id, one leader), territorial species guard, caps hold', () => {
    const map = valley();
    const w = advWorld(map);
    const rnd = new Rng(22);
    vi.spyOn(Math, 'random').mockImplementation(() => rnd.next());
    const sm = new SpawnManager(w, map, { maxActive: 14, isNight: () => false, weather: () => 'clear', loaded: () => true });
    const packs = new Map<number, Unit[]>();
    for (let i = 0; i < 60 * 120; i++) {
      sm.update(STEP); w.step(STEP);
      if (i % 600 === 0) w.teleport((30 + ((i / 600) % 6) * 25) * TILE_PX, (40 + ((i / 600) % 3) * 20) * TILE_PX);
      for (const u of sm.wildUnits()) if (u.wild?.pack) { const l = packs.get(u.wild.pack) ?? []; if (!l.includes(u)) l.push(u); packs.set(u.wild.pack, l); }
      expect(sm.wildUnits().length).toBeLessThanOrEqual(14);
    }
    expect(packs.size).toBeGreaterThan(0);
    for (const members of packs.values()) {
      expect(members.length).toBeGreaterThanOrEqual(2);
      expect(members.filter((m) => m.wild!.leader).length).toBeLessThanOrEqual(1);
    }
    for (const u of w.enemies) if (u.wild && TERRITORIES.has(u.defId)) expect(u.wild.territory).toBe(territoryOf(u.defId));
  });

  it('rare conditions spawn their species and report the rule', () => {
    const map = valley();
    const w = advWorld(map);
    const rules: string[] = [];
    const sm = new SpawnManager(w, map, { maxActive: 14, isNight: () => true, weather: () => 'fog', clock: () => 60, loaded: () => true, onRare: (u, r) => { expect(u.wild!.rare).toBe(r); rules.push(`${r}:${u.defId}`); } });
    // walk through the forest areas of the valley at a foggy night
    for (let i = 0; i < 60 * 240 && !rules.length; i++) {
      sm.update(STEP); w.step(STEP);
      if (i % 300 === 0) { for (const e of sm.wildUnits()) w.removeEnemy(e); w.teleport((20 + ((i / 300) % 12) * 12) * TILE_PX, (20 + ((i / 300) % 5) * 15) * TILE_PX); }
    }
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toMatch(/^misdreavus-fog:misdreavus$/);
    expect(sm.rareSpawned).toBeGreaterThan(0);
  });
});
