import { describe, expect, it } from 'vitest';
import { abilityEffect, abilityOptions } from '../src/core/abilities';
import {
  SAND_TICK, speciesWeatherAbility, WEATHER_CALL_COOLDOWN, canCallWeather, abilitySource, WEATHER_DURATION, PRIMAL_WEATHER_DURATION, weatherDamageMult, weatherDuration, weatherOfAbility, weatherSpecies,
} from '../src/core/battleWeather';
import { STEP, World, type Unit } from '../src/core/world';

// Weather called by a Pokémon's ability: Drizzle / Drought / Sand Stream / Snow Warning (V32).

const slotOf = (species: string, ability: string) => abilityOptions(species).find((a) => a.id === ability)!.slot;
const hit = (w: World, a: Unit, b: Unit, type: string) => {
  const slot = a.skills.find((s) => s.def.type === type && s.def.power > 0) ?? a.skills.find((s) => s.def.power > 0)!;
  (w as unknown as { hit: (a: unknown, b: unknown, c: unknown, d: number) => void }).hit(a, b, slot, 1);
  return slot;
};
/** Fixed rolls so two hits compare exactly (no crit, no miss, middle variance). */
const steady = (w: World) => { (w.rng as unknown as { next: () => number }).next = () => 0.5; (w.rng as unknown as { chance: () => boolean }).chance = () => false; };

describe('weather abilities', () => {
  it('the species that call weather in the main series do here too', () => {
    const all = weatherSpecies();
    const by = (sp: string) => all.find((x) => x.species === sp);
    expect(by('pelipper')?.weather).toBe('rain');
    expect(by('kyogre')?.weather).toBe('rain');
    expect(by('torkoal')?.weather).toBe('sun');
    expect(by('groudon')?.weather).toBe('sun');
    expect(by('tyranitar')?.weather).toBe('sand');
    expect(by('hippowdon')?.weather).toBe('sand');
    expect(by('abomasnow')?.weather).toBe('snow');
    expect(by('ninetales')).toMatchObject({ weather: 'sun', hidden: true });
    expect(all.length).toBeGreaterThanOrEqual(18);
    // the ability shows its effect (party details) instead of the old "+5% crit" stand-in
    const p = abilityEffect('pelipper', slotOf('pelipper', 'drizzle'));
    expect(p.kind).toBe('weather');
    expect(p.description).toContain('Mưa');
  });

  it('damage: rain boosts Water and weakens Fire, sun the other way; Rock in sand and Ice in snow hold better', () => {
    expect(weatherDamageMult('rain', 'water', 'special', ['normal'])).toBe(1.5);
    expect(weatherDamageMult('rain', 'fire', 'special', ['normal'])).toBe(0.5);
    expect(weatherDamageMult('sun', 'fire', 'physical', ['normal'])).toBe(1.5);
    expect(weatherDamageMult('sun', 'water', 'physical', ['normal'])).toBe(0.5);
    expect(weatherDamageMult('sand', 'water', 'special', ['rock'])).toBeCloseTo(1 / 1.5);
    expect(weatherDamageMult('sand', 'water', 'physical', ['rock'])).toBe(1);
    expect(weatherDamageMult('snow', 'fighting', 'physical', ['ice'])).toBeCloseTo(1 / 1.5);
    expect(weatherDamageMult(null, 'water', 'special', ['fire'])).toBe(1);
    expect(weatherDuration('drizzle')).toBe(WEATHER_DURATION);
    expect(weatherDuration('primordial-sea')).toBe(PRIMAL_WEATHER_DURATION);
  });

  it('a weather Pokémon calls its weather when it joins a fight, once; it ends after its time', () => {
    const w = new World({ mode: 'adventure', seed: 3, width: 4000, height: 4000 });
    const pel = w.addPokemon('pelipper', { level: 40, abilitySlot: slotOf('pelipper', 'drizzle') });
    w.step(STEP);
    expect(w.battleWeather).toBeNull(); // out of its ball, but nothing to fight yet
    const foe = w.spawnWild('rattata', 30, pel.x + 80, pel.y, { hostile: true });
    pel.target = foe;
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('rain');
    expect(w.battleWeatherLeft()).toBeCloseTo(WEATHER_DURATION, 0);
    const ev = w.drainEvents().find((e) => e.t === 'weather');
    expect(ev).toMatchObject({ kind: 'rain', by: 'Pelipper', team: 'ally' });
    w.time = w.battleWeather!.until + 0.01;
    w.step(STEP);
    expect(w.battleWeather).toBeNull();
    // still the same Pokémon out: no second call
    w.step(STEP);
    expect(w.battleWeather).toBeNull();
  });

  it('a newer weather replaces the old one; an enemy boss calls its species weather', () => {
    const w = new World({ mode: 'adventure', seed: 4, width: 4000, height: 4000 });
    const ally = w.addPokemon('pelipper', { level: 40, abilitySlot: slotOf('pelipper', 'drizzle') });
    const foe = w.spawnWild('rattata', 30, ally.x + 80, ally.y, { hostile: true });
    ally.target = foe;
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('rain');
    expect(speciesWeatherAbility('tyranitar')).toBe('sand-stream');
    const boss = w.spawnBoss('tyranitar', 40, false, { x: ally.x + 200, y: ally.y });
    boss.hostile = true;
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('sand');
  });

  it('rain changes real hits: Water ×1.5, Fire ×0.5', () => {
    const dmg = (rain: boolean, type: 'water' | 'fire', attacker: string) => {
      const w = new World({ mode: 'adventure', seed: 7, width: 4000, height: 4000 });
      steady(w);
      const a = w.addPokemon(attacker, { level: 50 });
      const foe = w.spawnWild('snorlax', 50, a.x + 40, a.y, { hostile: true });
      foe.hp = foe.maxHp;
      if (rain) w.setBattleWeather('rain', 30, null);
      const before = foe.hp;
      hit(w, a, foe, type);
      return before - foe.hp;
    };
    expect(dmg(true, 'water', 'blastoise') / dmg(false, 'water', 'blastoise')).toBeCloseTo(1.5, 1);
    expect(dmg(true, 'fire', 'charizard') / dmg(false, 'fire', 'charizard')).toBeCloseTo(0.5, 1);
  });

  it('sandstorm wears down everyone but Rock / Ground / Steel, never to 0; bosses lose far less', () => {
    const w = new World({ mode: 'adventure', seed: 5, width: 4000, height: 4000 });
    const ally = w.addPokemon('pikachu', { level: 30 });
    const rock = w.spawnWild('geodude', 30, ally.x + 300, ally.y, { hostile: true });
    const foe = w.spawnWild('rattata', 30, ally.x + 300, ally.y + 60, { hostile: true });
    const boss = w.spawnBoss('seviper', 30, false, { x: ally.x + 900, y: ally.y });
    boss.hostile = true;
    for (const u of [ally, rock, foe, boss]) { u.hp = u.maxHp; u.target = null; }
    w.setBattleWeather('sand', 30, null);
    const hp = [ally, rock, foe, boss].map((u) => u.hp);
    const t0 = w.time;
    // the units keep fighting each other: compare only the chip, frozen in place
    for (const u of [ally, rock, foe, boss]) { u.skills = []; u.moveSpeed = 0; }
    const run = (until: number) => { for (let i = 0; i < 2000 && w.time - t0 < until; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); } };
    run(SAND_TICK * 3 + STEP);
    expect(w.time - t0).toBeGreaterThan(SAND_TICK * 3);
    expect(rock.hp).toBe(hp[1]);
    expect(hp[0] - ally.hp).toBeGreaterThan(0);
    expect(hp[2] - foe.hp).toBeGreaterThan(0);
    expect((hp[3] - boss.hp) / boss.maxHp).toBeLessThan((hp[2] - foe.hp) / foe.maxHp);
    foe.hp = 1;
    run(SAND_TICK * 5);
    expect(foe.hp).toBe(1);
    expect(foe.alive).toBe(true);
  });

  it("Groudon's flat Drought boost does not stack with the sun it calls", () => {
    expect(weatherOfAbility('drought')).toBe('sun');
    const dmg = (sun: boolean) => {
      const w = new World({ mode: 'adventure', seed: 8, width: 4000, height: 4000 });
      steady(w);
      const a = w.addPokemon('groudon', { level: 60 });
      a.passive = { id: 'drought', name: 'Drought', description: '', kind: 'typeBoost', type: 'fire', mult: 1.5 };
      const foe = w.spawnWild('snorlax', 60, a.x + 40, a.y, { hostile: true });
      if (sun) w.setBattleWeather('sun', 30, null);
      const before = foe.hp;
      hit(w, a, foe, 'fire');
      return before - foe.hp;
    };
    expect(dmg(true) / dmg(false)).toBeCloseTo(1.5, 1);
  });

  it('a blackout ends the called weather', () => {
    const w = new World({ mode: 'adventure', seed: 6, width: 4000, height: 4000 });
    w.setBattleWeather('snow', 30, null);
    w.respawnTrainer(500, 500);
    expect(w.battleWeather).toBeNull();
  });

  it('the player calls the weather on command (key C): needs a weather Pokémon out, not the same weather, cooldown over', () => {
    expect(canCallWeather(null, null, 0).ok).toBe(false);
    expect(canCallWeather(abilitySource('drizzle'), 'rain', 0).reason).toMatch(/đang có/);
    expect(canCallWeather(abilitySource('drizzle'), 'sun', 12).reason).toMatch(/chờ 12s/);
    expect(canCallWeather(abilitySource('drizzle'), 'sun', 0).ok).toBe(true);

    const w = new World({ mode: 'adventure', seed: 7, width: 4000, height: 4000 });
    const plain = w.addPokemon('rattata', { level: 20 });
    w.step(STEP);
    expect(w.playerWeatherCaller()).toBeNull();
    expect(w.tryCallWeather().ok).toBe(false);
    w.removePokemon(plain);
    const tor = w.addPokemon('torkoal', { level: 40, abilitySlot: slotOf('torkoal', 'drought') });
    w.step(STEP); // out of its ball, nothing to fight: no automatic call
    expect(w.battleWeather).toBeNull();
    expect(w.playerWeatherCaller()).toBe(tor);
    const r = w.tryCallWeather();
    expect(r.ok).toBe(true);
    expect(w.battleWeather?.kind).toBe('sun');
    expect(w.drainEvents().find((e) => e.t === 'weather')).toMatchObject({ kind: 'sun', by: 'Torkoal', team: 'ally' });
    // joining a fight later does not call it a second time
    const foe = w.spawnWild('rattata', 30, tor.x + 80, tor.y, { hostile: true });
    tor.target = foe;
    w.step(STEP);
    expect(w.weatherCallCd(tor)).toBeGreaterThan(WEATHER_CALL_COOLDOWN - 1);
    // the foe's rain replaces the sun; the cooldown still holds the call back
    w.setBattleWeather('rain', 40, null);
    expect(w.tryCallWeather().reason).toMatch(/chờ/);
    w.time += WEATHER_CALL_COOLDOWN;
    expect(w.tryCallWeather().ok).toBe(true);
    expect(w.battleWeather?.kind).toBe('sun');
  });
});
