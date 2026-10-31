import { describe, expect, it } from 'vitest';
import { beatBossTo } from './bossHelpers';
import valleyJson from '../src/data/world/starter-valley.json';
import dungeonJson from '../src/data/world/dungeons.json';
import { ECOLOGY, REGIONS, regionOfArea } from '../src/core/encounters';
import cache from '../src/data/pokeapi/pokeapi-cache.json';
import { POKEMON, SKILLS, validateData } from '../src/core/data';
import { captureChance, catchValue, rollCapture, shakeProbability, statusBonus } from '../src/core/capture';
import { addExp, expForLevel, levelForExp, makeOwned } from '../src/core/progression';
import { QuestDef, QuestManager } from '../src/core/quests';
import { RegionDef, ValleyMap } from '../src/core/map/valley';
import { DungeonDef, DungeonMap } from '../src/core/map/dungeonMap';
import { T, TILE_PX } from '../src/core/map/tiles';
import type { MapProvider } from '../src/core/map/mapProvider';
import { makeWildState } from '../src/core/wildAI';
import { STEP, World } from '../src/core/world';
import { Rng } from '../src/core/rng';
import { AdventureState } from '../src/adventure/AdventureState';
import { SpawnManager } from '../src/adventure/SpawnManager';
import { DungeonController } from '../src/adventure/DungeonController';
import { defaultSave, migrate, recordRun, SAVE_VERSION, survivorPool } from '../src/systems/saveSchema';
import { PokemonDataProvider, validateSpecies } from '../src/systems/pokemonDataProvider';

const valley = () => new ValleyMap(valleyJson as unknown as RegionDef);
const dungeon = () => new DungeonMap(dungeonJson as unknown as DungeonDef);

function advWorld(map: MapProvider = valley()) {
  return new World({
    mode: 'adventure', seed: 5, width: map.widthTiles * TILE_PX, height: map.heightTiles * TILE_PX,
    terrain: {
      blocksMove: (x, y) => map.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
      blocksShot: (x, y) => map.shotSolidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX)),
    },
  });
}

describe('PokéAPI data integration', () => {
  const c = cache as unknown as { species: Record<string, { types: string[]; baseStats: Record<string, number> }>; moves: Record<string, { type: string; damageClass: string }> };
  it('every playable species/form matches PokéAPI types and base stats (fakemon excluded)', () => {
    const forms = (cache as unknown as { forms: Record<string, { types: string[]; baseStats: Record<string, number> }> }).forms;
    for (const p of POKEMON.values()) {
      if (p.fakemon) continue;
      const src = c.species[p.id] ?? forms[p.id];
      expect(src, p.id).toBeTruthy();
      expect(p.types, p.id).toEqual(src.types);
      expect(p.baseStats, p.id).toEqual(src.baseStats);
    }
  });
  it('every skill matches its PokéAPI move type and damage class', () => {
    for (const s of SKILLS.values()) {
      const m = c.moves[s.id];
      expect(m, s.id).toBeTruthy();
      expect(s.type).toBe(m.type);
      expect(s.category).toBe(m.damageClass);
    }
  });
  it('has at least 30 skills and 11 playable species covering all 6 roles', () => {
    expect(SKILLS.size).toBeGreaterThanOrEqual(30);
    expect(new Set([...POKEMON.values()].map((p) => p.role)).size).toBe(6);
    expect(validateData()).toEqual([]);
  });
});

describe('PokemonDataProvider', () => {
  const species = (cache as unknown as { species: Record<string, unknown> }).species;
  it('serves bundled data without touching the network', async () => {
    let calls = 0;
    const p = new PokemonDataProvider({ fetch: async () => { calls++; throw new Error('offline'); } });
    const d = await p.get('pikachu');
    expect(d?.captureRate).toBe(190);
    expect(calls).toBe(0);
  });
  it('retries then falls back to cache when the network fails', async () => {
    let calls = 0;
    const p = new PokemonDataProvider({ fetch: async () => { calls++; throw new Error('offline'); }, retries: 2, sleep: async () => {} });
    const d = await p.refresh('pikachu');
    expect(calls).toBe(3); // 1 + 2 retries
    expect(d.name).toBe('pikachu');
  });
  it('times out hanging requests and throws for unknown species', async () => {
    const p = new PokemonDataProvider({ fetch: () => new Promise(() => {}), timeoutMs: 20, retries: 0, sleep: async () => {} });
    await expect(p.refresh('missingno')).rejects.toThrow();
  });
  it('validates and normalises a fresh API response', async () => {
    const pokemon = { id: 25, name: 'pikachu', types: [{ slot: 1, type: { name: 'electric' } }], abilities: [], height: 4, weight: 60, base_experience: 112,
      stats: ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map((n, i) => ({ stat: { name: n }, base_stat: 40 + i })) };
    const spec = { names: [{ language: { name: 'en' }, name: 'Pikachu' }], genera: [], capture_rate: 190, growth_rate: { name: 'medium' }, habitat: null, flavor_text_entries: [] };
    const store = new Map<string, unknown>();
    const p = new PokemonDataProvider({
      fetch: async (url) => ({ ok: true, status: 200, json: async () => (url.includes('species') ? spec : pokemon) }),
      store: { get: async (k) => store.get(k) as never, set: async (k, v) => void store.set(k, v) },
    });
    const d = await p.refresh('pikachu');
    expect(validateSpecies(d)).toBe(true);
    expect(d.baseStats.spe).toBe(45);
    expect(store.has('pikachu')).toBe(true);
    expect(validateSpecies(species.pikachu)).toBe(true);
  });
});

describe('capture math (Gen III/IV)', () => {
  it('lower HP, better balls and status raise the chance', () => {
    const full = captureChance(100, 100, 45, 1, 1);
    const low = captureChance(100, 5, 45, 1, 1);
    expect(low).toBeGreaterThan(full);
    expect(captureChance(100, 50, 45, 1.5, 1)).toBeGreaterThan(captureChance(100, 50, 45, 1, 1));
    expect(captureChance(100, 50, 45, 1, statusBonus(['stun']))).toBeGreaterThan(captureChance(100, 50, 45, 1, 1));
  });
  it('matches the formula: a at full HP = rate/3', () => {
    expect(catchValue(90, 90, 255, 1, 1)).toBeCloseTo(85);
    expect(shakeProbability(255)).toBe(1);
  });
  it('rolls are deterministic per seed and bounded', () => {
    const r = rollCapture(new Rng(1), 100, 1, 255, 2, 2);
    expect(r.success).toBe(true);
    let ok = 0;
    for (let s = 0; s < 400; s++) if (rollCapture(new Rng(s), 100, 100, 45, 1, 1).success) ok++;
    expect(ok / 400).toBeGreaterThan(0.03);
    expect(ok / 400).toBeLessThan(0.15);
  });
});

describe('permanent progression (PokéAPI growth rates)', () => {
  it('uses the real medium-slow table', () => {
    expect(expForLevel('charmander', 5)).toBe(135); // medium-slow level 5
    expect(expForLevel('pikachu', 5)).toBe(125); // medium (n^3)
    expect(levelForExp('pikachu', 125)).toBe(5);
  });
  it('levels up across thresholds', () => {
    const p = makeOwned('pikachu', 5, 'wild');
    const gained = addExp(p, expForLevel('pikachu', 8) - p.exp);
    expect(gained).toBe(3);
    expect(p.level).toBe(8);
  });
});

describe('quests', () => {
  const defs: QuestDef[] = [
    { id: 'a', kind: 'main', title: 'A', description: '', autoStart: true, objectives: [{ type: 'talk', target: 'prof', count: 1, text: '' }, { type: 'capture', target: '*', count: 2, text: '' }], rewards: {}, dialogue: { offer: [], complete: [] } },
    { id: 'b', kind: 'side', title: 'B', description: '', requires: ['a'], giver: 'farmer', objectives: [{ type: 'defeat', target: 'rattata', count: 1, text: '' }], rewards: {}, dialogue: { offer: [], complete: [] } },
  ];
  it('runs objectives in order and unlocks follow-ups', () => {
    const q = new QuestManager(defs);
    expect(q.states.a.status).toBe('active');
    expect(q.states.b.status).toBe('locked');
    q.notify({ type: 'capture', target: 'pidgey' });
    expect(q.states.a.step).toBe(0); // the talk still comes first…
    expect(q.objectiveProgress('a', 1)).toBe(1); // …but the early capture is kept (V30)
    q.notify({ type: 'talk', target: 'prof' });
    expect(q.states.a).toMatchObject({ step: 1, progress: 1 });
    const up = q.notify({ type: 'capture', target: 'caterpie' });
    expect(up[0].completed).toBe(true);
    q.refresh();
    expect(q.states.b.status).toBe('available');
    expect(q.forGiver('farmer').map((d) => d.id)).toEqual(['b']);
    expect(q.start('b')).toBe(true);
    q.notify({ type: 'defeat', target: 'pidgey' });
    expect(q.states.b.status).toBe('active');
    q.notify({ type: 'defeat', target: 'rattata' });
    expect(q.states.b.status).toBe('completed');
  });
  it('persists and restores progress', () => {
    const q = new QuestManager(defs);
    q.notify({ type: 'talk', target: 'prof' });
    const q2 = new QuestManager(defs, q.serialize());
    expect(q2.states.a.step).toBe(1);
  });
});

describe('save v3 & shared collection', () => {
  it('migrates v2 saves and keeps stats', () => {
    const v2 = { version: 2, settings: { sfx: false, showFps: true }, stats: { runs: 4, victories: 1, bestTime: 300, totalKills: 900, bossesDefeated: 2, bestLevel: 20 }, unlockedPokemon: ['charmander'], currency: 12, achievements: [], permanentUpgrades: {} };
    const m = migrate(v2);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.settings.quality).toBe('high');
    expect(m.settings.sfx).toBe(false);
    expect(m.stats.runs).toBe(4);
    expect(m.collection).toEqual([]);
    expect(m.adventure).toBeNull();
  });
  it('caught Pokémon become available in Survivor', () => {
    const s = defaultSave();
    s.collection.push(makeOwned('pikachu', 7, 'wild'));
    expect(survivorPool(s)).toContain('pikachu');
  });
  it('Survivor unlock rule: reaching 10:00 adds recruited species at Lv5', () => {
    const s = defaultSave();
    const short = recordRun(s, { victory: false, time: 300, kills: 10, level: 5, bosses: 0, recruited: ['charmander', 'squirtle'] }, (sp) => makeOwned(sp, 5, 'survivor'));
    expect(short.collection.length).toBe(0);
    const long = recordRun(s, { victory: false, time: 620, kills: 10, level: 5, bosses: 1, recruited: ['charmander', 'squirtle'] }, (sp) => makeOwned(sp, 5, 'survivor'));
    expect(long.collection.map((c) => c.species)).toEqual(['charmander', 'squirtle']);
    expect(long.collection.every((c) => c.level === 5)).toBe(true);
  });
  it('Survivor run upgrades never modify the permanent collection', () => {
    const s = defaultSave();
    const p = makeOwned('charmander', 12, 'starter');
    s.collection.push(p);
    const w = new World({ starter: 'charmander', seed: 1 });
    w.gainExp(5000);
    while (w.state === 'levelup') w.chooseOffer(0);
    expect(w.allies[0].level).toBeGreaterThan(12);
    expect(s.collection[0].level).toBe(12);
  });
});

describe('AdventureState', () => {
  it('collection, party, items and rewards', () => {
    const st = new AdventureState(defaultSave());
    const a = st.addPokemon('charmander', 5, 'starter');
    expect(st.party().map((p) => p.uid)).toEqual([a.uid]);
    expect(st.save.pokedex.caught).toContain('charmander');
    expect(st.togglePartyMember(a.uid)).toBe(false); // keep at least one
    const lines = st.grant({ items: { pokeball: 5 }, worldExp: 400, reputation: 5, pokemon: { species: 'pikachu', level: 7 } });
    expect(st.item('pokeball')).toBe(5);
    expect(st.consume('pokeball')).toBe(true);
    expect(st.item('pokeball')).toBe(4);
    expect(st.worldLevel).toBe(2);
    expect(st.party().length).toBe(2);
    expect(lines.some((l) => l.includes('Pikachu'))).toBe(true);
  });
  it('main quest flows through real quest data', () => {
    const st = new AdventureState(defaultSave());
    expect(st.quests.states['q-main-1'].status).toBe('active');
    st.notify({ type: 'talk', target: 'prof' });
    st.notify({ type: 'capture', target: 'pidgey' });
    const done = st.notify({ type: 'talk', target: 'prof' });
    expect(done.map((d) => d.id)).toEqual(['q-main-1']);
    expect(st.quests.states['q-main-2'].status).toBe('available');
    expect(st.quests.states['q-side-farm'].status).toBe('available');
  });
});

describe('Starter Valley map', () => {
  it('is deterministic and chunked', () => {
    const a = valley(), b = valley();
    for (let i = 0; i < 400; i++) {
      const x = (i * 37) % 160, y = (i * 53) % 128;
      expect(a.terrainAt(x, y)).toBe(b.terrainAt(x, y));
      expect(a.tileIndexAt(x, y, 0)).toBe(b.tileIndexAt(x, y, 0));
    }
    expect(a.objectsInChunk(3, 2).map((o) => o.id)).toEqual(b.objectsInChunk(3, 2).map((o) => o.id));
  });
  it('has water, borders and buildings that block movement but spawn point is free', () => {
    const m = valley();
    expect(m.terrainAt(128, 70)).toBe(T.Water);
    expect(m.solidAt(128, 70)).toBe(true);
    expect(m.solidAt(0, 0)).toBe(true);
    expect(m.solidAt(70, 87)).toBe(true); // lab
    const sp = (valleyJson as unknown as RegionDef).spawn;
    expect(m.solidAt(sp.x, sp.y)).toBe(false);
  });
  it('every authored interactable sits on a walkable tile', () => {
    const m = valley();
    const d = valleyJson as unknown as RegionDef;
    for (const o of [...d.npcs, ...d.trainers, ...d.waypoints, ...d.chests, d.rescue]) expect(m.solidAt(o.x, o.y), `${JSON.stringify(o).slice(0, 40)}`).toBe(false);
    for (const p of d.puzzles[0].plates) expect(m.solidAt(p[0], p[1])).toBe(false);
  });
  it('habitats map to spawn tables', () => {
    const m = valley();
    let grass = 0;
    for (let y = 50; y < 88; y++) for (let x = 16; x < 64; x++) if (m.habitatAt(x, y) === 'meadow-grass') grass++;
    expect(grass).toBeGreaterThan(50);
    expect(m.spawnTable('meadow-grass').length).toBeGreaterThan(0);
    expect(m.habitatAt(81, 100)).toBeNull(); // village is safe
  });
});

describe('adventure World (shared combat engine)', () => {
  it('allies ignore calm wild Pokémon but fight hostile ones', () => {
    const w = advWorld();
    w.teleport(44 * TILE_PX, 70 * TILE_PX);
    w.addPokemon('charmander', { level: 10 });
    const t = w.trainer;
    const wild = w.spawnWild('pidgey', 5, t.x + 120, t.y, { wild: makeWildState(t.x + 120, t.y, 'neutral', { aggroR: 10 }) });
    for (let i = 0; i < 60; i++) w.step(STEP);
    expect(wild.hp).toBe(wild.maxHp);
    wild.hostile = true;
    for (let i = 0; i < 60 * 6; i++) w.step(STEP);
    expect(wild.hp).toBeLessThan(wild.maxHp);
  });
  it('tactical commands: follow stops attacking, attack focuses a target', () => {
    const w = advWorld();
    w.teleport(44 * TILE_PX, 70 * TILE_PX);
    w.addPokemon('charmander', { level: 12 });
    const t = w.trainer;
    const a = w.spawnWild('rattata', 5, t.x + 150, t.y, { hostile: true, wild: makeWildState(t.x + 150, t.y, 'neutral', { aggroR: 5 }) });
    const b = w.spawnWild('rattata', 5, t.x - 150, t.y, { hostile: false, wild: makeWildState(t.x - 150, t.y, 'neutral', { aggroR: 5 }) });
    w.setCommand('follow');
    for (let i = 0; i < 120; i++) w.step(STEP);
    expect(a.hp).toBe(a.maxHp);
    w.setCommand('attack', b);
    expect(b.hostile).toBe(true);
    for (let i = 0; i < 60 * 6; i++) w.step(STEP);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('terrain blocks movement (water)', () => {
    const w = advWorld();
    w.teleport(108 * TILE_PX, 70 * TILE_PX);
    for (let i = 0; i < 240; i++) { w.input.x = 1; w.input.y = 0; w.step(STEP); }
    const m = valley();
    expect(m.solidAt(Math.floor(w.trainer.x / TILE_PX), Math.floor(w.trainer.y / TILE_PX))).toBe(false);
  });
  it('wild AI: timid flees, aggressive chases and attacks with real skills', () => {
    const w = advWorld();
    w.teleport(44 * TILE_PX, 70 * TILE_PX);
    const t = w.trainer;
    const shy = w.spawnWild('pidgey', 5, t.x + 100, t.y, { wild: makeWildState(t.x + 100, t.y, 'timid') });
    const mean = w.spawnWild('rattata', 6, t.x - 160, t.y, { wild: makeWildState(t.x - 160, t.y, 'aggressive') });
    const shyStart = Math.hypot(shy.x - t.x, shy.y - t.y);
    for (let i = 0; i < 60 * 3; i++) w.step(STEP);
    expect(Math.hypot(shy.x - t.x, shy.y - t.y)).toBeGreaterThan(shyStart + 60);
    expect(mean.hostile).toBe(true);
    for (let i = 0; i < 60 * 4; i++) w.step(STEP);
    expect(t.hp).toBeLessThan(t.maxHp);
  });
  it('wild Pokémon cycle through ecosystem states when undisturbed', () => {
    const w = advWorld();
    w.teleport(20 * TILE_PX, 110 * TILE_PX);
    const x = 44 * TILE_PX, y = 70 * TILE_PX;
    const u = w.spawnWild('caterpie', 4, x, y, { wild: makeWildState(x, y, 'timid') });
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 40; i++) { w.step(STEP); seen.add(u.wild!.mode); }
    expect(seen.has('wander')).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    w.env.night = true;
    for (let i = 0; i < 60 * 60; i++) { w.step(STEP); seen.add(u.wild!.mode); }
    expect(seen.has('sleep')).toBe(true);
  });
  it('capture hides the unit and removes it on success', () => {
    const w = advWorld();
    const u = w.spawnWild('pidgey', 3, w.trainer.x + 60, w.trainer.y, { wild: makeWildState(0, 0, 'timid') });
    w.beginCapture(u);
    w.step(STEP);
    expect(w.enemies.includes(u)).toBe(true);
    w.endCapture(u, true);
    w.step(STEP);
    expect(w.enemies.includes(u)).toBe(false);
  });
});

describe('SpawnManager', () => {
  it('spawns habitat species near the player, capped', () => {
    const map = valley();
    const w = advWorld(map);
    w.teleport(44 * TILE_PX, 70 * TILE_PX);
    const spawnedAt = new Map<number, { x: number; y: number }>();
    const sm = new SpawnManager(w, map, { maxActive: 6, isNight: () => false, weather: () => 'clear', loaded: () => true, onSpawn: (u) => spawnedAt.set(u.id, { x: u.x, y: u.y }) });
    for (let i = 0; i < 60 * 30; i++) { sm.update(STEP); w.step(STEP); }
    const wild = sm.wildUnits();
    expect(wild.length).toBeGreaterThan(2);
    expect(wild.length).toBeLessThanOrEqual(6);
    // encounter system: species from the region's biome pool, level inside the region range (stage floor respected)
    for (const u of wild) {
      const e = ECOLOGY.get(u.defId)!;
      const at = spawnedAt.get(u.id)!; // where it spawned (wild Pokémon wander afterwards)
      const region = regionOfArea(map.areaAt(Math.floor(at.x / TILE_PX), Math.floor(at.y / TILE_PX))?.id)!;
      expect(e.legendary || e.mythical, u.defId).toBe(false);
      expect(e.biomes, u.defId).toContain(region.biome === 'meadow' ? 'meadow' : e.biomes.find((b) => b === region.biome) ?? region.biome);
      expect(u.level).toBeGreaterThanOrEqual(Math.max(region.level[0], e.minLevel));
      expect(u.level).toBeLessThanOrEqual(region.level[1] + 3);
    }
    void REGIONS;
  });
  it('respects time of day', () => {
    const map = valley();
    const w = advWorld(map);
    const sm = new SpawnManager(w, map, { isNight: () => true, weather: () => 'clear', loaded: () => true });
    for (let i = 0; i < 200; i++) {
      const e = sm.pickSpecies(map.spawnTable('meadow-grass'));
      expect(['pidgey', 'caterpie']).not.toContain(e?.species);
    }
  });
});

describe('Dungeon: Ancient Cave', () => {
  it('full run: waves → hazard → puzzle → boss → reward', () => {
    const map = dungeon();
    const w = advWorld(map);
    w.addPokemon('squirtle', { level: 30 });
    w.addPokemon('bulbasaur', { level: 30 });
    let bossDown = false;
    const dc = new DungeonController(w, map, 'normal', { banner: () => {}, doorsChanged: () => {}, bossDefeated: () => (bossDown = true) });
    const go = (tx: number, ty: number) => { w.teleport((tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX); dc.update(STEP); w.step(STEP); };
    go(map.start.x, map.start.y);
    expect(dc.phase).toBe('entrance');
    go(15, 60);
    expect(dc.phase).toBe('waves');
    expect(map.doorOpen('D')).toBe(false);
    for (let wave = 0; wave < 3; wave++) {
      // twice: Geodude/Magnemite have Sturdy (survive the first lethal hit at 1 HP)
      for (let k = 0; k < 2; k++) for (const u of dc.waveUnits) if (u.alive) w.applyDamage(u, 99999, w.allies[0]);
      for (let i = 0; i < 100; i++) { dc.update(STEP); w.step(STEP); }
    }
    expect(dc.phase).toBe('hazard');
    expect(map.doorOpen('D')).toBe(true);
    go(15, 45);
    for (let i = 0; i < 120; i++) { dc.update(STEP); w.step(STEP); }
    expect(w.zones.some((z) => z.active)).toBe(true); // falling rocks
    go(15, 31);
    expect(dc.phase).toBe('puzzle');
    while (dc.demoRunning) dc.update(0.2);
    // wrong plate first → resets
    const order = map.def.plateOrder;
    const wrong = [0, 1, 2].find((i) => i !== order[0])!;
    go(map.plates[wrong].x, map.plates[wrong].y);
    expect(dc.progress).toBe(0);
    while (dc.demoRunning) dc.update(0.2);
    for (const i of order) { go(15, 24); go(map.plates[i].x, map.plates[i].y); }
    expect(dc.phase).toBe('bossWait');
    expect(map.doorOpen('Q')).toBe(true);
    go(15, 10);
    expect(dc.phase).toBe('boss');
    expect(dc.boss?.alive).toBe(true);
    beatBossTo(w, dc.boss!, 0); // through every phase (no single hit skips one)
    dc.update(STEP);
    expect(bossDown).toBe(true);
    expect(dc.phase).toBe('reward');
    const r = dc.openChest();
    expect(r?.items.pokeball).toBe(3);
    expect(dc.openChest()).toBeNull();
    expect(dc.phase).toBe('done');
  });
  it('difficulty scales level and rewards', () => {
    const d = (dungeonJson as unknown as DungeonDef).difficulties;
    expect(d.expert.level).toBeGreaterThan(d.hard.level);
    expect(d.hard.level).toBeGreaterThan(d.normal.level);
    expect(d.expert.rewards.exp).toBeGreaterThan(d.normal.rewards.exp);
  });
});
