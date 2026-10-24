import { describe, expect, it } from 'vitest';
import { POKEMON, SKILLS, playableSpecies, validateData } from '../src/core/data';
import { evolutionsOf } from '../src/core/evolution';
import { defaultSave, survivorPool } from '../src/systems/saveSchema';
import cache from '../src/data/pokeapi/pokeapi-cache.json';

const gen1 = Object.values((cache as unknown as { species: Record<string, { id: number; name: string }> }).species).filter((s) => s.id <= 151);

describe('Gen 1 roster', () => {
  it('contains all 151 Gen 1 species with valid data', () => {
    expect(gen1.length).toBe(151);
    for (const s of gen1) expect(POKEMON.has(s.name), s.name).toBe(true);
    expect(validateData()).toEqual([]);
  });
  it('every species skill exists', () => {
    for (const p of POKEMON.values()) for (const sk of p.skills ?? []) expect(SKILLS.has(sk), `${p.id}:${sk}`).toBe(true);
  });
  it('playable species exclude Mega forms', () => {
    const ids = playableSpecies();
    expect(ids).toContain('mewtwo');
    expect(ids.some((id) => POKEMON.get(id)!.mega)).toBe(false);
  });
  it('survivor pool honours the whole-Gen-1 option', () => {
    const save = defaultSave();
    expect(survivorPool(save, playableSpecies()).length).toBeLessThan(20);
    save.settings.gen1Survivor = true;
    expect(survivorPool(save, playableSpecies()).length).toBeGreaterThanOrEqual(151);
  });
  it('Gen 1 evolution chains resolve inside the game', () => {
    expect(evolutionsOf('bulbasaur').map((e) => e.to)).toContain('ivysaur');
    expect(evolutionsOf('eevee').map((e) => e.to)).toEqual(expect.arrayContaining(['vaporeon', 'jolteon', 'flareon']));
  });
});
