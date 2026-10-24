import { describe, expect, it } from 'vitest';
import { ECOLOGY, eligible, isAquatic, REGIONS } from '../src/core/encounters';
import { POKEMON, SKILLS } from '../src/core/data';
import { STEP, World } from '../src/core/world';

const all = [...ECOLOGY.values()];

describe('National Dex to Gen 9', () => {
  it('every generation 1–9 is present with real data and usable moves', () => {
    const per = new Map<number, number>();
    for (const e of all) per.set(e.gen, (per.get(e.gen) ?? 0) + 1);
    // official counts per generation
    expect(Object.fromEntries([...per].sort((a, b) => a[0] - b[0]))).toEqual({ 1: 151, 2: 100, 3: 135, 4: 107, 5: 156, 6: 72, 7: 88, 8: 96, 9: 120 });
    for (const e of all.filter((x) => x.gen >= 5)) {
      const p = POKEMON.get(e.id);
      expect(p, e.id).toBeTruthy();
      expect(p!.skills.length, e.id).toBeGreaterThan(0);
      for (const s of p!.skills) expect(SKILLS.has(s), `${e.id}:${s}`).toBe(true);
      expect(p!.skills.some((s) => SKILLS.get(s)!.power > 0), `${e.id} has an attack`).toBe(true);
    }
  });

  it('starters, fossils, Ultra Beasts and Paradox Pokémon are never ordinary random spawns', () => {
    for (const id of ['snivy', 'rowlet', 'sprigatito', 'fuecoco', 'quaxly', 'tyrunt', 'nihilego', 'kartana', 'great-tusk', 'iron-valiant', 'roaring-moon'])
      expect(ECOLOGY.get(id)!.method, id).toBe('event');
    for (const id of ['koraidon', 'miraidon', 'zacian', 'xerneas', 'reshiram', 'solgaleo']) expect(ECOLOGY.get(id)!.legendary, id).toBe(true);
    for (const r of REGIONS.values()) for (const aquatic of [false, true]) {
      const pool = eligible({ biome: r.biome, aquatic, night: true, weather: 'clear' } as never, r);
      expect(pool.every((e) => e.method === 'wild' && !e.legendary && !e.mythical), r.id).toBe(true);
    }
  });

  it('new species join the regional pools by habitat (and the aquatic rule)', () => {
    const r = REGIONS.get('vn-cm-uminh')!;
    const land = eligible({ biome: r.biome, night: false, weather: 'clear' } as never, r);
    expect(land.filter((e) => e.gen >= 5).length).toBeGreaterThan(10);
    expect(land.some((e) => POKEMON.get(e.id)!.types.includes('ice'))).toBe(false); // still no Ice in Cà Mau
    for (const id of ['basculin', 'arrokuda', 'finizen', 'dondozo', 'wishiwashi']) expect(isAquatic(id), id).toBe(true);
    for (const id of ['popplio', 'primarina', 'wooloo', 'lechonk']) expect(isAquatic(id), id).toBe(false);
  });

  it('a Gen 9 Pokémon fights in the real-time engine', () => {
    const w = new World({ mode: 'adventure', seed: 4, width: 3000, height: 3000 });
    const a = w.addPokemon('sprigatito', { level: 20 });
    const t = w.trainer;
    const foe = w.spawnWild('lechonk', 18, t.x + 150, t.y, { hostile: true })!;
    const hp = foe.hp;
    for (let i = 0; i < 60 * 15 && foe.alive; i++) w.step(STEP);
    expect(foe.hp < hp || !foe.alive).toBe(true);
    expect(a.skills.length).toBeGreaterThan(0);
  });
});
