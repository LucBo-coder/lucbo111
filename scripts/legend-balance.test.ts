import { it } from 'vitest';
import { BOSSES } from '../src/core/data';
import { LEGENDS } from '../src/core/legends';
import { STEP, World } from '../src/core/world';

// Balance probe for every legendary boss (shrine + roaming): a strong 6-Pokémon party of the boss's level
// fights it; the trainer is kept alive (a player dodges). Prints time-to-kill and the worst moment (fainted).
// Run: npx vitest run --config scripts/vitest.balance.ts scripts/legend-balance.test.ts
const PARTY = ['garchomp', 'metagross', 'gyarados', 'alakazam', 'infernape', 'blissey'];

it('legendary probe', () => {
  const rows: string[] = [];
  for (const l of LEGENDS.values()) {
    if (l.kind !== 'shrine' && l.kind !== 'roaming') continue;
    const def = BOSSES.get(l.id);
    if (!def) continue;
    const lv = l.level ?? 50;
    const res: string[] = [];
    for (const seed of [1, 2]) {
      const w = new World({ mode: 'adventure', seed, width: 6000, height: 6000, trainerLevel: 15 });
      for (const sp of PARTY) w.addPokemon(sp, { level: lv });
      const t = w.trainer; t.maxHp = t.hp = 1e9;
      const b = w.spawnBoss(l.id, lv, false, { x: t.x + 260, y: t.y });
      w.teleport(b.boss!.homeX - 60, b.boss!.homeY + 60); // the player walks into the arena
      let time = 0, maxF = 0;
      // since v0.8 a legendary ends WEAKENED (capture window) instead of dying
      const down = () => !b.alive || !!b.boss!.weakened;
      for (let i = 0; i < 60 * 300 && !down(); i++) { w.step(STEP); time += STEP; maxF = Math.max(maxF, w.allies.filter((a) => a.fainted).length); }
      const dealt = w.allies.reduce((a, u) => a + u.damageDealt, 0);
      res.push(`${!down() ? 'ALIVE ' + Math.round((b.hp / b.maxHp) * 100) + '%' : Math.round(time) + 's'}/f${maxF}/dps${Math.round(dealt / time)}`);
    }
    rows.push(`${l.id.padEnd(10)} Lv${lv} hp×${def.hpMult} pw${def.legend?.power ?? '-'}  ${res.join('  ')}`);
  }
  console.log('PROBE\n' + rows.join('\n'));
});
