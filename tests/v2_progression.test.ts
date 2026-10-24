import { describe, expect, it } from 'vitest';
import { availableEvolutions, evolutionsOf, itemEvolution, levelEvolution } from '../src/core/evolution';
import { skillUnlockLevel, unlockedSkills } from '../src/core/learnset';
import { addFriendship, ensureIndividual, makeOwned } from '../src/core/progression';
import { calcStats, individualFromSeed, natureMult } from '../src/core/stats';
import { POKEMON } from '../src/core/data';
import { STEP, World } from '../src/core/world';
import { AdventureState } from '../src/adventure/AdventureState';
import { defaultSave, migrate } from '../src/systems/saveSchema';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('stats: base + level + individual (IV / nature)', () => {
  it('IVs and nature change calculated stats, base stats stay per species', () => {
    const base = POKEMON.get('pikachu')!.baseStats;
    const plain = calcStats(base, 50);
    const strong = calcStats(base, 50, { ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, nature: 'timid' });
    expect(strong.hp).toBe(plain.hp + 15); // floor(31·50/100)
    expect(natureMult('timid', 'spe')).toBe(1.1);
    expect(natureMult('timid', 'atk')).toBe(0.9);
    expect(strong.spe).toBe(Math.floor((Math.floor(((2 * base.spe + 31) * 50) / 100) + 5) * 1.1));
    expect(calcStats(POKEMON.get('snorlax')!.baseStats, 50).hp).toBeGreaterThan(calcStats(POKEMON.get('gengar')!.baseStats, 50).hp);
  });
  it('old saves get deterministic individuals (never re-rolled) through the v3 → v4 migration', () => {
    const old = { version: 3, collection: [{ uid: 'bulbasaur-abc', species: 'bulbasaur', level: 7, exp: 300, origin: 'starter', caughtAt: 1 }] };
    const a = migrate(JSON.parse(JSON.stringify(old)));
    const b = migrate(JSON.parse(JSON.stringify(old)));
    expect(a.collection[0].ivs).toEqual(b.collection[0].ivs);
    expect(a.collection[0].ivs).toEqual(individualFromSeed('bulbasaur-abc').ivs);
    expect(a.collection[0].friendship).toBe(70);
  });
  it('temporary combat buffs are never folded into stored stats', () => {
    const w = new World({ mode: 'adventure', seed: 1, width: 3000, height: 3000 });
    const u = w.addPokemon('charmander', { level: 20 });
    const atk = u.stats.atk;
    w.applyStatus(u, { kind: 'atkUp', chance: 1, duration: 3, magnitude: 0.5 }, u);
    expect(u.stats.atk).toBe(atk);
  });
});

describe('level-based move unlocks (FRLG learnset)', () => {
  it('slot 0 is always known, later slots unlock by learnset level (capped per slot)', () => {
    expect(skillUnlockLevel('charmander', 0)).toBe(1);
    for (const sp of ['charmander', 'pidgey', 'geodude']) {
      for (let i = 1; i < 4; i++) expect(skillUnlockLevel(sp, i)).toBeLessThanOrEqual([1, 10, 20, 30][i]);
    }
    expect(unlockedSkills('charmander', 1).length).toBeGreaterThanOrEqual(1);
    expect(unlockedSkills('charmander', 30)).toEqual(POKEMON.get('charmander')!.skills);
  });
  it('a level-up in Adventure teaches the new skill (and Survivor keeps the full rental kit)', () => {
    const adv = new World({ mode: 'adventure', seed: 1, width: 3000, height: 3000 });
    const u = adv.addPokemon('charmander', { level: 5 });
    const n0 = u.skills.length;
    adv.setAllyLevel(u, 30);
    expect(u.skills.length).toBe(4);
    expect(u.skills.length).toBeGreaterThan(n0);
    expect(adv.drainEvents().some((e) => e.t === 'banner' && /học được/.test(e.text))).toBe(true);
    const surv = new World({ mode: 'survivor', seed: 1, starter: 'charmander' });
    expect(surv.allies[0].skills.length).toBe(4);
  });
});

describe('EvolutionRuleEngine (Part XIV evolution tests)', () => {
  it('Charmander 15 no, 16 yes; Charmeleon 36; Bulbasaur 16/32; Squirtle 16/36; Magikarp 20', () => {
    expect(levelEvolution('charmander', 15)).toBeNull();
    expect(levelEvolution('charmander', 16)?.to).toBe('charmeleon');
    expect(levelEvolution('charmeleon', 35)).toBeNull();
    expect(levelEvolution('charmeleon', 36)?.to).toBe('charizard');
    expect(levelEvolution('bulbasaur', 16)?.to).toBe('ivysaur');
    expect(levelEvolution('ivysaur', 32)?.to).toBe('venusaur');
    expect(levelEvolution('squirtle', 16)?.to).toBe('wartortle');
    expect(levelEvolution('wartortle', 36)?.to).toBe('blastoise');
    expect(levelEvolution('magikarp', 19)).toBeNull();
    expect(levelEvolution('magikarp', 20)?.to).toBe('gyarados');
  });
  it('Pikachu never evolves by level; Thunder Stone → Raichu', () => {
    for (const lv of [1, 50, 100]) expect(levelEvolution('pikachu', lv, { friendship: 255 })).toBeNull();
    expect(itemEvolution('pikachu', 'thunder-stone')?.to).toBe('raichu');
    expect(itemEvolution('pikachu', 'fire-stone')).toBeNull();
  });
  it('Eevee branches are chosen by conditions only — never at random', () => {
    expect(availableEvolutions('eevee', { level: 50 })).toEqual([]);
    expect(itemEvolution('eevee', 'water-stone')?.to).toBe('vaporeon');
    expect(itemEvolution('eevee', 'thunder-stone')?.to).toBe('jolteon');
    expect(itemEvolution('eevee', 'fire-stone')?.to).toBe('flareon');
    const day = availableEvolutions('eevee', { level: 20, friendship: 160, timeOfDay: 'day' }).map((o) => o.to);
    const night = availableEvolutions('eevee', { level: 20, friendship: 160, timeOfDay: 'night' }).map((o) => o.to);
    expect(day).toEqual(['espeon']);
    expect(night).toEqual(['umbreon']);
    expect(availableEvolutions('eevee', { level: 20, friendship: 159, timeOfDay: 'day' })).toEqual([]);
    // repeated evaluation is stable
    for (let i = 0; i < 20; i++) expect(availableEvolutions('eevee', { level: 20, friendship: 200, timeOfDay: 'night' }).map((o) => o.to)).toEqual(['umbreon']);
  });
  it('friendship, held-item trade and location rules use their own evaluators', () => {
    expect(levelEvolution('golbat', 40, { friendship: 159 })).toBeNull();
    expect(levelEvolution('golbat', 40, { friendship: 160 })?.to).toBe('crobat');
    expect(levelEvolution('chansey', 40, { friendship: 160 })?.to).toBe('blissey');
    expect(itemEvolution('scyther', 'linking-cord')).toBeNull();
    expect(itemEvolution('scyther', 'linking-cord', { heldItem: 'metal-coat' })?.to).toBe('scizor');
    expect(itemEvolution('seadra', 'linking-cord', { heldItem: 'dragon-scale' })?.to).toBe('kingdra');
    expect(itemEvolution('poliwhirl', 'linking-cord', { heldItem: 'kings-rock' })?.to).toBe('politoed');
    expect(itemEvolution('poliwhirl', 'water-stone')?.to).toBe('poliwrath');
    // location rule (Gen 4 Magnezone is in the National Dex now): level up in the rocky habitat
    expect(levelEvolution('magneton', 40, { habitat: 'meadow' })).toBeNull();
    expect(levelEvolution('magneton', 40, { habitat: 'rocky' })?.to).toBe('magnezone');
    expect(itemEvolution('magneton', 'thunder-stone')?.to).toBe('magnezone');
    // Ice-location Glaceon has no matching habitat on this map yet → reported, never silently allowed
    expect(evolutionsOf('eevee').find((o) => o.to === 'glaceon' && o.rule.location && !o.unsupported)).toBeUndefined();
  });
  it('evolution keeps the individual (uid, level, EXP, IVs, nature, friendship, nickname, history, held)', () => {
    const st = new AdventureState(defaultSave());
    const p = st.addPokemon('charmander', 16, 'starter');
    p.nickname = 'Lửa Nhỏ'; p.held = 'charcoal';
    const snap = JSON.parse(JSON.stringify(p));
    expect(st.pendingEvolutions(p.uid)).toEqual(['charmeleon']);
    expect(st.evolve(p.uid, 'charmeleon')).toBe(true);
    expect(p.species).toBe('charmeleon');
    for (const k of ['uid', 'level', 'exp', 'ivs', 'nature', 'friendship', 'nickname', 'caughtAt', 'origin', 'held']) expect(p[k as keyof typeof p], k).toEqual(snap[k]);
    expect(st.save.pokedex.caught).toContain('charmeleon');
    // save/load round trip
    const loaded = migrate(JSON.parse(JSON.stringify(st.save)));
    expect(loaded.collection.find((c) => c.uid === p.uid)).toEqual(JSON.parse(JSON.stringify(p)));
  });
  it('the engine re-validates: no evolving without the conditions; trade consumes cord + required held item', () => {
    const st = new AdventureState(defaultSave());
    const g = st.addPokemon('golbat', 30, 'wild');
    g.friendship = 100;
    expect(st.evolve(g.uid, 'crobat')).toBe(false);
    g.friendship = 160;
    expect(st.evolve(g.uid, 'crobat')).toBe(true);
    const o = st.addPokemon('onix', 30, 'wild');
    st.addItems({ 'linking-cord': 1 });
    expect(st.evolve(o.uid, 'steelix', 'linking-cord')).toBe(false); // no Metal Coat
    o.held = 'metal-coat';
    expect(st.stoneEvolution(o.uid, 'linking-cord')).toBe('steelix');
    expect(st.evolve(o.uid, 'steelix', 'linking-cord')).toBe(true);
    expect(o.held).toBeUndefined();
    expect(st.item('linking-cord')).toBe(0);
  });
  it('time of day and habitat come from the world (EvoEnv)', () => {
    const st = new AdventureState(defaultSave());
    const e = st.addPokemon('eevee', 20, 'wild');
    e.friendship = 200;
    expect(st.pendingEvolutions(e.uid, { night: false })).toEqual(['espeon']);
    expect(st.pendingEvolutions(e.uid, { night: true })).toEqual(['umbreon']);
  });
  it('friendship grows with level-ups and battles, drops when fainting, capped 0..255', () => {
    const p = ensureIndividual(makeOwned('pidgey', 5, 'wild', 1, seq([0.5])));
    expect(p.friendship).toBe(70);
    addFriendship(p, 'levelup');
    expect(p.friendship).toBe(75);
    addFriendship(p, 'faint');
    expect(p.friendship).toBe(74);
    p.friendship = 254; addFriendship(p, 'levelup');
    expect(p.friendship).toBe(255);
  });
});

describe('combat integrity after evolution', () => {
  it('an evolved ally keeps fighting with a valid kit', () => {
    const w = new World({ mode: 'adventure', seed: 2, width: 3000, height: 3000 });
    const u = w.addPokemon('charmander', { level: 36 });
    w.transformAlly(u, 'charmeleon');
    expect(u.skills.length).toBe(4);
    for (let i = 0; i < 120; i++) w.step(STEP);
    expect(u.alive).toBe(true);
  });
});
