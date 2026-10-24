// Balance probe: `npx vitest run --config scripts/vitest.balance.ts`
import { it } from 'vitest';
import { STEP, World } from '../src/core/world';
import { botPick, steerBot } from '../tests/world.test';

it('probe', () => {
  for (const starter of ['charmander', 'squirtle', 'bulbasaur']) {
    const res: string[] = [];
    for (const seed of [1, 2, 3]) {
      const w = new World({ starter, seed });
      let lvlAt5 = 0;
      while (w.time < 960 && w.state !== 'gameover' && w.state !== 'victory') {
        if (w.state === 'levelup') { botPick(w); continue; }
        steerBot(w);
        w.step(STEP);
        if (!lvlAt5 && w.time >= 300) lvlAt5 = w.level;
      }
      res.push(`${w.state}@${Math.round(w.time)}s lvl${w.level} (lvl@5m=${lvlAt5}) bosses=${w.bossesDefeated}`);
    }
    console.log(`== ${starter}: ${res.join(' | ')}`);
  }
}, 600_000);
