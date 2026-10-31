import { describe, expect, it } from 'vitest';
import { abilityEffect, abilityOf, abilityOptions, rollAbilitySlot } from '../src/core/abilities';
import { makeOwned, ensureIndividual } from '../src/core/progression';
import { randomTeraType } from '../src/core/pokemonTraits';
import { POKE_TYPES, type SkillDef } from '../src/core/types';
import { POKEMON, SKILLS } from '../src/core/data';
import { World, type Unit } from '../src/core/world';
import { defaultSave, migrate } from '../src/systems/saveSchema';
import { AdventureState } from '../src/adventure/AdventureState';
import { buildDuel, monFromOwned, RULESETS, validateParty } from '../src/net/duel';
import { applyCoopLoot } from '../src/net/coopRewards';

const hit = (w: World, a: Unit, b: Unit, type: SkillDef['type'], category: SkillDef['category'] = 'special') => {
  const def = { ...SKILLS.values().next().value!, type, category, kind: 'beam', power: 80, accuracy: 100, status: undefined } as SkillDef;
  (w as unknown as { hit(a: Unit, b: Unit, slot: unknown, mult: number): void }).hit(a, b, { def, cd: 0, level: 1, powerBonus: 0 }, 1);
};
describe('individual Tera and abilities', () => {
  it('rolls all 18 types independently of species and migrates missing traits deterministically', () => {
    expect(POKE_TYPES.map((_, i) => randomTeraType(() => (i + 0.5) / 18))).toEqual(POKE_TYPES);
    const p = makeOwned('pikachu', 20, 'wild');
    delete p.teraType; delete p.abilitySlot;
    const first = ensureIndividual({ ...p }), second = ensureIndividual({ ...p });
    expect([first.teraType, first.abilitySlot]).toEqual([second.teraType, second.abilitySlot]);
    const save = defaultSave(); first.teraType = 'dragon'; first.abilitySlot = 2; save.collection.push(first);
    const restored = migrate(JSON.parse(JSON.stringify(save))).collection[0];
    expect([restored.teraType, restored.abilitySlot]).toEqual(['dragon', 2]);
  });
  it('every species has a real-time effect for each available ability', () => {
    for (const p of POKEMON.values()) for (const a of abilityOptions(p.id)) {
      const effect = abilityEffect(p.id, a.slot);
      expect(effect.id, p.id).toBe(a.id);
      expect(effect.description.length).toBeGreaterThan(5);
    }
    expect(rollAbilitySlot('pikachu', () => 0, true)).toBe(2);
    expect(rollAbilitySlot('pikachu', () => 0, false)).toBe(0);
  });
  it('evolution preserves Tera and ability slot, resolving the evolved species ability', () => {
    const st = new AdventureState(defaultSave());
    const p = st.addPokemon('caterpie', 7, 'starter'); p.teraType = 'dragon'; p.abilitySlot = 2;
    expect(st.evolve(p.uid, 'metapod')).toBe(true);
    expect(p.teraType).toBe('dragon'); expect(p.abilitySlot).toBe(2);
    expect(abilityOf(p.species, p.abilitySlot).id).toBe('shed-skin');
    expect(validateParty([monFromOwned(p)], RULESETS.open)).toEqual([]);
  });
  it('summon, transform and network transfers keep individual traits', () => {
    const p = makeOwned('pikachu', 30, 'wild'); p.teraType = 'water'; p.abilitySlot = 2;
    const m = monFromOwned(p);
    const d = buildDuel(3, RULESETS.open, [m], [{ species: 'eevee', level: 30 }]);
    const u = d.world.allies[0];
    expect(u.teraPick).toBe('water'); expect(u.passive?.id).toBe('lightning-rod');
    d.world.transformAlly(u, 'raichu');
    expect(u.teraPick).toBe('water'); expect(u.passive?.id).toBe('lightning-rod');
    const save = defaultSave(); applyCoopLoot(save, { pokemon: { species: p.species, level: p.level, teraType: p.teraType, abilitySlot: p.abilitySlot } });
    expect(save.collection[0]).toMatchObject({ teraType: 'water', abilitySlot: 2 });
  });
  it('Levitate blocks Ground damage and secondary effects; absorption heals with a cooldown', () => {
    const w = new World({ mode: 'adventure', seed: 2 });
    const a = w.addPokemon('pikachu', { level: 30 });
    const b = w.spawnWild('gastly', 30, 100, 100); b.passive = abilityEffect('gastly');
    const hp = b.hp; hit(w, a, b, 'ground'); expect(b.hp).toBe(hp);
    b.passive = abilityEffect('vaporeon'); b.hp = b.maxHp / 2;
    hit(w, a, b, 'water'); expect(b.hp).toBe(b.maxHp * 0.75);
    hit(w, a, b, 'water'); expect(b.hp).toBe(b.maxHp * 0.75);
    w.time += 3; hit(w, a, b, 'water'); expect(b.hp).toBe(b.maxHp);
    hit(w, a, b, 'normal'); expect(b.hp).toBe(b.maxHp); // Gastly is still Ghost
  });
  it('Huge Power increases physical damage and critical immunity prevents critical hits', () => {
    const damage = (ability: boolean) => {
      const w = new World({ mode: 'adventure', seed: 4 });
      const a = w.addPokemon('azumarill', { level: 30 }); a.passive = ability ? abilityEffect('azumarill', 1) : null;
      const b = w.spawnWild('rattata', 30, 100, 100); b.passive = null; b.hp = b.maxHp = 10000;
      hit(w, a, b, 'normal', 'physical'); return 10000 - b.hp;
    };
    expect(damage(true)).toBeGreaterThan(damage(false) * 1.9);
    const w = new World({ mode: 'adventure', seed: 4 });
    const a = w.addPokemon('pikachu', { level: 30 }); a.critRate = 1;
    const b = w.spawnWild('shellder', 30, 100, 100); b.passive = abilityEffect('shellder', 0);
    w.drainEvents(); hit(w, a, b, 'normal');
    expect(w.drainEvents().filter(e => e.t === 'dmg').every(e => e.t === 'dmg' && !e.crit)).toBe(true);
  });
});
