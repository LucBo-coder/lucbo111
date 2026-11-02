import { describe, expect, it } from 'vitest';
import { castformLook, loreWeatherText, moveSource, weatherMovesOf, weatherMoveText } from '../src/core/battleWeather';
import { getSkill, POKEMON } from '../src/core/data';
import { canMega, ITEM_DEFS, itemEvolution } from '../src/core/evolution';
import { STEP, World } from '../src/core/world';
import ecology from '../src/data/dex/ecology.json';

// V39: the forms that waited for art (Mega Froslass, Castform's weather forms, Alolan Vulpix / Ninetales), weather moves
// (Rain Dance, Sunny Day, Sandstorm, Hail) on key C, and Dragonair's lore weather.

const world = (seed = 1) => new World({ mode: 'adventure', seed, width: 4000, height: 4000 });

describe('new forms', () => {
  it('Mega Froslass: Ice / Ghost, its stone Froslassite, and Snow Warning calls snow', () => {
    const m = POKEMON.get('froslass-mega')!;
    expect(m.types).toEqual(['ice', 'ghost']);
    expect(m.mega).toEqual({ base: 'froslass', stone: 'froslassite' });
    expect(m.baseStats.spa).toBe(140);
    expect(ITEM_DEFS.get('froslassite')).toMatchObject({ kind: 'megaStone', megaFor: 'froslass', form: 'froslass-mega' });
    expect(canMega('froslass', 'froslassite', true, false, 0)).toEqual({ ok: true, form: 'froslass-mega' });
    expect(m.passive?.id).toBe('snow-warning');
  });

  it('Alolan Vulpix / Ninetales: species of their own; only the Alolan Vulpix evolves with an Ice Stone', () => {
    expect(POKEMON.get('vulpix-alola')!.types).toEqual(['ice']);
    expect(POKEMON.get('ninetales-alola')!.types).toEqual(['ice', 'fairy']);
    expect(itemEvolution('vulpix-alola', 'ice-stone')?.to).toBe('ninetales-alola');
    expect(itemEvolution('vulpix', 'ice-stone')).toBeNull();
    expect(itemEvolution('vulpix', 'fire-stone')?.to).toBe('ninetales');
    expect(itemEvolution('vulpix-alola', 'fire-stone')).toBeNull();
    // wild in the snow, under the base species' Pokédex number
    const e = (ecology as { id: string; dex: number; biomes: string[]; method: string }[]).find((x) => x.id === 'vulpix-alola')!;
    expect(e).toMatchObject({ dex: 37, method: 'wild' });
    expect(e.biomes).toContain('snow');
  });

  it("Castform's look follows the weather (sun, rain-cloud and snow-cloud guises)", () => {
    expect(castformLook(['fire'])).toBe('castform-sunny');
    expect(castformLook(['water'])).toBe('castform-rainy');
    expect(castformLook(['ice'])).toBe('castform-snowy');
    expect(castformLook(['normal'])).toBeUndefined();
    const w = world();
    const c = w.addPokemon('castform', { level: 30 });
    w.setBattleWeather('snow', 30, null);
    w.step(STEP);
    expect(c.types).toEqual(['ice']);
    expect(c.look).toBe('castform-snowy');
    w.endBattleWeather();
    w.step(STEP);
    expect(c.look).toBeUndefined();
  });
});

describe('weather moves on key C', () => {
  it('a Pokémon knows a weather move from the level its species learns it', () => {
    expect(weatherMovesOf('squirtle', 32)).toEqual([]);
    expect(weatherMovesOf('squirtle', 33)).toEqual(['rain-dance']);
    expect(weatherMovesOf('castform', 20).sort()).toEqual(['hail', 'rain-dance', 'sunny-day']);
    expect(moveSource('larvitar', 10, null)).toMatchObject({ act: 'sand', trigger: 'command', origin: 'move' });
    // several (Castform): the one whose weather is not up already
    expect(moveSource('castform', 20, 'rain')!.act).not.toBe('rain');
    expect(weatherMoveText('squirtle', 10)).toMatch(/Rain Dance \(Mưa, Lv 33\)/);
    expect(weatherMoveText('squirtle', 40)).toMatch(/đã biết/);
    expect(weatherMoveText('pikachu', 50)).toBeNull();
  });

  it('the trainer calls it with C; it never fires by itself, and a wild one never uses it', () => {
    const w = world();
    const sq = w.addPokemon('wartortle', { level: 40 });
    const foe = w.spawnWild('rattata', 30, sq.x + 80, sq.y, { hostile: true });
    sq.target = foe;
    for (let i = 0; i < 60; i++) w.step(STEP);
    expect(w.battleWeather).toBeNull();
    const r = w.tryCallWeather();
    expect(r.ok).toBe(true);
    expect(w.battleWeather?.kind).toBe('rain');
    // a wild Wartortle knowing Rain Dance: no source at all
    const wild = w.spawnWild('wartortle', 45, sq.x + 200, sq.y, { hostile: true });
    expect(w.weatherSource(wild)).toBeNull();
  });
});

describe('Dragonair controls the weather (lore)', () => {
  it('on its trainer call: rain for the fields, sun when it is raining already; never by itself', () => {
    expect(loreWeatherText('dragonair')).toMatch(/^Theo Pokédex/);
    const w = world();
    const d = w.addPokemon('dragonair', { level: 40 });
    const foe = w.spawnWild('rattata', 30, d.x + 80, d.y, { hostile: true });
    d.target = foe;
    for (let i = 0; i < 60; i++) w.step(STEP);
    expect(w.battleWeather).toBeNull();
    expect(w.tryCallWeather().ok).toBe(true);
    expect(w.battleWeather?.kind).toBe('rain');
    d.weatherCallAt = -1e9; // skip the cooldown
    expect(w.tryCallWeather().ok).toBe(true);
    expect(w.battleWeather?.kind).toBe('sun');
  });
});

describe('Cherrim and Flower Gift', () => {
  it('Cherrim blooms in the sun (Sunshine form) and Flower Gift is described as what it does', () => {
    expect(POKEMON.get('cherrim')!.passive).toMatchObject({ id: 'flower-gift', kind: 'weather' });
    const w = world();
    const c = w.addPokemon('cherrim', { level: 30 });
    w.step(STEP);
    expect(c.look).toBeUndefined();
    w.setBattleWeather('sun', 30, null);
    w.step(STEP);
    expect(c.look).toBe('cherrim-sunshine');
  });

  it("in the sun, Cherrim's side hits harder physically and takes special hits more lightly", () => {
    /** damage of one fixed hit (no crit, no miss, middle roll) of `category` from a Machamp ally on a wild Snorlax */
    const dmg = (sun: boolean, cherrim: 'none' | 'ally' | 'foe', category: 'physical' | 'special') => {
      const w = world(3);
      (w.rng as unknown as { next: () => number }).next = () => 0.5;
      (w.rng as unknown as { chance: () => boolean }).chance = () => false;
      const a = w.addPokemon('machamp', { level: 50 });
      a.critRate = 0;
      a.passive = null;
      if (cherrim === 'ally') w.addPokemon('cherrim', { level: 50 }).passive = POKEMON.get('cherrim')!.passive;
      const foe = w.spawnWild('snorlax', 50, a.x + 40, a.y, { hostile: true });
      foe.maxHp = foe.hp = 1e7;
      foe.passive = null;
      if (cherrim === 'foe') { const c = w.spawnWild('cherrim', 50, a.x + 400, a.y, { hostile: true }); c.passive = POKEMON.get('cherrim')!.passive; }
      if (sun) w.setBattleWeather('sun', 60, null);
      const def = { ...getSkill('tackle'), type: 'fighting' as const, category, power: 80, accuracy: undefined };
      (w as unknown as { hit: (a: unknown, b: unknown, c: unknown, d: number) => void }).hit(a, foe, { def, cd: 0, level: 1, powerBonus: 0 }, 1);
      return 1e7 - foe.hp;
    };
    expect(dmg(true, 'ally', 'physical') / dmg(true, 'none', 'physical')).toBeCloseTo(1.5, 1);
    expect(dmg(false, 'ally', 'physical') / dmg(false, 'none', 'physical')).toBeCloseTo(1, 2);
    expect(dmg(true, 'ally', 'special') / dmg(true, 'none', 'special')).toBeCloseTo(1, 2);
    expect(dmg(true, 'foe', 'special') / dmg(true, 'none', 'special')).toBeCloseTo(1 / 1.5, 1);
  });
});
