import { describe, expect, it } from 'vitest';
import { beatBossTo } from './bossHelpers';
import { STEP, World } from '../src/core/world';

/** Plays the run headlessly with a simple kiting bot and auto-picks the first card. */
function simulate(world: World, seconds: number, bot = true): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    if (world.state === 'levelup') botPick(world);
    if (world.state !== 'playing') break;
    if (bot) steerBot(world);
    world.step(STEP);
  }
}

/** Recruit when possible, otherwise take the first card. */
export function botPick(world: World): void {
  const i = world.currentOffers.findIndex((o) => o.kind === 'pokemon');
  world.chooseOffer(Math.max(0, i));
}

/** Head for the nearest gem, otherwise drift in a slow circle; flee if crowded. */
export function steerBot(world: World): void {
  const t = world.trainer;
  let gx = 0, gy = 0, best = 600;
  for (const g of world.gems) {
    if (!g.active) continue;
    const d = Math.hypot(g.x - t.x, g.y - t.y);
    if (d < best) { best = d; gx = g.x - t.x; gy = g.y - t.y; }
  }
  let ax = 0, ay = 0;
  for (const e of world.enemies) {
    const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
    if (d < 120 && d > 0) { const w = (120 - d) / 120; ax += (dx / d) * w; ay += (dy / d) * w; }
  }
  const danger = Math.hypot(ax, ay);
  const gl = best < 600 ? best : 0;
  if (danger > 0.15 || gl) {
    const gw = gl ? 0.6 : 0;
    const x = ax * 1.5 + (gl ? (gx / gl) * gw : 0), y = ay * 1.5 + (gl ? (gy / gl) * gw : 0);
    const l = Math.hypot(x, y) || 1;
    world.input.x = x / l; world.input.y = y / l;
    return;
  }
  const a = world.time * 0.35;
  world.input.x = Math.cos(a);
  world.input.y = Math.sin(a);
}

describe('world simulation', () => {
  it('allies auto-target, use skills and kill enemies', () => {
    const w = new World({ starter: 'charmander', seed: 42 });
    simulate(w, 60);
    expect(w.kills).toBeGreaterThan(10);
    expect(w.allies[0].damageDealt).toBeGreaterThan(0);
    expect(w.level).toBeGreaterThan(1);
  });

  it('every state value stays finite', () => {
    const w = new World({ starter: 'squirtle', seed: 7 });
    simulate(w, 90);
    for (const u of [w.trainer, ...w.allies, ...w.enemies]) {
      expect(Number.isFinite(u.x)).toBe(true);
      expect(Number.isFinite(u.y)).toBe(true);
      expect(Number.isFinite(u.hp)).toBe(true);
    }
  });

  it('level-up pauses the sim until a card is chosen', () => {
    const w = new World({ starter: 'bulbasaur', seed: 3 });
    w.gainExp(w.expNext);
    w.step();
    expect(w.state).toBe('levelup');
    expect(w.currentOffers.length).toBe(3);
    const t = w.time;
    w.step();
    expect(w.time).toBe(t);
    expect(w.chooseOffer(0)).toBe(true);
    expect(w.state).toBe('playing');
  });

  it('recruiting a pokemon via an offer adds it to the party', () => {
    const w = new World({ starter: 'charmander', seed: 5 });
    w.state = 'levelup';
    w.pendingLevelUps = 1;
    w.currentOffers = [{ kind: 'pokemon', key: 'pokemon:squirtle', pokemonId: 'squirtle', rarity: 'rare', title: '', description: '', icon: '', preview: '' }];
    w.chooseOffer(0);
    expect(w.allies.map((a) => a.defId)).toEqual(['charmander', 'squirtle']);
  });

  it('boss spawns at 5:00, has telegraphs and enters phase 2', () => {
    const w = new World({ starter: 'squirtle', seed: 11 });
    w.addPokemon('bulbasaur');
    w.gainExp(4000); // bring the party to a level appropriate for minute 5
    while (w.pendingLevelUps > 0) { w.state = 'levelup'; w.currentOffers = []; w.pendingLevelUps--; }
    w.state = 'playing' as World['state'];
    w.time = 299.995;
    w.step();
    expect(w.boss).not.toBeNull();
    const boss = w.boss!;
    expect(boss.boss!.phase).toBe(1);
    // let it act for a while
    for (let i = 0; i < 60 * 8; i++) {
      if (w.state === 'levelup') w.chooseOffer(0);
      w.step();
    }
    expect(boss.alive).toBe(true);
    const usedTelegraph = w.zones.some((z) => z.owner === boss) || boss.skills.some((s) => s.cd > 0);
    expect(usedTelegraph).toBe(true);
    w.applyDamage(boss, Math.ceil(boss.hp - boss.maxHp * 0.4), null);
    while (w.state === 'levelup') w.chooseOffer(0);
    w.step();
    expect(boss.boss!.phase).toBe(2);
  });

  it('allies dodge out of enemy telegraphs', () => {
    const w = new World({ starter: 'charmander', seed: 1, obstacles: false });
    const ally = w.allies[0];
    const boss = w.spawnBoss('onix', 10, false);
    boss.x = ally.x + 400; boss.y = ally.y;
    w['addZone'](boss, boss.skills[0], 'circle', ally.x, ally.y, 55, 0, 0, 1.0, 0, 0, false);
    expect(w.dangerVector(ally)).not.toBeNull();
    const startX = ally.x, startY = ally.y;
    for (let i = 0; i < 40; i++) w.step();
    expect(Math.hypot(ally.x - startX, ally.y - startY)).toBeGreaterThan(40);
  });

  it('defeating the final boss wins the run', () => {
    const w = new World({ starter: 'charmander', seed: 2 });
    const b = w.spawnBoss('onix', 20, true);
    beatBossTo(w, b, 0);
    expect(w.bossesDefeated).toBe(1);
    for (let i = 0; i < 60 * 4; i++) {
      if (w.state === 'levelup') w.chooseOffer(0);
      w.step();
    }
    expect(w.state).toBe('victory');
  });

  it('trainer death ends the run', () => {
    const w = new World({ starter: 'charmander', seed: 4 });
    w.applyDamage(w.trainer, 99999, null);
    w.step();
    expect(w.state).toBe('gameover');
  });

  it('fainted allies revive after a delay', () => {
    const w = new World({ starter: 'charmander', seed: 6 });
    const a = w.allies[0];
    w.applyDamage(a, 99999, null);
    expect(a.fainted).toBe(true);
    for (let i = 0; i < 60 * 16; i++) { if (w.state === 'levelup') w.chooseOffer(0); w.step(); }
    expect(a.fainted).toBe(false);
  });

  it('simulation result is independent of frame grouping (fixed step)', () => {
    const a = new World({ starter: 'charmander', seed: 99 });
    const b = new World({ starter: 'charmander', seed: 99 });
    for (let i = 0; i < 600; i++) a.step(STEP);
    for (let i = 0; i < 300; i++) { b.step(STEP); b.step(STEP); }
    expect(a.kills).toBe(b.kills);
    expect(a.trainer.hp).toBe(b.trainer.hp);
  });

  it('balance: a full-party bot survives the first 3 minutes', () => {
    const w = new World({ starter: 'charmander', seed: 21 });
    simulate(w, 180);
    expect(w.state === 'playing' || w.state === 'levelup').toBe(true);
    expect(w.enemies.length).toBeLessThanOrEqual(300);
  });
});
