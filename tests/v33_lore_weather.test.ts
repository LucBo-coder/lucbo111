import { describe, expect, it } from 'vitest';
import { abilityOptions } from '../src/core/abilities';
import {
  castformTypes, LEGEND_WEATHER_DURATION, LIGHTNING_TICK, LORE_WEATHER, loreDamageMult, loreSource, loreWeatherText, weatherDamageMult,
} from '../src/core/battleWeather';
import { STEP, World, type Unit } from '../src/core/world';
import ecology from '../src/data/dex/ecology.json';

// Weather from the Pokédex lore (docs/weather-pokemon-research.md §3D): the whole species, not one ability slot.

const slotOf = (species: string, ability: string) => abilityOptions(species).find((a) => a.id === ability)!.slot;
const world = (seed = 1) => new World({ mode: 'adventure', seed, width: 4000, height: 4000 });
/** an ally out of its ball, already fighting a hostile Rattata */
const fighting = (w: World, species: string, opts: { abilitySlot?: number; level?: number } = {}) => {
  const u = w.addPokemon(species, { level: opts.level ?? 50, abilitySlot: opts.abilitySlot ?? 0 });
  const foe = w.spawnWild('rattata', 30, u.x + 80, u.y, { hostile: true });
  u.target = foe;
  return { u, foe };
};

describe('lore weather', () => {
  it('every lore entry quotes its Pokédex line and has a player-facing text', () => {
    for (const [species, e] of Object.entries(LORE_WEATHER)) {
      expect(e.dex, species).toBeTruthy();
      expect(loreWeatherText(species), species).toMatch(/^Theo Pokédex/);
    }
    for (const s of ['castform', 'cherrim', 'gigalith']) expect(loreWeatherText(s)).toMatch(/^Theo Pokédex/);
    expect(loreWeatherText('pelipper')).toBeNull(); // official Drizzle, no weather lore
  });

  it('Zapdos raises a thunderstorm whatever its ability, and the storm goes with it', () => {
    for (const slot of abilityOptions('zapdos').map((a) => a.slot)) {
      const w = world();
      const { u } = fighting(w, 'zapdos', { abilitySlot: slot });
      w.step(STEP);
      expect(w.battleWeather?.kind).toBe('thunderstorm');
      expect(w.battleWeatherLeft()).toBeCloseTo(LEGEND_WEATHER_DURATION, 0);
      expect(w.drainEvents().find((e) => e.t === 'weather')).toMatchObject({ kind: 'thunderstorm', by: 'Zapdos', lore: true });
      w.removePokemon(u);
      w.step(STEP);
      expect(w.battleWeather).toBeNull();
      expect(w.drainEvents().find((e) => e.t === 'weather')).toMatchObject({ kind: null, ended: 'thunderstorm', by: 'Zapdos' });
    }
  });

  it('thunderstorm: Electric ×1.5, lightning strikes a Pokémon in the fight but never finishes it; Ground / Electric are spared', () => {
    expect(weatherDamageMult('thunderstorm', 'electric', 'special', ['normal'])).toBe(1.5);
    expect(weatherDamageMult('thunderstorm', 'fire', 'special', ['normal'])).toBe(0.75);
    const w = world(5);
    const z = w.addPokemon('zapdos', { level: 60, abilitySlot: 0 });
    const foe = w.spawnWild('pidgey', 20, z.x + 80, z.y, { hostile: true });
    const ground = w.spawnWild('diglett', 20, z.x + 120, z.y, { hostile: true });
    foe.maxHp = foe.hp = 1e6; // stays standing through the whole storm
    z.target = foe;
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('thunderstorm');
    w.drainEvents();
    const hp0 = foe.hp, g0 = ground.hp;
    for (let t = 0; t < LIGHTNING_TICK * 6; t += STEP) { z.target = foe; w.step(STEP); }
    const bolts = w.drainEvents().filter((e) => e.t === 'lightning');
    expect(bolts.length).toBeGreaterThan(0);
    expect(ground.hp).toBe(g0);
    expect(foe.hp).toBeLessThanOrEqual(hp0);
    expect(foe.hp).toBeGreaterThan(0);
  });

  it('Articuno: snow · Tornadus and Suicune: gale (Flying ×1.5) · Lugia: storm', () => {
    const kinds: [string, string][] = [['articuno', 'snow'], ['tornadus', 'wind'], ['suicune', 'wind'], ['lugia', 'thunderstorm'], ['thundurus', 'thunderstorm'], ['raikou', 'thunderstorm']];
    for (const [sp, kind] of kinds) {
      const w = world();
      fighting(w, sp);
      w.step(STEP);
      expect(w.battleWeather?.kind, sp).toBe(kind);
    }
    expect(weatherDamageMult('wind', 'flying', 'physical', ['normal'])).toBe(1.5);
  });

  it('Rayquaza calms every weather; Landorus ends storms but not sunshine; Moltres and Enamorus end the snow', () => {
    const w = world();
    w.setBattleWeather('sun', 40, null);
    fighting(w, 'rayquaza');
    w.step(STEP);
    expect(w.battleWeather).toBeNull();
    expect(w.drainEvents().find((e) => e.t === 'weather' && e.kind === null)).toMatchObject({ calm: true, by: 'Rayquaza', ended: 'sun' });

    const w2 = world();
    w2.setBattleWeather('sun', 40, null);
    fighting(w2, 'landorus');
    w2.step(STEP);
    expect(w2.battleWeather?.kind).toBe('sun');
    const w3 = world();
    w3.setBattleWeather('thunderstorm', 40, null);
    fighting(w3, 'landorus');
    w3.step(STEP);
    expect(w3.battleWeather).toBeNull();

    for (const sp of ['moltres', 'enamorus']) {
      const w4 = world();
      w4.setBattleWeather('snow', 40, null);
      fighting(w4, sp);
      w4.step(STEP);
      expect(w4.battleWeather, sp).toBeNull();
    }
  });

  it('key C with Rayquaza calms the sky; nothing to calm = a reason, not a wasted call', () => {
    const w = world();
    const r = w.addPokemon('rayquaza', { level: 60 });
    w.step(STEP);
    expect(w.tryCallWeather().reason).toMatch(/làm yên/);
    w.setBattleWeather('rain', 40, null);
    expect(w.tryCallWeather().ok).toBe(true);
    expect(w.battleWeather).toBeNull();
    expect(w.weatherCallCd(r)).toBeGreaterThan(0);
  });

  it('Hippowdon whips up the sandstorm when roused to rage (under half HP), not on entry', () => {
    const w = world();
    const h = w.spawnWild('hippowdon', 40, 600, 600, { hostile: true });
    const ally = w.addPokemon('pidgey', { level: 10 });
    h.target = ally as Unit;
    w.step(STEP);
    expect(w.battleWeather).toBeNull();
    h.hp = h.maxHp * 0.4;
    h.target = ally as Unit;
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('sand');
  });

  it('Sand Spit (official): Silicobra whips up the sandstorm when hit, not when it comes out', () => {
    const w = world();
    const sil = w.addPokemon('silicobra', { level: 30, abilitySlot: slotOf('silicobra', 'sand-spit') });
    const foe = w.spawnWild('rattata', 30, sil.x + 80, sil.y, { hostile: true });
    sil.target = foe;
    w.step(STEP);
    expect(w.battleWeather).toBeNull();
    w.applyDamage(sil, 5, foe);
    expect(w.battleWeather?.kind).toBe('sand');
  });

  it('Primal Reversion calls its own weather again (Primordial Sea, 90 s) even after Kyogre already called rain', () => {
    const w = world();
    const { u, foe } = fighting(w, 'kyogre', { level: 70 });
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('rain');
    w.endBattleWeather();
    w.transformAlly(u, 'kyogre-primal', { mega: true });
    u.target = foe;
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('rain');
    expect(w.battleWeatherLeft()).toBeGreaterThan(85);
  });

  it('Castform takes the guise of the weather; Cherrim blooms in the sun; Gigalith fires its blasts in sunshine', () => {
    expect(castformTypes('sun')).toEqual(['fire']);
    expect(castformTypes('rain')).toEqual(['water']);
    expect(castformTypes('snow')).toEqual(['ice']);
    expect(castformTypes(null)).toEqual(['normal']);
    const w = world();
    const { u } = fighting(w, 'castform');
    w.setBattleWeather('rain', 40, null);
    w.step(STEP);
    expect(u.types).toEqual(['water']);
    expect(loreDamageMult('sun', 'cherrim', 'physical')).toBe(1.5);
    expect(loreDamageMult('sun', 'gigalith', 'special')).toBe(1.3);
    expect(loreDamageMult('rain', 'gigalith', 'special')).toBe(0.6);
    expect(loreDamageMult('rain', 'gigalith', 'physical')).toBe(1);
  });

  it('a lore source beats the ability (Hippowdon with Sand Stream waits for its rage)', () => {
    expect(loreSource('hippowdon')?.trigger).toBe('anger');
    const w = world();
    const h = w.addPokemon('hippowdon', { level: 40, abilitySlot: slotOf('hippowdon', 'sand-stream') });
    expect(w.weatherSource(h)?.origin).toBe('lore');
  });

  it('more Pokédex weather: Manectric / Tapu Koko storms, Flygon / Palossand sand, Bronzong rain, Reshiram sun, Kingdra gale, Frosmoth / Vanillite snow', () => {
    const kinds: [string, string][] = [['manectric', 'thunderstorm'], ['tapu-koko', 'thunderstorm'], ['flygon', 'sand'], ['palossand', 'sand'], ['bronzong', 'rain'],
      ['reshiram', 'sun'], ['kingdra', 'wind'], ['frosmoth', 'snow'], ['vanillite', 'snow']];
    for (const [sp, kind] of kinds) {
      const w = world();
      fighting(w, sp);
      w.step(STEP);
      expect(w.battleWeather?.kind, sp).toBe(kind);
      expect(loreWeatherText(sp), sp).toMatch(/^Theo Pokédex/);
    }
  });

  it('Drampa stirs up a gale only once angered', () => {
    const w = world();
    const { u } = fighting(w, 'drampa');
    w.step(STEP);
    expect(w.battleWeather).toBeNull();
    u.hp = u.maxHp * 0.4;
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('wind');
  });

  it('several Pikachu together cause a lightning storm; one alone does not', () => {
    const w = world();
    const { foe } = fighting(w, 'pikachu');
    w.step(STEP);
    expect(w.battleWeather).toBeNull();
    expect(w.tryCallWeather().reason).toMatch(/Cần 3/);
    // a wild pack of Pikachu joins the fight
    for (let i = 0; i < 2; i++) w.spawnWild('pikachu', 20, foe.x + 40 * i, foe.y + 60, { hostile: true });
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('thunderstorm');
  });

  it('Bellossom dances for the sun only when cloudy weather persists', () => {
    const w = world();
    fighting(w, 'bellossom');
    w.step(STEP);
    expect(w.battleWeather).toBeNull();
    w.setBattleWeather('rain', 40, null);
    w.step(STEP);
    expect(w.battleWeather?.kind).toBe('sun');
    expect(loreDamageMult('sun', 'cryogonal', 'special')).toBe(0.7);
    expect(loreWeatherText('cryogonal')).toMatch(/^Theo Pokédex/);
  });

  it('spawns follow the lore: Tornadus, Lugia, Zapdos come with the storms', () => {
    const eco = ecology as unknown as { id: string; weather: Record<string, number | undefined> }[];
    const wx = (id: string) => eco.find((e) => e.id === id)!.weather;
    expect(wx('tornadus').thunderstorm).toBeGreaterThan(1);
    expect(wx('lugia').thunderstorm).toBeGreaterThan(1);
    expect(wx('zapdos').thunderstorm).toBeGreaterThan(1);
    expect(wx('rayquaza').thunderstorm ?? 1).toBe(1);
  });
});
