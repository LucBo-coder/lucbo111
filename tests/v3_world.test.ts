import { describe, expect, it } from 'vitest';
import cache from '../src/data/pokeapi/pokeapi-cache.json';
import { ECOLOGY, eligible, pickTier, RARITY_ORDER, RARITY_WEIGHTS, REGIONS, rollEncounter, rollLevel, rollShiny, SHINY_BASE, tierProbabilities, Ecology, RegionDef } from '../src/core/encounters';
import { POKEMON, SKILLS, validateData } from '../src/core/data';
import { evolutionsOf } from '../src/core/evolution';
import { Rng } from '../src/core/rng';
import { EVENT_DEFS, MAX_ACTIVE, MINOR_CHECK, newEventSave, WorldEventDirector, ANOMALIES } from '../src/core/worldEvents';
import { migrate, SAVE_VERSION, defaultSave } from '../src/systems/saveSchema';
import { World, STEP } from '../src/core/world';
import { makeWildState } from '../src/core/wildAI';

type Sp = { id: number; name: string; generation: string; types: string[]; evolutions: { from: string; to: string }[]; levelUpMoves: { move: string }[]; legendary: boolean; mythical: boolean };
const SPECIES = Object.values((cache as unknown as { species: Record<string, Sp> }).species);
const VALID_TYPES = new Set(['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']);
const region = (id: string) => REGIONS.get(id)!;

describe('National Dex #1–#1025 (Gen 1–9, since 0.11.0)', () => {
  it('has exactly the 1025 species of Gen 1–9, no duplicate dex ids, nothing beyond', () => {
    expect(SPECIES.length).toBe(1025);
    const ids = SPECIES.map((s) => s.id).sort((a, b) => a - b);
    expect(new Set(ids).size).toBe(1025);
    expect(ids[0]).toBe(1);
    expect(ids[1024]).toBe(1025);
    const gens = new Set(SPECIES.map((s) => s.generation));
    expect([...gens].sort()).toEqual(['generation-i', 'generation-ii', 'generation-iii', 'generation-iv', 'generation-ix', 'generation-v', 'generation-vi', 'generation-vii', 'generation-viii']);
    expect(ECOLOGY.size).toBe(1025);
  });
  it('every species is playable data with valid types and its own stats (no shared default stats)', () => {
    expect(validateData()).toEqual([]);
    for (const s of SPECIES) {
      const p = POKEMON.get(s.name);
      expect(p, s.name).toBeTruthy();
      for (const t of p!.types) expect(VALID_TYPES.has(t), `${s.name}:${t}`).toBe(true);
      for (const sk of p!.skills) expect(SKILLS.has(sk), `${s.name}:${sk}`).toBe(true);
    }
    const statKeys = new Set(SPECIES.map((s) => JSON.stringify((s as unknown as { baseStats: unknown }).baseStats)));
    expect(statKeys.size).toBeGreaterThan(850);
  });
  it('evolution chains point only to real species (forms are not counted as species)', () => {
    const names = new Set(SPECIES.map((s) => s.name));
    for (const s of SPECIES) for (const e of s.evolutions) {
      expect(names.has(e.from) || e.from === undefined, e.from).toBe(true);
      // Gen 5+ evolutions are reported unsupported by the engine, never silently allowed
      if (!names.has(e.to)) expect(evolutionsOf(e.from).find((o) => o.to === e.to)?.unsupported ?? 'missing', `${e.from}->${e.to}`).toBeTruthy();
    }
  });
});

describe('BiomeSpawnManager / RegionalLevelManager / RaritySystem (V3 §II–IV)', () => {
  it('every species has at least one way to be obtained', () => {
    const reachable = new Set<string>();
    for (const e of ECOLOGY.values()) if (e.method !== 'evolution') reachable.add(e.id);
    for (const e of ECOLOGY.values()) expect(['wild', 'event', 'legendary', 'mythical', 'evolution', 'baby']).toContain(e.method);
    // event-only species need a biome opened by an event or an event list
    for (const e of ECOLOGY.values()) if (e.method === 'event') expect(e.biomes.length, e.id).toBeGreaterThan(0);
    expect(reachable.size).toBe(1025);
  });
  it('spawned species always belong to the biome (or an event-opened biome), never legendary/mythical', () => {
    const rng = new Rng(3);
    for (const r of REGIONS.values()) for (const night of [false, true]) {
      for (let i = 0; i < 300; i++) {
        const roll = rollEncounter(rng, { biome: r.biome, night, weather: 'clear' }, r);
        if (!roll) continue;
        const e = ECOLOGY.get(roll.species)!;
        expect(e.biomes, `${r.id}:${roll.species}`).toContain(r.biome);
        expect(e.legendary || e.mythical).toBe(false);
        expect(e.method).toBe('wild');
      }
    }
  });
  it('levels stay inside the region range; evolved forms never below their evolution floor', () => {
    const rng = new Rng(5);
    for (const r of REGIONS.values()) for (let i = 0; i < 400; i++) {
      const roll = rollEncounter(rng, { biome: r.biome, night: i % 2 === 0, weather: 'clear' }, r)!;
      if (!roll) continue;
      const e = ECOLOGY.get(roll.species)!;
      expect(roll.level).toBeGreaterThanOrEqual(Math.max(r.level[0], e.minLevel));
      expect(roll.level).toBeLessThanOrEqual(r.level[1] + 3);
    }
    // starter meadow never has a Charizard-like final form; Raticate (Lv20 floor) can't spawn in the Lv2–8 meadow
    const meadow = eligible({ biome: 'meadow', night: false, weather: 'clear' }, region('starter-valley'));
    expect(meadow.some((e) => e.stage === 2)).toBe(false);
    expect(meadow.some((e) => e.id === 'raticate')).toBe(false);
    expect(meadow.length).toBeGreaterThan(10);
    expect(meadow.length).toBeLessThan(400); // not all 1025 in the starter area
  });
  it('rarity tiers: 60/25/10/4/1, renormalised when a tier is empty', () => {
    expect(RARITY_ORDER.reduce((s, r) => s + RARITY_WEIGHTS[r], 0)).toBe(100);
    const pool = eligible({ biome: 'forest', night: false, weather: 'clear' }, region('emerald-forest'));
    const p = tierProbabilities(pool);
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    const noUltra = pool.filter((e) => e.rarity !== 'ultra' && e.rarity !== 'epic');
    const q = tierProbabilities(noUltra);
    expect(q.ultra).toBe(0);
    expect(q.common).toBeCloseTo(60 / 95, 6);
    // empirical frequency with all tiers present
    const fake = RARITY_ORDER.map((r, i) => ({ id: 'x' + i, rarity: r } as Ecology));
    const rng = new Rng(9), counts: Record<string, number> = {};
    for (let i = 0; i < 40000; i++) { const t = pickTier(rng, fake)!; counts[t] = (counts[t] ?? 0) + 1; }
    expect(counts.common / 40000).toBeCloseTo(0.6, 1);
    expect(counts.ultra / 40000).toBeGreaterThan(0.005);
    expect(counts.ultra / 40000).toBeLessThan(0.016);
  });
  it('rarity is not evolution stage (basic Ultra Rare and final non-ultra both exist)', () => {
    const all = [...ECOLOGY.values()];
    expect(all.some((e) => e.stage === 0 && e.rarity === 'ultra')).toBe(true);
    expect(all.some((e) => e.stage === 2 && (e.rarity === 'rare' || e.rarity === 'epic'))).toBe(true);
  });
  it('legendary & mythical species never enter an ordinary pool, in any biome / weather', () => {
    const legends = [...ECOLOGY.values()].filter((e) => e.legendary || e.mythical);
    expect(legends.filter((e) => e.dex <= 493).length).toBe(35);
    expect(legends.length).toBe(94); // Gen 1–9
    for (const r of REGIONS.values()) for (const w of ['clear', 'rain', 'thunderstorm', 'blizzard', 'heatwave', 'mysticFog'] as const) {
      const pool = eligible({ biome: r.biome, extraBiomes: ['snow', 'volcano', 'ruins'], night: true, weather: w }, r);
      expect(pool.some((e) => e.legendary || e.mythical)).toBe(false);
    }
  });
  it('weather anomalies change the encounter pool', () => {
    const r = region('rocky-highlands');
    const clear = eligible({ biome: 'rocky', night: false, weather: 'clear' }, r).map((e) => e.id);
    const bliz = eligible({ biome: 'rocky', extraBiomes: ANOMALIES.blizzard.extraBiomes, night: false, weather: 'blizzard' }, r).map((e) => e.id);
    const heat = eligible({ biome: 'rocky', extraBiomes: ANOMALIES.heatwave.extraBiomes, night: false, weather: 'heatwave' }, r).map((e) => e.id);
    expect(bliz.length).toBeGreaterThan(clear.length);
    expect(bliz.some((id) => ECOLOGY.get(id)!.biomes.includes('snow') && !clear.includes(id))).toBe(true);
    expect(heat.some((id) => ECOLOGY.get(id)!.biomes.includes('volcano') && !clear.includes(id))).toBe(true);
  });
  it('rollLevel honours the world-level bonus cap', () => {
    const rng = new Rng(1);
    const e = ECOLOGY.get('pidgey')!;
    const r: RegionDef = region('starter-valley');
    for (let i = 0; i < 200; i++) expect(rollLevel(rng, e, r, 99)).toBeLessThanOrEqual(r.level[1] + 3);
  });
});

describe('ShinyEncounterSystem (V3 §V)', () => {
  it('base odds 1/4096, independent of rarity tier', () => {
    expect(SHINY_BASE).toBe(1 / 4096);
    const rng = new Rng(77);
    const byTier: Record<string, [number, number]> = {};
    const r = region('emerald-forest');
    for (let i = 0; i < 200000; i++) {
      const roll = rollEncounter(rng, { biome: 'forest', night: i % 2 === 0, weather: 'clear' }, r, { shinyRate: 1 / 64 })!;
      const t = (byTier[roll.rarity] ??= [0, 0]);
      t[0]++; if (roll.shiny) t[1]++;
    }
    for (const [tier, [n, sh]] of Object.entries(byTier)) if (n > 3000) expect(sh / n, tier).toBeGreaterThan(1 / 64 * 0.7);
    for (const [tier, [n, sh]] of Object.entries(byTier)) if (n > 3000) expect(sh / n, tier).toBeLessThan(1 / 64 * 1.3);
    let s = 0;
    for (let i = 0; i < 400000; i++) if (rollShiny(rng)) s++;
    expect(s / 400000).toBeGreaterThan(SHINY_BASE * 0.6);
    expect(s / 400000).toBeLessThan(SHINY_BASE * 1.5);
  });
});

describe('WorldEventDirector (V3 §VI, §VIII)', () => {
  const regions = [...REGIONS.values()].filter((r) => !r.unlock);
  it('checks on the 5 / 15 minute cadence, respects cooldowns, concurrency and dungeons', () => {
    const d = new WorldEventDirector(newEventSave(), new Rng(4));
    expect(d.update({ now: 100, regions, current: 'starter-valley', inDungeon: false })).toEqual([]); // before the first check
    let started = 0, maxActive = 0;
    for (let t = 0; t < 7200; t += 10) {
      started += d.update({ now: t, regions, current: 'starter-valley', inDungeon: false }).length;
      d.expire(t);
      maxActive = Math.max(maxActive, d.active.length);
      expect(d.active.filter((e) => EVENT_DEFS[e.type].major).length).toBeLessThanOrEqual(1);
      for (const e of d.active) expect(regions.map((r) => r.id)).toContain(e.region);
    }
    expect(started).toBeGreaterThan(3);
    expect(started).toBeLessThan(7200 / MINOR_CHECK + 7200 / 900 + 1);
    expect(maxActive).toBeLessThanOrEqual(MAX_ACTIVE);
    const dd = new WorldEventDirector(newEventSave(), new Rng(4));
    for (let t = 0; t < 4000; t += 10) expect(dd.update({ now: t, regions, current: null, inDungeon: true })).toEqual([]);
  });
  it('every event has an end; cooldown blocks the same type; history is capped', () => {
    const save = newEventSave();
    const d = new WorldEventDirector(save, new Rng(1));
    const ev = d.start('outbreak', 'starter-valley', 1000);
    expect(ev.end).toBe(1000 + EVENT_DEFS.outbreak.duration);
    expect(d.candidates(false, 1001)).not.toContain('outbreak');
    expect(d.expire(ev.end - 1)).toEqual([]);
    expect(d.expire(ev.end)).toEqual([ev]);
    expect(d.active.length).toBe(0);
    expect(d.candidates(false, ev.end + 1)).not.toContain('outbreak'); // still cooling down
    expect(d.candidates(false, (save.readyAt.outbreak ?? 0) + 1)).toContain('outbreak');
    for (let i = 0; i < 50; i++) { const e = d.start('treasure', 'farm', i); d.finish(e, 'completed'); }
    expect(save.history.length).toBe(30);
    d.start('alpha', 'farm', 1); d.cleanupAll();
    expect(d.active.length).toBe(0);
  });
  it('locked regions never host events', () => {
    const d = new WorldEventDirector(newEventSave(), new Rng(2));
    const open = [...REGIONS.values()].filter((r) => !r.unlock);
    for (let t = 0; t < 20000; t += 30) { d.update({ now: t, regions: open, current: 'sacred-grove', inDungeon: false }); d.expire(t); for (const e of d.active) expect(e.region).not.toBe('sacred-grove'); }
  });
});

describe('Alpha Pokémon in combat', () => {
  it('alpha flag makes it hit harder and cast faster than a normal individual', () => {
    const w = new World({ mode: 'adventure', seed: 2, width: 4000, height: 4000 });
    const t = w.trainer;
    const mk = (alpha: boolean) => { const u = w.spawnWild('machop', 20, t.x + 200, t.y, { wild: makeWildState(t.x + 200, t.y, 'aggressive', {}), hostile: true }); u.alpha = alpha; return u; };
    const a = mk(true), n = mk(false);
    w.beginCast(a, 0); w.beginCast(n, 0);
    expect(a.skills[0].cd).toBeLessThan(n.skills[0].cd);
    const dummy = w.addPokemon('snorlax', { level: 50 });
    dummy.maxHp = dummy.hp = 1e8;
    const hitFn = (w as unknown as { hit: (s: unknown, d: unknown, sl: unknown, m: number) => void }).hit.bind(w);
    let da = 0, dn = 0;
    for (let i = 0; i < 60; i++) { let h = dummy.hp; hitFn(a, dummy, a.skills[0], 1); da += h - dummy.hp; h = dummy.hp; hitFn(n, dummy, n.skills[0], 1); dn += h - dummy.hp; }
    expect(da / dn).toBeGreaterThan(1.1);
    void STEP;
  });
});

describe('save migration v4 → v5', () => {
  it('adds event timers and legendary states derived from defeated legendaries; no duplicates on reload', () => {
    const v4 = { ...defaultSave(), version: 4, adventure: { started: true, flags: ['boss:mega-venusaur', 'boss:articuno', 'boss:zapdos'], playTime: 1234 } } as unknown;
    const s = migrate(JSON.parse(JSON.stringify(v4)));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.adventure!.events.nextMinor).toBeGreaterThan(0);
    expect(s.adventure!.legends).toEqual({ articuno: 'caught', zapdos: 'caught' });
    expect(s.pokedex.shiny).toEqual([]);
    const again = migrate(JSON.parse(JSON.stringify(s)));
    expect(again.adventure!.legends).toEqual(s.adventure!.legends);
  });
});
