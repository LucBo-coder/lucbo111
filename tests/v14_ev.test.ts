import { describe, expect, it } from 'vitest';
import { AdventureState, SHOP } from '../src/adventure/AdventureState';
import { addEv, applyEvGain, EV_MAX_STAT, EV_MAX_TOTAL, evGain, evTotal, evYieldOf, zeroEvs } from '../src/core/ev';
import { ITEM_DEFS } from '../src/core/evolution';
import { individualOf } from '../src/core/progression';
import { calcHp, calcStat, calcStats } from '../src/core/stats';
import { STEP, World } from '../src/core/world';
import { defaultSave, migrate, newAdventure } from '../src/systems/saveSchema';

const EV_ITEMS = ['hp-up', 'protein', 'iron', 'calcium', 'zinc', 'carbos', 'pomeg-berry', 'kelpsy-berry', 'qualot-berry', 'hondew-berry', 'grepa-berry', 'tamato-berry'];
const POWER = ['power-weight', 'power-bracer', 'power-belt', 'power-lens', 'power-band', 'power-anklet', 'macho-brace'];

function adventure() {
  const s = defaultSave(); s.adventure = newAdventure();
  const st = new AdventureState(s);
  const p = st.addPokemon('charmander', 30, 'gift');
  return { st, p };
}

describe('EV: formula, data, caps', () => {
  it('main-series formula: floor(EV/4) inside the base term', () => {
    expect(calcStat(100, 100, 31, 1, 252) - calcStat(100, 100, 31, 1, 0)).toBe(63);
    expect(calcHp(100, 100, 31, 252) - calcHp(100, 100, 31, 0)).toBe(63);
    expect(calcStat(100, 50, 31, 1, 3)).toBe(calcStat(100, 50, 31, 1, 0)); // < 4 EVs do nothing
    // no EVs → exactly the old numbers (existing saves unchanged)
    const base = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 };
    expect(calcStats(base, 30, { ivs: zeroEvs(), nature: 'hardy' })).toEqual(calcStats(base, 30, { ivs: zeroEvs(), nature: 'hardy', evs: zeroEvs() }));
  });

  it('EV yields come from PokéAPI for every species', () => {
    expect(evYieldOf('bulbasaur')).toEqual({ spa: 1 });
    expect(evYieldOf('blissey')).toEqual({ hp: 3 });
    expect(evYieldOf('garchomp')).toEqual({ atk: 3 });
    expect(evYieldOf('pikachu')).toEqual({ spe: 2 });
    expect(evYieldOf('charizard-mega-x')).toEqual(evYieldOf('charizard'));
    expect(evYieldOf('not-a-pokemon')).toEqual({});
  });

  it('≤ 252 per stat, ≤ 510 in total, never below 0', () => {
    const e = zeroEvs();
    expect(addEv(e, 'atk', 300)).toBe(EV_MAX_STAT);
    expect(addEv(e, 'spe', 252)).toBe(252);
    expect(addEv(e, 'hp', 50)).toBe(6);
    expect(evTotal(e)).toBe(EV_MAX_TOTAL);
    expect(addEv(e, 'def', 10)).toBe(0);
    expect(addEv(e, 'hp', -10)).toBe(-6);
    expect(e.hp).toBe(0);
  });

  it('Power items add +8 to their stat, the Macho Brace doubles', () => {
    expect(evGain('bulbasaur', 'power-bracer')).toEqual({ spa: 1, atk: 8 });
    expect(evGain('bulbasaur', 'power-lens')).toEqual({ spa: 9 });
    expect(evGain('blissey', 'macho-brace')).toEqual({ hp: 6 });
    expect(evGain('blissey', 'charcoal')).toEqual({ hp: 3 });
    const e = zeroEvs();
    expect(applyEvGain(e, { hp: 3, atk: 2 })).toEqual({ hp: 3, atk: 2 });
  });

  it('items exist, have art-free fallbacks, and are sold', () => {
    for (const id of [...EV_ITEMS, ...POWER]) {
      expect(ITEM_DEFS.has(id), id).toBe(true);
      expect(SHOP.some((s) => s.id === id), id).toBe(true);
    }
    for (const id of EV_ITEMS) expect(ITEM_DEFS.get(id)!.kind).toBe('evItem');
    for (const id of POWER) expect(ITEM_DEFS.get(id)!.effect?.type).toBe('evPower');
  });
});

describe('EV in the Adventure', () => {
  it('beating a Pokémon trains the party; the field unit gets the new stats', () => {
    const { st, p } = adventure();
    p.held = 'power-bracer';
    const w = new World({ mode: 'adventure', seed: 1, width: 4000, height: 4000 });
    const u = w.addPokemon(p.species, { level: p.level, uid: p.uid, ind: individualOf(p) });
    const atk0 = u.stats.atk;
    for (let i = 0; i < 30; i++) st.gainEvs([p.uid], 'machop'); // machop: +1 Atk, +8 Power Bracer
    expect(p.evs!.atk).toBe(252);
    w.setIndividual(u, individualOf(p));
    expect(u.stats.atk).toBe(atk0 + Math.floor((63 * p.level) / 100));
    w.step(STEP);
  });

  it('vitamins +10 (not wasted at the cap), berries −10 with friendship', () => {
    const { st, p } = adventure();
    st.addItems({ protein: 30, 'kelpsy-berry': 2 });
    expect(st.useEvItem(p.uid, 'protein')).toBe(10);
    expect(st.item('protein')).toBe(29);
    for (let i = 0; i < 30; i++) st.useEvItem(p.uid, 'protein');
    expect(p.evs!.atk).toBe(252);
    const left = st.item('protein');
    expect(st.useEvItem(p.uid, 'protein')).toBe(0);
    expect(st.item('protein')).toBe(left); // nothing happened → not consumed
    const f0 = p.friendship ?? 0;
    expect(st.useEvItem(p.uid, 'kelpsy-berry')).toBe(-10);
    expect(p.evs!.atk).toBe(242);
    expect(p.friendship ?? 0).toBeGreaterThan(f0);
  });

  it('EVs are saved, survive evolution, and old saves load with 0 EVs', () => {
    const { st, p } = adventure();
    st.addItems({ calcium: 3 });
    st.useEvItem(p.uid, 'calcium');
    const re = migrate(JSON.parse(JSON.stringify(st.save)));
    expect(re.collection.find((c) => c.uid === p.uid)!.evs!.spa).toBe(10);
    p.level = 36;
    st.evolve(p.uid, 'charmeleon');
    expect(p.species).toBe('charmeleon');
    expect(p.evs!.spa).toBe(10);
    const old = { ...p, evs: undefined };
    expect(individualOf(old).evs).toBeUndefined();
  });
});
