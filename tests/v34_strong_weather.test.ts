import { describe, expect, it } from 'vitest';
import { abilityEffect, abilityOptions } from '../src/core/abilities';
import { abilitySource, canCallWeather, deltaStreamMult, strongWeatherBlocks, weatherBallSkill, weatherName } from '../src/core/battleWeather';
import { getSkill, POKEMON } from '../src/core/data';
import { STEP, World, type Unit } from '../src/core/world';

// Strong weathers, Air Lock / Cloud Nine and Weather Ball (docs/weather-pokemon-research.md §1.2 #3 #4 #5 #8).

const slotOf = (species: string, ability: string) => abilityOptions(species).find((a) => a.id === ability)!.slot;
const world = () => new World({ mode: 'adventure', seed: 3, width: 4000, height: 4000 });
/** one hit of a skill, damage dealt */
const hitWith = (w: World, src: Unit, dst: Unit, skill: string): number => {
  dst.maxHp = dst.hp = 1e6;
  const hp0 = dst.hp;
  (w as unknown as { hit: (a: Unit, b: Unit, s: unknown, m: number) => void }).hit(src, dst, { def: getSkill(skill), powerBonus: 0 }, 1);
  return hp0 - dst.hp;
};

describe('strong weather', () => {
  it('Primordial Sea / Desolate Land / Delta Stream are strong, tied to their Pokémon', () => {
    for (const id of ['primordial-sea', 'desolate-land', 'delta-stream']) expect(abilitySource(id)).toMatchObject({ strong: true, tied: true });
    expect(abilitySource('drizzle')?.strong).toBe(false);
    expect(abilitySource('delta-stream')?.act).toBe('wind');
    expect(weatherName('rain', true)).toBe('Mưa lớn');
    expect(POKEMON.get('rayquaza-mega')!.passive.kind).toBe('weather');
    expect(POKEMON.get('kyogre-primal')!.passive.description).toMatch(/Lửa thất bại/);
  });

  it('heavy rain makes damaging Fire moves fail; harsh sun stops Water', () => {
    expect(strongWeatherBlocks('rain', true, 'fire')).toBe(true);
    expect(strongWeatherBlocks('rain', false, 'fire')).toBe(false);
    expect(strongWeatherBlocks('sun', true, 'water')).toBe(true);
    const w = world();
    const k = w.addPokemon('kyogre', { level: 70 });
    const foe = w.spawnWild('charmander', 40, k.x + 80, k.y, { hostile: true });
    w.transformAlly(k, 'kyogre-primal', { mega: true });
    k.target = foe;
    w.step(STEP);
    expect(w.battleWeather).toMatchObject({ kind: 'rain', strong: true });
    expect(hitWith(w, foe, k, 'ember')).toBe(0);
    expect(hitWith(w, foe, k, 'tackle')).toBeGreaterThan(0);
  });

  it('an ordinary weather cannot replace a strong one; Rayquaza (lore) still calms it', () => {
    const w = world();
    const k = w.addPokemon('kyogre', { level: 70 });
    w.transformAlly(k, 'kyogre-primal', { mega: true });
    const foe = w.spawnWild('rattata', 30, k.x + 80, k.y, { hostile: true });
    k.target = foe;
    w.step(STEP);
    const torkoal = w.spawnWild('torkoal', 40, k.x - 80, k.y, { hostile: true });
    torkoal.passive = abilityEffect('torkoal', slotOf('torkoal', 'drought'));
    expect(w.weatherSource(torkoal)?.act).toBe('sun');
    torkoal.target = k;
    w.callWeather(torkoal);
    expect(w.battleWeather).toMatchObject({ kind: 'rain', strong: true });
    expect(canCallWeather(abilitySource('drought'), 'rain', 0, 1, true).reason).toMatch(/Mưa lớn/);
    const ray = w.spawnWild('rayquaza', 60, k.x, k.y + 80, { hostile: true });
    w.callWeather(ray);
    expect(w.battleWeather).toBeNull();
  });

  it('Delta Stream: a super-effective hit on a Flying type lands neutrally', () => {
    expect(deltaStreamMult('wind', true, 'rock', ['flying'])).toBe(0.5);
    expect(deltaStreamMult('wind', true, 'ice', ['dragon', 'flying'])).toBe(0.5);
    expect(deltaStreamMult('wind', true, 'fighting', ['flying'])).toBe(1);
    expect(deltaStreamMult('wind', false, 'rock', ['flying'])).toBe(1);
  });
});

describe('Air Lock / Cloud Nine', () => {
  it('Golduck (Cloud Nine) in the fight: the rain stays but does nothing', () => {
    const w = world();
    const g = w.addPokemon('golduck', { level: 40, abilitySlot: slotOf('golduck', 'cloud-nine') });
    expect(g.passive?.kind).toBe('weather');
    const foe = w.spawnWild('rattata', 30, g.x + 80, g.y, { hostile: true });
    g.target = foe;
    const dry = hitWith(w, g, foe, 'water_gun');
    w.setBattleWeather('rain', 40, null);
    expect(w.weatherLockedBy()).toBe(g.name);
    expect(w.activeWeather()).toBeNull();
    expect(w.battleWeather?.kind).toBe('rain');
    const wet = hitWith(w, g, foe, 'water_gun');
    expect(wet / dry).toBeGreaterThan(0.8);
    expect(wet / dry).toBeLessThan(1.25);
  });

  it('no sandstorm chip while the weather is locked', () => {
    const w = world();
    const g = w.addPokemon('golduck', { level: 40, abilitySlot: slotOf('golduck', 'cloud-nine') });
    w.setBattleWeather('sand', 40, null);
    const hp0 = g.hp;
    for (let t = 0; t < 5; t += STEP) w.step(STEP);
    expect(g.hp).toBeGreaterThanOrEqual(hp0 - 0.001);
    // control: the same without Cloud Nine wears it down
    const w2 = world();
    const d = w2.addPokemon('golduck', { level: 40, abilitySlot: slotOf('golduck', 'swift-swim') });
    w2.setBattleWeather('sand', 40, null);
    const d0 = d.hp;
    for (let t = 0; t < 5; t += STEP) w2.step(STEP);
    expect(d.hp).toBeLessThan(d0);
  });
});

describe('Weather Ball', () => {
  it('doubles and takes the weather type', () => {
    const wb = getSkill('weather_ball');
    expect(weatherBallSkill(wb, null)).toBe(wb);
    expect(weatherBallSkill(wb, 'rain')).toMatchObject({ type: 'water', power: wb.power * 2 });
    expect(weatherBallSkill(wb, 'sun').type).toBe('fire');
    expect(weatherBallSkill(wb, 'sand').type).toBe('rock');
    expect(weatherBallSkill(wb, 'snow').type).toBe('ice');
    expect(weatherBallSkill(getSkill('tackle'), 'rain').type).toBe('normal');
  });

  it('Castform with Weather Ball hits much harder in the rain', () => {
    const w = world();
    const c = w.addPokemon('castform', { level: 40 });
    const foe = w.spawnWild('geodude', 30, c.x + 80, c.y, { hostile: true });
    c.target = foe;
    const dry = hitWith(w, c, foe, 'weather_ball');
    w.setBattleWeather('rain', 40, null);
    const wet = hitWith(w, c, foe, 'weather_ball');
    expect(wet / dry).toBeGreaterThan(4); // ×2 power, ×1.5 rain, Water ×2 on Geodude (Rock/Ground ×4 actually)
  });
});
