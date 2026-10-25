import { describe, expect, it } from 'vitest';
import { STEP, World } from '../src/core/world';

type Team = [string, number][];

function duel(home: Team, rival: Team, seed: number, timeLimit = 180): World {
  const w = new World({ mode: 'adventure', seed, width: 1600, height: 1000, pvp: { timeLimit } });
  w.trainer.y = w.rival!.trainer.y = 500;
  for (const [sp, lv] of home) w.addPokemon(sp, { level: lv });
  for (const [sp, lv] of rival) w.addPokemon(sp, { level: lv, rival: true });
  return w;
}
function play(w: World, max = 60 * 240): number {
  let i = 0;
  for (; i < max && w.state === 'playing'; i++) w.step(STEP);
  return i * STEP;
}

const A: Team = [['charizard', 50], ['blastoise', 50], ['venusaur', 50]];
const B: Team = [['gengar', 50], ['machamp', 50], ['alakazam', 50]];

describe('PvP duel engine', () => {
  it('the rival side runs the party AI: both teams fight, one wins, trainers are never hit', () => {
    const w = duel(A, B, 1);
    const t0 = w.trainer.hp, r0 = w.rival!.trainer.hp;
    const time = play(w);
    expect(w.state).toBe('duelOver');
    expect(['home', 'rival']).toContain(w.duel!.winner);
    expect(w.trainer.hp).toBe(t0);
    expect(w.rival!.trainer.hp).toBe(r0);
    expect(w.allies.reduce((n, a) => n + a.damageDealt, 0)).toBeGreaterThan(0);
    expect(w.rival!.allies.reduce((n, a) => n + a.damageDealt, 0)).toBeGreaterThan(0);
    // the loser has no Pokémon standing, and nobody revives in a duel
    const loser = w.duel!.winner === 'home' ? w.rival! : w.home;
    expect(loser.allies.every((a) => a.fainted)).toBe(true);
    expect(time).toBeGreaterThan(8);
  });

  it('mirror matches are fair: same teams on both sides win about half of the time', () => {
    // (measured while building it: 300 seeds per config, 47–54 % for two different teams, both arena sides)
    let home = 0, rival = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const w = duel(A, A, seed);
      play(w);
      if (w.duel!.winner === 'home') home++;
      else if (w.duel!.winner === 'rival') rival++;
    }
    console.info(`[duel] mirror 60 seeds: home ${home} · rival ${rival}`);
    expect(home / (home + rival)).toBeGreaterThan(0.35);
    expect(home / (home + rival)).toBeLessThan(0.65);
  });

  it('deterministic: same seed and same orders give the same duel', () => {
    const run = () => {
      const w = duel(A, B, 77);
      for (let i = 0; i < 60 * 30; i++) {
        if (i === 300) w.setCommand('retreat', null, w.rival!);
        if (i === 600) w.setCommand('auto', null, w.rival!);
        w.step(STEP);
      }
      return JSON.stringify([...w.allies, ...w.rival!.allies].map((u) => [Math.round(u.x * 100), Math.round(u.y * 100), u.hp, u.fainted]));
    };
    expect(run()).toBe(run());
  });

  it('orders are per side: a retreating rival stops fighting while the home side keeps attacking', () => {
    const w = duel(A, B, 5);
    for (let i = 0; i < 60 * 3; i++) w.step(STEP);
    w.setCommand('retreat', null, w.rival!);
    expect(w.command).toBe('auto');
    for (let i = 0; i < 60 * 2; i++) w.step(STEP);
    expect(w.rival!.allies.every((a) => a.target === null || a.fainted)).toBe(true);
    expect(w.allies.some((a) => a.target !== null)).toBe(true);
  });

  it('time limit: the side with more HP left wins', () => {
    const w = duel([['snorlax', 50]], [['snorlax', 50]], 3, 5);
    for (let i = 0; i < 60; i++) w.step(STEP);
    w.rival!.allies[0].hp = 1;
    play(w);
    expect(w.duel!.winner).toBe('home');
  });

  it('a stronger team wins most duels', () => {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const w = duel([['charizard', 60], ['blastoise', 60], ['venusaur', 60]], [['charmander', 30], ['squirtle', 30], ['bulbasaur', 30]], seed);
      play(w);
      if (w.duel!.winner === 'home') wins++;
    }
    expect(wins).toBe(8);
  });
});

describe('PvP duel: bench, switching, Mega', () => {
  const six: Team = [['charizard', 50], ['blastoise', 50], ['venusaur', 50], ['pikachu', 50], ['snorlax', 50], ['gengar', 50]];
  const mk = (seed = 2) => {
    const w = new World({ mode: 'adventure', seed, width: 1600, height: 1000, pvp: { fieldMax: 3 } });
    w.trainer.y = w.rival!.trainer.y = 500;
    for (const [sp, lv] of six) { w.addPokemon(sp, { level: lv }); w.addPokemon(sp, { level: lv, rival: true }); }
    return w;
  };

  it('3 on the field, 3 on the bench; a fainted field member is replaced automatically', () => {
    const w = mk();
    expect(w.allies.length).toBe(3);
    expect(w.home.bench.length).toBe(3);
    w.applyDamage(w.rival!.allies[0], 1e9, w.allies[0]);
    expect(w.rival!.allies[0].fainted).toBe(true);
    for (let i = 0; i < 60 * 2; i++) w.step(STEP);
    expect(w.rival!.allies.filter((a) => !a.fainted).length).toBe(3);
    expect(w.rival!.bench.length).toBe(2);
    expect(w.state).toBe('playing');
  });

  it('switching keeps HP, has a cooldown, and the benched unit is untouchable', () => {
    const w = mk();
    const out = w.allies[0], inc = w.home.bench[0];
    out.hp = Math.round(out.maxHp * 0.4);
    expect(w.duelSwitch(w.home, out, inc)).toBe(true);
    expect(w.home.bench).toContain(out);
    expect(w.allies).toContain(inc);
    expect(out.hp).toBe(Math.round(out.maxHp * 0.4));
    expect(w.duelSwitch(w.home, inc, out)).toBe(false); // cooldown
    for (let i = 0; i < 60 * 3; i++) w.step(STEP);
    expect(out.hp).toBe(Math.round(out.maxHp * 0.4)); // nobody can hit a benched Pokémon
    for (let i = 0; i < 60 * 2; i++) w.step(STEP);
    expect(w.duelSwitch(w.home, inc, out)).toBe(true);
  });

  it('the duel is only lost when the whole party (bench included) is down', () => {
    const w = mk();
    for (const a of [...w.rival!.allies]) w.applyDamage(a, 1e9, null);
    w.step(STEP);
    expect(w.state).toBe('playing');
    for (const a of [...w.rival!.allies, ...w.rival!.bench]) w.applyDamage(a, 1e9, null);
    for (let i = 0; i < 10 && w.state === 'playing'; i++) w.step(STEP);
    expect(w.duel!.winner).toBe('home');
  });

  it('Mega Evolution: once per duel, needs the matching Mega Stone, lasts the duel', () => {
    const w = new World({ mode: 'adventure', seed: 1, width: 1600, height: 1000, pvp: {} });
    const zard = w.addPokemon('charizard', { level: 50, held: 'charizardite-x' });
    const gyara = w.addPokemon('gyarados', { level: 50, held: 'charizardite-x' });
    w.addPokemon('blastoise', { level: 50, rival: true });
    expect(w.duelMega(w.home, gyara)).toBe(false);
    expect(w.duelMega(w.home, zard)).toBe(true);
    expect(zard.defId).toBe('charizard-mega-x');
    expect(w.duelMega(w.home, zard)).toBe(false);
    for (let i = 0; i < 60 * 20 && w.state === 'playing'; i++) w.step(STEP);
    expect(zard.defId).toBe('charizard-mega-x');
  });
});
