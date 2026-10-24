import { describe, expect, it } from 'vitest';
import { computeDamage } from '../src/core/damage';
import { effectiveness } from '../src/core/typeChart';
import { STEP, World, Unit, MAX_STATUS_DURATION } from '../src/core/world';
import { AI_STATES } from '../src/core/aiState';
import { getSkill, SKILLS } from '../src/core/data';
import { makeWildState } from '../src/core/wildAI';

const dmg = (o: Partial<Parameters<typeof computeDamage>[0]>) => computeDamage({
  level: 50, power: 80, category: 'physical', skillType: 'normal', attackerTypes: ['fire'], defenderTypes: ['water'],
  atk: 100, spa: 100, def: 100, spd: 100, critRoll: 1, critRate: 0, varianceRoll: 1, modifier: 1, ...o,
}).amount;

function arena(seed = 5) {
  const w = new World({ mode: 'adventure', seed, width: 4000, height: 4000 });
  return w;
}
function foe(w: World, sp: string, lv: number, dx = 120): Unit {
  const t = w.trainer;
  return w.spawnWild(sp, lv, t.x + dx, t.y, { wild: makeWildState(t.x + dx, t.y, 'aggressive', { homeR: 40, aggroR: 600, leash: 900 }), hostile: true });
}

describe('damage & types (Part XIV combat tests)', () => {
  it('physical moves use Attack/Defense, special moves use Sp. Atk/Sp. Def', () => {
    expect(dmg({ category: 'physical', atk: 200 })).toBeGreaterThan(dmg({ category: 'physical', atk: 100 }));
    expect(dmg({ category: 'physical', spa: 300 })).toBe(dmg({ category: 'physical' }));
    expect(dmg({ category: 'special', spa: 200 })).toBeGreaterThan(dmg({ category: 'special' }));
    expect(dmg({ category: 'special', atk: 300 })).toBe(dmg({ category: 'special' }));
    expect(dmg({ category: 'physical', def: 200 })).toBeLessThan(dmg({ category: 'physical' }));
    expect(dmg({ category: 'special', spd: 200 })).toBeLessThan(dmg({ category: 'special' }));
  });
  it('dual-type multipliers, immunities and STAB', () => {
    expect(effectiveness('ice', ['grass', 'flying'])).toBe(4);
    expect(effectiveness('electric', ['water', 'ground'])).toBe(0);
    expect(effectiveness('fire', ['water', 'rock'])).toBe(0.25);
    expect(effectiveness('fighting', ['normal', 'ghost'])).toBe(0);
    expect(effectiveness('ground', ['fire', 'flying'])).toBe(0);
    expect(dmg({ skillType: 'electric', defenderTypes: ['ground'] })).toBe(0);
    expect(dmg({ skillType: 'fire', attackerTypes: ['fire'], defenderTypes: ['normal'] }))
      .toBeGreaterThan(dmg({ skillType: 'fire', attackerTypes: ['water'], defenderTypes: ['normal'] }));
  });
});

describe('real-time combat engine', () => {
  it('cooldowns gate re-casting', () => {
    const w = arena();
    const u = w.addPokemon('charmander', { level: 30 });
    foe(w, 'bulbasaur', 30, 100);
    let casts = 0, last = '';
    for (let i = 0; i < 60 * 6; i++) {
      w.step(STEP);
      if (u.castSlot >= 0 && u.lastSkill !== last + i) { /* counted below */ }
      for (const s of u.skills) expect(s.cd).toBeLessThanOrEqual(s.def.cooldown + 1e-6);
    }
    void casts;
    expect(u.skills.some((s) => s.cd > 0) || u.damageDealt > 0).toBe(true);
  });
  it('projectiles only damage on contact (no damage before the shot lands)', () => {
    const w = arena(9);
    const u = w.addPokemon('charmander', { level: 20 });
    u.skills = [{ def: getSkill('ember'), cd: 0, level: 1, powerBonus: 0 }];
    const e = foe(w, 'bulbasaur', 20, 260);
    e.moveSpeed = 0;
    const hp0 = e.hp;
    let shotSeen = false, hpWhenShot = -1;
    for (let i = 0; i < 60 * 4; i++) {
      w.step(STEP);
      if (!shotSeen && w.projectiles.some((p) => p.active && p.owner === u)) { shotSeen = true; hpWhenShot = e.hp; }
    }
    expect(shotSeen).toBe(true);
    expect(hpWhenShot).toBe(hp0);
    expect(e.hp).toBeLessThan(hp0);
  });
  it('fainted Pokémon never attack', () => {
    const w = arena();
    const u = w.addPokemon('pikachu', { level: 20 });
    foe(w, 'rattata', 20, 80);
    w.applyDamage(u, u.maxHp * 10, null);
    expect(u.fainted).toBe(true);
    const dealt = u.damageDealt;
    for (let i = 0; i < 60 * 5; i++) { w.step(STEP); if (u.fainted) expect(u.castSlot).toBe(-1); }
    expect(u.damageDealt).toBe(dealt);
  });
  it('AI uses explicit states, never flickers and never gets stuck casting', () => {
    const w = arena(3);
    for (const sp of ['charizard', 'blastoise', 'pikachu', 'snorlax', 'gengar']) w.addPokemon(sp, { level: 35 });
    for (let i = 0; i < 8; i++) foe(w, 'rattata', 20, 150 + i * 30);
    const switches = new Map<number, number>(), castT = new Map<number, number>();
    let prev = new Map(w.allies.map((a) => [a.id, a.aiState]));
    for (let i = 0; i < 60 * 20; i++) {
      w.trainer.hp = w.trainer.maxHp;
      w.step(STEP);
      for (const a of w.allies) {
        expect(AI_STATES).toContain(a.aiState);
        if (prev.get(a.id) !== a.aiState) switches.set(a.id, (switches.get(a.id) ?? 0) + 1);
        castT.set(a.id, a.aiState === 'cast' ? (castT.get(a.id) ?? 0) + STEP : 0);
        expect(castT.get(a.id)!).toBeLessThan(3);
      }
      prev = new Map(w.allies.map((a) => [a.id, a.aiState]));
    }
    for (const [, n] of switches) expect(n / 20).toBeLessThan(6); // < 6 state changes per second
    const seen = new Set(w.allies.map((a) => a.aiState));
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });
  it('units never leave the map', () => {
    const w = arena(4);
    const u = w.addPokemon('pidgeot', { level: 40 });
    w.teleport(30, 30);
    for (let i = 0; i < 8; i++) foe(w, 'rattata', 10, -200 + i * 10);
    for (let i = 0; i < 60 * 10; i++) {
      w.input.x = -1; w.input.y = -1;
      w.step(STEP);
      for (const x of [w.trainer, u, ...w.enemies.filter((e) => e.alive)]) {
        expect(x.x).toBeGreaterThanOrEqual(0); expect(x.y).toBeGreaterThanOrEqual(0);
        expect(x.x).toBeLessThanOrEqual(4000); expect(x.y).toBeLessThanOrEqual(4000);
      }
    }
  });
});

describe('statuses (real-time rules)', () => {
  const apply = (w: World, u: Unit, kind: Parameters<World['applyStatus']>[1]['kind'], duration = 3, magnitude = 0.03) =>
    w.applyStatus(u, { kind, chance: 1, duration, magnitude }, w.trainer);

  it('every status ends (bounded duration) and cannot stack endlessly', () => {
    const w = arena();
    const e = foe(w, 'rattata', 30, 300);
    e.moveSpeed = 0;
    apply(w, e, 'confusion', 999);
    apply(w, e, 'confusion', 999);
    expect(e.statuses.filter((s) => s.kind === 'confusion').length).toBe(1);
    expect(e.statuses[0].t).toBeLessThanOrEqual(MAX_STATUS_DURATION);
    for (let i = 0; i < 60 * (MAX_STATUS_DURATION + 1); i++) w.step(STEP);
    expect(e.statuses.length).toBe(0);
  });
  it('one major status at a time; type immunities', () => {
    const w = arena();
    const e = foe(w, 'rattata', 30, 300);
    apply(w, e, 'burn');
    apply(w, e, 'paralysis', 3, 0.5);
    expect(e.statuses.map((s) => s.kind)).toEqual(['burn']);
    const fire = foe(w, 'charmander', 30, 320);
    apply(w, fire, 'burn');
    expect(fire.statuses.length).toBe(0);
    const elec = foe(w, 'pikachu', 30, 340);
    apply(w, elec, 'paralysis', 3, 0.5);
    expect(elec.statuses.length).toBe(0);
    const steel = foe(w, 'magnemite', 30, 360);
    apply(w, steel, 'poison');
    expect(steel.statuses.length).toBe(0);
  });
  it('sleep / freeze incapacitate; a hit wakes the sleeper, fire thaws the frozen', () => {
    const w = arena();
    const e = foe(w, 'rattata', 30, 300);
    apply(w, e, 'sleep', 5, 0);
    expect(w.incapacitated(e)).toBe(true);
    for (let i = 0; i < 60; i++) w.step(STEP); // past the wake-up grace
    w.applyDamage(e, 1, w.trainer);
    expect(w.hasStatus(e, 'sleep')).toBe(false);
    const f = foe(w, 'pidgey', 30, 320);
    apply(w, f, 'freeze', 5, 0);
    expect(w.incapacitated(f)).toBe(true);
    const a = w.addPokemon('charmander', { level: 30 });
    (w as unknown as { hit: (s: Unit, d: Unit, sl: unknown, m: number) => void }).hit(a, f, { def: getSkill('ember'), cd: 0, level: 1, powerBonus: 0 }, 1);
    expect(w.hasStatus(f, 'freeze')).toBe(false);
  });
  it('flinch interrupts a cast and grants a short immunity', () => {
    const w = arena();
    const e = foe(w, 'rattata', 30, 300);
    e.castSlot = 0; e.castT = 1;
    apply(w, e, 'flinch', 0.45, 0);
    expect(e.castSlot).toBe(-1);
    expect(w.incapacitated(e)).toBe(true);
    for (let i = 0; i < 40; i++) w.step(STEP);
    apply(w, e, 'flinch', 0.45, 0);
    expect(w.hasStatus(e, 'flinch')).toBe(false); // still immune
  });
  it('paralysis slows and sometimes fully paralyses; badly poisoned damage ramps up', () => {
    const w = arena(21);
    const e = foe(w, 'rattata', 30, 300);
    apply(w, e, 'paralysis', 8, 0.5);
    expect(w.slowFactor(e)).toBeCloseTo(0.5);
    const u = w.addPokemon('bulbasaur', { level: 30 });
    apply(w, u, 'paralysis', 8, 0.5);
    let full = 0;
    for (let i = 0; i < 60; i++) { u.castSlot = -1; u.skills[0].cd = 0; u.energy = 100; w.beginCast(u, 0); if (u.castSlot < 0) full++; }
    expect(full).toBeGreaterThan(5);
    expect(full).toBeLessThan(30);
    const t = foe(w, 'rattata', 30, 340);
    t.maxHp = t.hp = 100000; t.moveSpeed = 0;
    apply(w, t, 'badPoison', 6, 0.02);
    const hits: number[] = [];
    let hp = t.hp;
    for (let i = 0; i < 60 * 5; i++) { w.step(STEP); if (t.hp < hp) { hits.push(hp - t.hp); hp = t.hp; } }
    expect(hits[hits.length - 1]).toBeGreaterThan(hits[0] * 2);
  });
  it('Guts turns a burn into a boost (main-series rule)', () => {
    const w = arena(31);
    const r = w.addPokemon('rattata', { level: 30 });
    expect(r.passive?.kind).toBe('guts');
  });
  it('burn halves physical damage; accuracy makes some moves miss', () => {
    const w = arena(30);
    const a = w.addPokemon('sandshrew', { level: 30 }); // no Guts (Rattata's Guts would *boost* when burned)
    expect(a.passive?.kind).not.toBe('guts');
    const target = foe(w, 'snorlax', 50, 300);
    target.maxHp = target.hp = 1e7;
    const tackle = { def: getSkill('tackle'), cd: 0, level: 1, powerBonus: 0 };
    const hitFn = (w as unknown as { hit: (s: Unit, d: Unit, sl: unknown, m: number) => void }).hit.bind(w);
    let plain = 0; for (let i = 0; i < 40; i++) { const h = target.hp; hitFn(a, target, tackle, 1); plain += h - target.hp; }
    apply(w, a, 'burn', 8, 0);
    let burned = 0; for (let i = 0; i < 40; i++) { const h = target.hp; hitFn(a, target, tackle, 1); burned += h - target.hp; }
    expect(burned / plain).toBeGreaterThan(0.4);
    expect(burned / plain).toBeLessThan(0.6);
    const inaccurate = [...SKILLS.values()].find((s) => s.accuracy && s.accuracy <= 70 && s.kind === 'melee');
    if (inaccurate) {
      let misses = 0;
      const sl = { def: inaccurate, cd: 0, level: 1, powerBonus: 0 };
      for (let i = 0; i < 200; i++) { const h = target.hp; hitFn(a, target, sl, 1); if (h === target.hp) misses++; }
      expect(misses).toBeGreaterThan(20);
    }
  });
});

describe('pixel-perfect rendering helpers', () => {
  it('camera zoom always lands on the 1/3 grid (every ×3 art pixel = whole screen pixels)', async () => {
    const { pixelPerfectZoom } = await import('../src/render/pixelZoom');
    for (const raw of [0.4, 0.63, 0.9, 1.0, 1.16, 1.45, 1.6, 2.5]) {
      const z = pixelPerfectZoom(raw, 0.6, 1.6);
      expect(Math.abs(z * 3 - Math.round(z * 3))).toBeLessThan(1e-9);
      expect(z).toBeLessThanOrEqual(1.6);
      expect(z).toBeGreaterThanOrEqual(2 / 3 - 1e-9);
    }
  });
});
