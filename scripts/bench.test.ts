import { expect, it } from 'vitest';
import { STEP, World } from '../src/core/world';
import { makeWildState } from '../src/core/wildAI';

// Combat engine micro-benchmark (no rendering): ms per simulated step in three scenarios.
//   npx vitest run --config scripts/vitest.bench.ts
// Numbers vary by machine; compare before / after on the same one.

function time(label: string, w: World, steps: number, keep?: () => void): number {
  for (let i = 0; i < 120; i++) { keep?.(); w.step(STEP); } // warm-up (JIT)
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) { keep?.(); w.step(STEP); }
  const ms = (performance.now() - t0) / steps;
  console.info(`[bench] ${label}: ${ms.toFixed(3)} ms/step`);
  return ms;
}

it('survivor: 6 allies vs 250 enemies', () => {
  const w = new World({ mode: 'survivor', seed: 7, starter: 'charmander', obstacles: false });
  for (const s of ['squirtle', 'bulbasaur', 'pikachu', 'geodude', 'abra']) w.addPokemon(s, { level: 20 });
  const ids = ['rattata', 'magnemite', 'geodude'];
  const keep = () => {
    w.trainer.hp = w.trainer.maxHp;
    if (w.state === 'levelup') w.chooseOffer(0);
    while (w.enemies.length < 250) {
      const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(250, 700);
      w.spawnEnemy(ids[w.enemies.length % 3], 10, false, w.trainer.x + Math.cos(a) * d, w.trainer.y + Math.sin(a) * d);
    }
  };
  expect(time('survivor 6v250', w, 1200, keep)).toBeLessThan(20);
});

it('adventure: party of 6 vs 40 aggressive wild Pokémon', () => {
  const w = new World({ mode: 'adventure', seed: 3, width: 5000, height: 5000 });
  for (const s of ['charizard', 'blastoise', 'venusaur', 'pikachu', 'gengar', 'machamp']) w.addPokemon(s, { level: 50 });
  const t = w.trainer;
  const keep = () => {
    t.hp = t.maxHp;
    while (w.enemies.length < 40) {
      const a = w.rng.range(0, Math.PI * 2), d = w.rng.range(200, 500), x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
      w.spawnWild(['rattata', 'spearow', 'ekans', 'sandshrew'][w.enemies.length % 4], 30, x, y, { hostile: true, wild: makeWildState(x, y, 'aggressive', { aggroR: 800, leash: 2000 }) });
    }
  };
  expect(time('adventure 6v40', w, 1200, keep)).toBeLessThan(20);
  expect(w.allies.reduce((n, a) => n + a.damageDealt, 0)).toBeGreaterThan(0); // they really fight
});

it('duel: 3 on the field per side (6v6 parties)', () => {
  const w = new World({ mode: 'adventure', seed: 5, width: 1632, height: 1056, pvp: { fieldMax: 3, timeLimit: 1e9 } });
  const team = ['charizard', 'blastoise', 'venusaur', 'pikachu', 'snorlax', 'gengar'];
  for (const s of team) { w.addPokemon(s, { level: 50 }); w.addPokemon(s, { level: 50, rival: true }); }
  // keep everyone standing so the whole measurement is a full 3v3 fight
  const keep = () => { for (const s of w.sides()) for (const a of s.allies) if (a.hp < a.maxHp * 0.3) a.hp = a.maxHp; };
  expect(time('duel 3v3 field', w, 1200, keep)).toBeLessThan(20);
});
