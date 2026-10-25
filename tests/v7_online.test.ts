import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventure/AdventureState';
import { applyCandy, CANDY_DEFS, candyDef, maxUsefulCandy, previewCandy } from '../src/core/candy';
import { emptyPc, pcUids } from '../src/core/pc';
import { expForLevel, makeOwned, MAX_LEVEL } from '../src/core/progression';
import { defaultSave, migrate, newAdventure, SAVE_VERSION } from '../src/systems/saveSchema';

function state() {
  const s = defaultSave();
  s.adventure = newAdventure();
  return new AdventureState(s);
}

describe('save v7: single active Pokémon + PC', () => {
  it('migrates a v6 save without losing a single Pokémon', () => {
    const collection = ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'eevee', 'pidgey', 'rattata', 'onix']
      .map((sp, i) => ({ ...makeOwned(sp, 5 + i, 'wild', 1000 + i), uid: 'u' + i }));
    const v6 = {
      version: 6,
      currency: 99,
      collection,
      pokedex: { seen: [], caught: [], shiny: [] },
      adventure: {
        ...newAdventure(), party: ['u0', 'u1', 'u2'], recalled: ['u1', 'u2'], activeUid: undefined, pc: undefined,
      },
    };
    const m = migrate(v6);
    expect(m.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(7);
    expect(m.currency).toBe(99);
    expect(m.adventure!.activeUid).toBe('u0');
    expect(m.adventure!.recalled).toEqual(['u1', 'u2']);
    const party = new Set(m.adventure!.party);
    const pc = new Set(pcUids(m.adventure!.pc));
    for (const p of collection) expect(party.has(p.uid) || pc.has(p.uid)).toBe(true);
    expect(pc.has('u3')).toBe(true);
    expect(m.adventure!.pc.boxes.length).toBe(16);
    expect(m.adventure!.pc.boxes[0].slots.length).toBe(30);
  });

  it('repairs duplicate party / PC references and unknown uids', () => {
    const s = defaultSave();
    s.adventure = newAdventure();
    const st = new AdventureState(s);
    const a = st.addPokemon('charmander', 5, 'starter');
    const b = st.addPokemon('squirtle', 5, 'starter');
    const raw = JSON.parse(JSON.stringify(st.save));
    raw.adventure.party = [a.uid, a.uid, b.uid, 'ghost'];
    raw.adventure.recalled = [a.uid, a.uid, 'ghost'];
    raw.adventure.pc.boxes[0].slots[0] = a.uid; // also in party: party wins
    raw.adventure.pc.boxes[0].slots[1] = 'ghost';
    raw.adventure.activeUid = 'ghost';
    const m = migrate(raw);
    expect(m.adventure!.party).toEqual([a.uid, b.uid]);
    expect(m.adventure!.activeUid).toBeNull();
    expect(pcUids(m.adventure!.pc)).not.toContain(a.uid);
    expect(pcUids(m.adventure!.pc)).not.toContain('ghost');
  });
});

describe('AdventureState v7: party, PC and auto-store', () => {
  it('has exactly one active Pokémon and can recall to an empty field', () => {
    const st = state();
    const a = st.addPokemon('charmander', 5, 'starter');
    const b = st.addPokemon('squirtle', 5, 'starter');
    expect(st.activeUid).toBe(a.uid);
    expect(st.party().length).toBe(2);
    // a second summon becomes a switch; the state enforces it too
    expect(st.setActive(b.uid)).toBe(true);
    expect(st.activeUid).toBe(b.uid);
    expect(st.adv.recalled).toEqual([a.uid]);
    expect(st.setActive('nope')).toBe(false);
    expect(st.recallActive()).toBe(true);
    expect(st.activeUid).toBeNull();
    expect(st.adv.recalled).toContain(b.uid);
    // fainted can never be active
    a.hpFrac = 0;
    expect(st.setActive(a.uid)).toBe(false);
  });

  it('auto-stores captures when the party is full and never loses one', () => {
    const st = state();
    const first = ['charmander', 'squirtle', 'bulbasaur', 'pikachu', 'eevee', 'pidgey'];
    for (const sp of first) st.addPokemon(sp, 5, 'wild');
    expect(st.party().length).toBe(6);
    const stored = st.addPokemon('rattata', 4, 'wild');
    expect(st.pcLocation(stored.uid)).not.toBeNull();
    expect(st.inParty(stored.uid)).toBe(false);
    expect(st.save.collection.length).toBe(7);

    // force a tiny *full* PC to exercise the "unplaced but safe" overflow policy
    st.adv.pc = emptyPc(1, 1);
    st.adv.pc.boxes[0].slots[0] = stored.uid;
    const overflow = st.addPokemon('onix', 7, 'wild');
    expect(st.pcLocation(overflow.uid)).toBeNull();
    expect(st.unplacedPokemon().map((p) => p.uid)).toContain(overflow.uid);
    expect(st.save.collection.map((p) => p.uid)).toContain(overflow.uid);
  });

  it('deposits, withdraws, swaps, renames, sorts and favourites', () => {
    const st = state();
    for (const sp of ['charmander', 'squirtle', 'bulbasaur', 'pikachu']) st.addPokemon(sp, 10, 'wild');
    const partyUids = [...st.adv.party];
    const deposited = partyUids[0];
    expect(st.depositToPc(deposited)).toBe(true);
    expect(st.inParty(deposited)).toBe(false);
    expect(st.pcLocation(deposited)).not.toBeNull();
    expect(st.pcPokemon().map((p) => p.uid)).toContain(deposited);
    expect(st.adv.activeUid).not.toBe(deposited);

    expect(st.withdrawFromPc(deposited)).toBe(true);
    expect(st.inParty(deposited)).toBe(true);
    expect(st.pcLocation(deposited)).toBeNull();

    // deposit two, then swap their slots
    st.depositToPc(deposited);
    const second = st.adv.party[0];
    st.depositToPc(second);
    const a = st.pcLocation(deposited)!;
    const b = st.pcLocation(second)!;
    expect(st.moveInPc(deposited, b.box, b.slot)).toBe(true);
    expect(st.pcLocation(deposited)).toEqual(b);
    expect(st.pcLocation(second)).toEqual(a);

    expect(st.renameBox(0, '  Kho   chính  ')).toBe(true);
    expect(st.pc.boxes[0].name).toBe('Kho chính');
    expect(st.renameBox(0, '   ')).toBe(false);
    expect(st.toggleFavorite(deposited)).toBe(true);
    expect(st.owned(deposited)!.favorite).toBe(true);
    expect(st.sortPc(0, 'favorite')).toBe(true);
    expect(st.pc.boxes[0].slots[0]).toBe(deposited);
    expect(st.renamePokemon(deposited, '  Bé   Lửa ')).toBe(true);
    expect(st.owned(deposited)!.nickname).toBe('Bé Lửa');
  });

  it('keeps party/PC disjoint after every operation', () => {
    const st = state();
    for (let i = 0; i < 9; i++) st.addPokemon(i % 2 ? 'pidgey' : 'rattata', 3 + i, 'wild');
    for (const uid of [...st.adv.party]) st.depositToPc(uid);
    // one partner must remain
    expect(st.adv.party.length).toBe(1);
    const party = new Set(st.adv.party), pc = pcUids(st.pc);
    expect(new Set(pc).size).toBe(pc.length);
    for (const uid of pc) expect(party.has(uid)).toBe(false);
    const all = new Set(st.save.collection.map((p) => p.uid));
    for (const uid of [...party, ...pc]) expect(all.has(uid)).toBe(true);
  });
});

describe('candy: authoritative EXP, levels and caps', () => {
  const p = () => makeOwned('charmander', 10, 'wild', 1);

  it('ships the five EXP candies with the required values plus Rare Candy', () => {
    expect(CANDY_DEFS.map((c) => [c.id, c.exp])).toEqual([
      ['exp-candy-xs', 100], ['exp-candy-s', 800], ['exp-candy-m', 3000], ['exp-candy-l', 10000], ['exp-candy-xl', 30000],
      ['rare-candy', undefined],
    ]);
    expect(candyDef('rare-candy')!.kind).toBe('rare');
  });

  it('applies EXP in one batch and increments friendship per level', () => {
    const m = p();
    const before = m.friendship ?? 0;
    const beforeExp = m.exp;
    const out = applyCandy(m, 'exp-candy-s', 10);
    expect(out.used).toBe(10);
    expect(out.expGained).toBe(8000);
    expect(m.exp).toBe(beforeExp + 8000);
    expect(m.level).toBeGreaterThan(10);
    expect(m.friendship).toBeGreaterThan(before);
    // preview never mutates
    const snap = JSON.stringify(m);
    previewCandy(m, 'rare-candy', 1);
    expect(JSON.stringify(m)).toBe(snap);
  });

  it('clamps at Lv100 / the EXP threshold and wastes no extra candy', () => {
    const m = p();
    m.level = MAX_LEVEL;
    m.exp = expForLevel(m.species, MAX_LEVEL);
    const out = applyCandy(m, 'exp-candy-xl', 99);
    expect(out.used).toBe(0);
    expect(out.expGained).toBe(0);
    expect(maxUsefulCandy(m, 'rare-candy')).toBe(0);
    const rare = applyCandy(m, 'rare-candy', 5);
    expect(rare.used).toBe(0);
    expect(m.level).toBe(MAX_LEVEL);
  });

  it('Rare Candy raises exactly one level per candy and keeps EXP consistent', () => {
    const m = p();
    const out = applyCandy(m, 'rare-candy', 3);
    expect(out.used).toBe(3);
    expect(out.levels).toBe(3);
    expect(m.level).toBe(13);
    expect(m.exp).toBeGreaterThanOrEqual(expForLevel(m.species, m.level));
    expect(m.exp).toBeLessThan(expForLevel(m.species, m.level + 1));
  });

  it('AdventureState consumes the bag, caps at the level limit and reports evolution', () => {
    const st = state();
    const m = st.addPokemon('charmander', 14, 'wild');
    st.addItems({ 'rare-candy': 50, 'exp-candy-xs': 7 });
    const out = st.useCandy(m.uid, 'rare-candy', 50);
    // the cap is Lv100, so every requested candy that still has a level to give is consumed
    expect(out.used).toBe(Math.min(50, MAX_LEVEL - 14));
    expect(st.item('rare-candy')).toBe(50 - out.used);
    expect(out.evolutions).toContain('charmeleon'); // Lv16 reached, evolution handled by the scene clock
    expect(st.owned(m.uid)!.level).toBe(Math.min(MAX_LEVEL, 14 + out.used));
    expect(out.evolutions.length === 0 || out.evolutions.includes('charmeleon')).toBe(true);
    const xs = st.useCandy(m.uid, 'exp-candy-xs', 7);
    expect(xs.used).toBeLessThanOrEqual(7);
    expect(st.item('exp-candy-xs')).toBe(7 - xs.used);
    // expiry: qty 0 / unknown item are no-ops
    const none = st.useCandy(m.uid, 'exp-candy-xs', 0);
    expect(none.used).toBe(0);
  });
});
