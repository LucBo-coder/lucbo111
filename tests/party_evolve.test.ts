import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventure/AdventureState';
import { defaultSave } from '../src/systems/saveSchema';

// Party screen "Tiến hóa" button: which evolutions a Pokémon can take right now.

describe('ready evolutions (party screen)', () => {
  it('level-up evolutions once the level is reached, even after a "not now"', () => {
    const st = new AdventureState(defaultSave());
    const low = st.addPokemon('bulbasaur', 10, 'wild');
    expect(st.readyEvolutions(low.uid)).toEqual([]);
    const p = st.addPokemon('bulbasaur', 20, 'wild');
    expect(st.readyEvolutions(p.uid)).toEqual([{ to: 'ivysaur' }]);
    st.declineEvolution(p.uid);
    expect(st.pendingEvolutions(p.uid)).toEqual([]); // the automatic prompt waits for the next level
    expect(st.readyEvolutions(p.uid)).toEqual([{ to: 'ivysaur' }]); // the button still offers it
  });

  it('stone evolutions only with the stone in the bag', () => {
    const st = new AdventureState(defaultSave());
    const p = st.addPokemon('pikachu', 20, 'wild');
    expect(st.readyEvolutions(p.uid)).toEqual([]);
    st.addItems({ 'thunder-stone': 1 });
    expect(st.readyEvolutions(p.uid)).toEqual([{ to: 'raichu', item: 'thunder-stone' }]);
    expect(st.evolve(p.uid, 'raichu', 'thunder-stone')).toBe(true);
    expect(st.item('thunder-stone')).toBe(0);
  });
});
