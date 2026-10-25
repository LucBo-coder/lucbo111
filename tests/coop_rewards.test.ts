import { describe, expect, it } from 'vitest';
import { applyCoopLoot } from '../src/net/coopRewards';
import { defaultSave } from '../src/systems/saveSchema';

describe('co-op loot sharing', () => {
  it('adds money, items and the captured Pokémon to the guest save', () => {
    const save = defaultSave();
    const lines = applyCoopLoot(save, {
      currency: 150, items: { potion: 2, pokeball: 5 },
      pokemon: { species: 'pikachu', level: 12, shiny: true, ball: 'greatball' }, note: 'Rương báu',
    });
    expect(save.currency).toBe(150);
    expect(save.inventory).toMatchObject({ potion: 2, pokeball: 5 });
    const p = save.collection[save.collection.length - 1];
    expect(p.species).toBe('pikachu');
    expect(p.level).toBe(12);
    expect(p.shiny).toBe(true);
    expect(p.ball).toBe('greatball');
    expect(save.pokedex.caught).toContain('pikachu');
    expect(lines).toEqual(['+150 xu', '+2 Potion', '+5 Poké Ball', 'Pikachu (Lv12) vào bộ sưu tập']);
  });

  it('ignores malformed data instead of corrupting the save', () => {
    const save = defaultSave();
    const lines = applyCoopLoot(save, {
      currency: -50,
      items: { 'not-an-item': 5, potion: -2, superpotion: 1.7 } as Record<string, number>,
      pokemon: { species: 'missingno', level: 5 },
    });
    expect(lines).toEqual(['+1 Super Potion']);
    expect(save.currency).toBe(0);
    expect(save.inventory).toEqual({ superpotion: 1 });
    expect(save.collection).toHaveLength(0);
  });

  it('clamps levels and caps absurd grants', () => {
    const save = defaultSave();
    applyCoopLoot(save, { currency: 1e12, items: { potion: 1e6 }, pokemon: { species: 'eevee', level: 1000 } });
    expect(save.currency).toBe(100_000);
    expect(save.inventory.potion).toBe(99);
    expect(save.collection[0].level).toBe(100);
  });

  it('stacks onto items the guest already owns', () => {
    const save = defaultSave();
    save.inventory.potion = 7;
    applyCoopLoot(save, { items: { potion: 3 } });
    expect(save.inventory.potion).toBe(10);
  });

  it('is a no-op for empty, missing or non-numeric loot', () => {
    const save = defaultSave();
    expect(applyCoopLoot(save, null)).toEqual([]);
    expect(applyCoopLoot(save, {})).toEqual([]);
    expect(applyCoopLoot(save, { currency: NaN, items: {} })).toEqual([]);
    expect(save.currency).toBe(0);
    expect(save.collection).toHaveLength(0);
  });
});
