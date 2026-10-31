import { describe, expect, it } from 'vitest';
import { computeDamage } from '../src/core/damage';
import { POKEMON } from '../src/core/data';
import { ITEM_DEFS, megaFormsOf } from '../src/core/evolution';
import {
  canDynamax, canTera, DYNAMAX_BAND_AT, DYNAMAX_HP_MULT, giantScale, gimmickGifts, GMAX, gmaxLine, MAX_MOVE_MULT_CAP, MAX_MOVES,
  maxMoveMult, maxMoveOf, maxMovePower, pickTeraType, primalFormOf, primalScale, raidRewards, TERA_ORB_AT, TERA_SHARD_COST, teraPower, teraStab, teraTypeOf,
  TRAINER_DYNAMAX_LEVEL, TRAINER_TERA_LEVEL, trainerGimmick, trainerGimmickNow,
} from '../src/core/gimmicks';
import { EVENT_DEFS } from '../src/core/worldEvents';
import { buildDuel, DuelMirror, packSnapshot, RULESETS, validateParty } from '../src/net/duel';
import type { DuelMon } from '../src/net/protocol';
import { categoryOf } from '../src/core/shop';
import { STEP, World } from '../src/core/world';
import { AdventureState, ITEMS } from '../src/adventure/AdventureState';
import { defaultSave } from '../src/systems/saveSchema';
import type { PokeType } from '../src/core/types';

// V31: Terastal, Dynamax / Gigantamax and the Primal forms of Kyogre and Groudon.
const dmg = (o: Partial<Parameters<typeof computeDamage>[0]>) => computeDamage({
  level: 50, power: 80, category: 'special', skillType: 'fire', attackerTypes: ['fire'], defenderTypes: ['normal'],
  atk: 100, spa: 100, def: 100, spd: 100, critRoll: 1, critRate: 0, varianceRoll: 1, modifier: 1, ...o,
}).amount;

describe('Terastal', () => {
  it('Tera STAB: 2× when the Tera Type is one of its own types, 1.5× for a new type, original types keep 1.5×', () => {
    expect(teraStab(['fire', 'flying'], 'fire', 'fire')).toBe(2);
    expect(teraStab(['fire', 'flying'], 'water', 'water')).toBe(1.5);
    expect(teraStab(['fire', 'flying'], 'water', 'flying')).toBe(1.5);
    expect(teraStab(['fire', 'flying'], 'water', 'grass')).toBe(1);
  });

  it('computeDamage follows the Tera STAB and raises weak moves of the Tera Type to 60', () => {
    const plain = dmg({}), same = dmg({ teraType: 'fire' }), none = dmg({ attackerTypes: ['water'] });
    expect(same / plain).toBeCloseTo(2 / 1.5, 1);
    expect(dmg({ attackerTypes: ['water'], teraType: 'fire' }) / none).toBeCloseTo(1.5, 1);
    expect(teraPower(40, 'fire', 'fire')).toBe(60);
    expect(teraPower(40, 'water', 'fire')).toBe(40);
    expect(teraPower(90, 'fire', 'fire')).toBe(90);
    expect(dmg({ power: 40, teraType: 'fire' })).toBe(dmg({ power: 60, teraType: 'fire' }));
  });

  it('the Tera Type: the one chosen with shards, else the species\' first type', () => {
    expect(teraTypeOf('charizard')).toBe('fire');
    expect(teraTypeOf('charizard', 'dragon')).toBe('dragon');
  });

  it('the World: its defence becomes the Tera Type, its original types come back after', () => {
    const w = new World({ starter: 'charizard', seed: 1 });
    const u = w.allies[0];
    w.terastallize(u, 'water');
    expect(u.types).toEqual(['water']);
    expect(u.tera).toEqual({ type: 'water', from: ['fire', 'flying'] });
    w.endTera(u);
    expect(u.types).toEqual(['fire', 'flying']);
    expect(u.tera).toBeNull();
  });
});

describe('Dynamax / Gigantamax', () => {
  it('Max Move power: the main-series table, Fighting / Poison on the lower one; the damage boost is capped', () => {
    expect([40, 50, 60, 70, 100, 140, 150].map((p) => maxMovePower(p, 'fire'))).toEqual([90, 100, 110, 120, 130, 140, 150]);
    expect([40, 50, 60, 70, 100, 140, 150].map((p) => maxMovePower(p, 'fighting'))).toEqual([70, 75, 80, 85, 90, 95, 100]);
    expect(maxMovePower(0, 'fire')).toBe(0);
    expect(maxMoveMult(100, 'fire')).toBeCloseTo(1.3);
    expect(maxMoveMult(20, 'fire')).toBe(MAX_MOVE_MULT_CAP);
    expect(maxMoveMult(150, 'fire')).toBe(1);
  });

  it('every type has a Max Move, every Gigantamax species exists, its G-Max Move replaces its type\'s Max Move', () => {
    expect(Object.keys(MAX_MOVES)).toHaveLength(18);
    for (const sp of Object.keys(GMAX)) expect(POKEMON.has(sp), sp).toBe(true);
    expect(maxMoveOf('charizard', 'fire', true).name).toBe('G-Max Wildfire');
    expect(maxMoveOf('charizard', 'flying', true).name).toBe('Max Airstream');
    expect(maxMoveOf('charizard', 'fire', false).name).toBe('Max Flare');
  });

  it('size: the official Gigantamax heights — exact ratios up to 40 m, the giants beyond still in height order', () => {
    expect(GMAX.charizard.height).toBe(28);
    expect(GMAX.snorlax.height).toBe(35);
    expect(GMAX.centiskorch.height).toBe(75);
    expect(giantScale('charizard', true) / giantScale('pikachu', true)).toBeCloseTo(28 / 21, 5);
    expect(giantScale('snorlax', true) / giantScale('corviknight', true)).toBeCloseTo(35 / 14, 5);
    // a plain Dynamax counts as 20 m (Gengar's Gigantamax form is also 20 m)
    expect(giantScale('charizard', false)).toBeCloseTo(giantScale('gengar', true));
    const order = Object.keys(GMAX).sort((a, b) => GMAX[a].height - GMAX[b].height);
    for (let i = 1; i < order.length; i++) expect(giantScale(order[i], true)).toBeGreaterThanOrEqual(giantScale(order[i - 1], true));
    expect(giantScale('centiskorch', true)).toBeLessThan(8);
    expect(giantScale('corviknight', true)).toBeGreaterThan(2);
  });

  it('the World: HP ×2 with the same ratio, a bigger hitbox, all back after; Max Moves hit harder', () => {
    const w = new World({ starter: 'charizard', seed: 1 });
    const u = w.allies[0];
    u.hp = u.maxHp / 2;
    const hp = u.maxHp, r = u.radius;
    w.dynamax(u, true);
    expect(u.maxHp).toBe(hp * DYNAMAX_HP_MULT);
    expect(u.hp / u.maxHp).toBeCloseTo(0.5, 2);
    expect(u.radius).toBeGreaterThan(r);
    expect(u.dyna?.gmax).toBe(true);
    w.endDynamax(u);
    expect(u.maxHp).toBe(hp);
    expect(u.hp / u.maxHp).toBeCloseTo(0.5, 2);
    expect(u.radius).toBe(r);
    expect(u.dyna).toBeNull();
  });

  it('a Max Move\'s side effect: Max Flare sets the harsh sun that boosts Fire moves', () => {
    const w = new World({ starter: 'charizard', seed: 1 });
    const u = w.allies[0];
    w.dynamax(u, false);
    const foe = w.spawnEnemy('rattata', 5, false, u.x + 30, u.y)!;
    const fire = u.skills.find((s) => s.def.type === 'fire' && s.def.power > 0)!;
    (w as unknown as { hit: (a: unknown, b: unknown, c: unknown, d: number) => void }).hit(u, foe, fire, 1);
    expect(w.maxFields.fire?.until).toBeGreaterThan(w.time);
  });

  it('Max Soup works on the whole line of a Gigantamax species', () => {
    expect(gmaxLine('charmander')).toBe(true);
    expect(gmaxLine('charizard')).toBe(true);
    expect(gmaxLine('rattata')).toBe(false);
  });
});

describe('who may transform', () => {
  const unit = (o: Partial<{ species: string; fainted: boolean; mega: boolean; tera: boolean; dyna: boolean }> = {}) =>
    ({ species: 'charizard', fainted: false, mega: false, tera: false, dyna: false, ...o });

  it('needs the key item, one at a time, a cooldown, and one transformation per Pokémon', () => {
    expect(canTera(unit(), false, false, 0).ok).toBe(false);
    expect(canTera(unit(), true, true, 0).ok).toBe(false);
    expect(canTera(unit(), true, false, 5).reason).toContain('5s');
    expect(canTera(unit({ mega: true }), true, false, 0).ok).toBe(false);
    expect(canTera(unit(), true, false, 0).ok).toBe(true);
    expect(canDynamax(unit({ tera: true }), true, false, 0, false).ok).toBe(false);
    expect(canDynamax(unit({ species: 'zacian' }), true, false, 0, false).ok).toBe(false);
    expect(canDynamax(unit(), true, false, 0, true)).toEqual({ ok: true, gmax: true });
    expect(canDynamax(unit(), true, false, 0, false)).toEqual({ ok: true, gmax: false });
    expect(canDynamax(unit({ species: 'rattata' }), true, false, 0, true)).toEqual({ ok: true, gmax: false });
  });

  it('the Tera Orb after the 2nd boss, the Dynamax Band after the 4th, never twice', () => {
    const none = () => false;
    expect(gimmickGifts(TERA_ORB_AT - 1, none)).toEqual([]);
    expect(gimmickGifts(TERA_ORB_AT, none)).toEqual(['tera-orb']);
    expect(gimmickGifts(DYNAMAX_BAND_AT, none)).toEqual(['tera-orb', 'dynamax-band']);
    expect(gimmickGifts(DYNAMAX_BAND_AT, (id) => id === 'tera-orb')).toEqual(['dynamax-band']);
  });
});

describe('Primal Reversion', () => {
  it('Kyogre / Groudon revert while their orb is in the bag; never offered as a Mega', () => {
    expect(primalFormOf('kyogre', (id) => id === 'blue-orb')).toBe('kyogre-primal');
    expect(primalFormOf('kyogre', (id) => id === 'red-orb')).toBeNull();
    expect(primalFormOf('groudon', (id) => id === 'red-orb')).toBe('groudon-primal');
    expect(primalFormOf('charizard', () => true)).toBeNull();
    expect(megaFormsOf('kyogre')).toEqual([]);
    expect(POKEMON.get('groudon-primal')!.types).toEqual(['ground', 'fire']);
  });

  it('drawn at their official height ratio (Primal Kyogre 9.8 m vs 4.5 m)', () => {
    expect(primalScale('kyogre-primal')).toBeCloseTo(9.8 / 4.5);
    expect(primalScale('groudon-primal')).toBeCloseTo(5 / 3.5);
    expect(primalScale('charizard-mega-x')).toBe(1);
  });
});

describe('the bag', () => {
  it('Tera Shards change the Tera Type, Max Soup gives the Gigantamax Factor once', () => {
    const st = new AdventureState(defaultSave());
    const p = st.addPokemon('charmander', 10, 'starter');
    const r = st.addPokemon('rattata', 5, 'wild');
    p.teraType = 'fire'; // explicit fixture: new individuals now roll a random Tera type
    expect(st.teraType(p.uid)).toBe('fire');
    st.addItems({ 'tera-shard': TERA_SHARD_COST - 1 });
    expect(st.setTeraType(p.uid, 'dragon' as PokeType)).toBe(false);
    st.addItems({ 'tera-shard': 1 });
    expect(st.setTeraType(p.uid, 'fire' as PokeType)).toBe(false); // same type: nothing spent
    expect(st.setTeraType(p.uid, 'dragon' as PokeType)).toBe(true);
    expect(st.teraType(p.uid)).toBe('dragon');
    expect(st.item('tera-shard')).toBe(0);
    st.addItems({ 'max-soup': 2 });
    expect(st.giveMaxSoup(r.uid)).toBe(false);
    expect(st.giveMaxSoup(p.uid)).toBe(true);
    expect(st.giveMaxSoup(p.uid)).toBe(false);
    expect(st.owned(p.uid)!.gmax).toBe(true);
    expect(st.item('max-soup')).toBe(1);
  });

  it('the key items arrive with the bosses beaten; shards and soup are sold', () => {
    const st = new AdventureState(defaultSave());
    for (const f of ['boss:a', 'boss:b', 'boss:c', 'boss:d']) st.setFlag(f);
    expect(st.claimGimmickGifts()).toEqual(['tera-orb', 'dynamax-band']);
    expect(st.claimGimmickGifts()).toEqual([]);
    expect(ITEMS['tera-shard'].kind).toBe('gimmick');
    expect(ITEM_DEFS.get('tera-orb')!.kind).toBe('key');
    expect(categoryOf('tera-shard')).toBe('battle');
    expect(categoryOf('max-soup')).toBe('battle');
    expect(categoryOf('tera-orb')).toBeNull();
  });
});

describe('trainers, Max Raid and duels (V31)', () => {
  it('trainers: Terastal from Lv30, Dynamax from Lv55, when the last one comes out or under half HP', () => {
    expect(trainerGimmick(20, 'charizard')).toBeNull();
    expect(trainerGimmick(TRAINER_TERA_LEVEL, 'charizard')).toBe('tera');
    expect(trainerGimmick(TRAINER_DYNAMAX_LEVEL, 'charizard')).toBe('dynamax');
    expect(trainerGimmick(90, 'zacian')).toBe('tera');
    expect(trainerGimmickNow(0.9, 0)).toBe(true);
    expect(trainerGimmickNow(0.4, 2)).toBe(true);
    expect(trainerGimmickNow(0.9, 2)).toBe(false);
  });

  it('a trainer picks the Tera Type that takes least from your Pokémon, among its own and its moves\' types', () => {
    // Charizard (Fire/Flying, a Dragon move) against a Water Pokémon: Dragon resists Water
    expect(pickTeraType(['fire', 'flying'], ['fire', 'dragon'], ['water'])).toBe('dragon');
    // against Grass: Fire resists it and Charizard has Fire moves
    expect(pickTeraType(['fire', 'flying'], ['fire', 'dragon'], ['grass'])).toBe('fire');
    expect(pickTeraType(['water'], [], null)).toBe('water');
  });

  it('Max Raid loot: Tera Shards always, Max Soup from a Gigantamax den (else 15 %)', () => {
    expect(raidRewards(true, 0.9)).toMatchObject({ 'tera-shard': 5, 'max-soup': 1 });
    expect(raidRewards(false, 0.9)['max-soup']).toBeUndefined();
    expect(raidRewards(false, 0.1)['max-soup']).toBe(1);
    expect(EVENT_DEFS.raid.major).toBe(true);
  });

  it('duel: one transformation per side (Mega, Tera or Dynamax), the giant shrinks after 30 s', () => {
    const w = new World({ mode: 'adventure', seed: 1, width: 1600, height: 1000, pvp: {} });
    const zard = w.addPokemon('charizard', { level: 50 });
    zard.gmaxFactor = true;
    w.addPokemon('blastoise', { level: 50, rival: true });
    expect(w.duelDynamax(w.home, zard)).toBe(true);
    expect(zard.dyna?.gmax).toBe(true);
    expect(w.duelTera(w.home, zard)).toBe(false);
    expect(zard.dyna!.until! - w.time).toBeCloseTo(30);
    zard.dyna!.until = w.time; // fast-forward to the end of the 30 s
    w.step(STEP);
    expect(zard.dyna).toBeFalsy();
    expect(w.duelTera(w.home, zard)).toBe(false); // already used this duel
    const r = w.rival!.allies[0];
    r.teraPick = 'grass';
    expect(w.duelTera(w.rival!, r)).toBe(true);
    expect(r.types).toEqual(['grass']);
  });

  it('duel wire: the Tera Type / Gigantamax Factor travel with the team, the guest mirrors the transformation', () => {
    const rules = RULESETS.standard;
    const host: DuelMon[] = [{ species: 'charizard', level: 50, gmax: true, teraType: 'dragon' }];
    const guest: DuelMon[] = [{ species: 'blastoise', level: 50 }];
    expect(validateParty(host, rules)).toEqual([]);
    expect(validateParty([{ species: 'charizard', level: 50, teraType: 'cosmic' }], rules)).toHaveLength(1);
    const b = buildDuel(7, rules, host, guest);
    const zard = b.order[0][1];
    expect(zard.teraPick).toBe('dragon');
    expect(b.world.duelTera(b.world.home, zard)).toBe(true);
    const mirror = new DuelMirror(7, rules, host, guest, b.roster);
    mirror.push(packSnapshot(b.world, 1), 0);
    const m = mirror.unit(zard.id)!;
    expect(m.tera?.type).toBe('dragon');
    expect(m.types).toEqual(['dragon']);
  });
});
