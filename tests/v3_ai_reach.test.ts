import { it, expect } from 'vitest';
import { STEP, World } from '../src/core/world';
import { makeWildState } from '../src/core/wildAI';
it('Lv5 Bulbasaur (only Vine Whip) still fights a resisting Roselia', () => {
  const w = new World({ mode: 'adventure', seed: 3, width: 4000, height: 4000 });
  const b = w.addPokemon('bulbasaur', { level: 5 });
  const t = w.trainer;
  const e = w.spawnWild('roselia', 7, t.x + 130, t.y, { wild: makeWildState(t.x + 130, t.y, 'aggressive', { homeR: 40, aggroR: 600, leash: 900 }), hostile: true });
  for (let i = 0; i < 60 * 12; i++) { t.hp = t.maxHp; w.step(STEP); }
  console.log('kit', b.skills.map((s) => s.def.id), 'dmg', b.damageDealt, 'enemy hp', e.hp, e.maxHp);
  expect(b.damageDealt).toBeGreaterThan(0);
});
