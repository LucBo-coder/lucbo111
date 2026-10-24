import { describe, expect, it } from 'vitest';
import { effectiveness, typeMultiplier } from '../src/core/typeChart';
import { POKE_TYPES } from '../src/core/types';
import { computeDamage } from '../src/core/damage';
import { calcHp, calcStat, expToNext } from '../src/core/stats';
import { SpatialGrid } from '../src/core/spatialGrid';
import { getSkill, validateData } from '../src/core/data';
import { chooseSkill, SelectorContext } from '../src/core/skillSelector';
import { curves, EnemyDirector } from '../src/core/director';
import { Rng } from '../src/core/rng';
import { emptyMods, rollOffers, RunView } from '../src/core/upgrades';

describe('data', () => {
  it('passes cross-reference validation', () => {
    expect(validateData()).toEqual([]);
  });
});

describe('type chart', () => {
  it('has all 18 types', () => {
    expect(POKE_TYPES.length).toBe(18);
  });
  it('matches known matchups', () => {
    expect(typeMultiplier('fire', 'grass')).toBe(2);
    expect(typeMultiplier('water', 'fire')).toBe(2);
    expect(typeMultiplier('electric', 'ground')).toBe(0);
    expect(typeMultiplier('normal', 'ghost')).toBe(0);
    expect(typeMultiplier('dragon', 'fairy')).toBe(0);
    expect(typeMultiplier('fairy', 'dragon')).toBe(2);
    expect(typeMultiplier('ghost', 'normal')).toBe(0);
    expect(typeMultiplier('steel', 'fairy')).toBe(2);
  });
  it('multiplies for dual types', () => {
    expect(effectiveness('water', ['rock', 'ground'])).toBe(4);
    expect(effectiveness('grass', ['rock', 'ground'])).toBe(4);
    expect(effectiveness('fire', ['rock', 'ground'])).toBe(0.5);
    expect(effectiveness('electric', ['water', 'flying'])).toBe(4);
    expect(effectiveness('ground', ['electric', 'steel'])).toBe(4);
    expect(effectiveness('fire', ['grass', 'poison'])).toBe(2);
  });
});

describe('damage', () => {
  const base = {
    level: 10, power: 40, category: 'special' as const, skillType: 'fire' as const, attackerTypes: ['fire' as const],
    defenderTypes: ['normal' as const], atk: 20, spa: 20, def: 20, spd: 20, critRoll: 0.99, critRate: 0.05, varianceRoll: 1, modifier: 1,
  };
  it('applies STAB', () => {
    const stab = computeDamage(base).amount;
    const noStab = computeDamage({ ...base, attackerTypes: ['water'] }).amount;
    expect(stab).toBeGreaterThan(noStab);
    expect(computeDamage(base).stab).toBe(true);
  });
  it('applies effectiveness, immunity and crit', () => {
    const neutral = computeDamage(base).amount;
    expect(computeDamage({ ...base, defenderTypes: ['grass'] }).amount).toBeGreaterThan(neutral * 1.8);
    expect(computeDamage({ ...base, skillType: 'electric', defenderTypes: ['ground'] }).amount).toBe(0);
    const crit = computeDamage({ ...base, critRoll: 0 });
    expect(crit.crit).toBe(true);
    expect(crit.amount).toBeGreaterThan(neutral);
  });
  it('uses physical vs special stats', () => {
    const phys = computeDamage({ ...base, category: 'physical', atk: 60 }).amount;
    const spec = computeDamage({ ...base, category: 'special', atk: 60 }).amount;
    expect(phys).toBeGreaterThan(spec);
  });
  it('variance stays in 85-100%', () => {
    const hi = computeDamage({ ...base, varianceRoll: 1 }).amount;
    const lo = computeDamage({ ...base, varianceRoll: 0 }).amount;
    expect(lo).toBeLessThanOrEqual(hi);
    expect(lo).toBeGreaterThanOrEqual(Math.floor(hi * 0.84));
  });
});

describe('stats', () => {
  it('uses main-series formulas', () => {
    expect(calcHp(39, 5)).toBe(18);
    expect(calcStat(60, 50)).toBe(65);
  });
  it('exp curve grows', () => {
    for (let l = 1; l < 60; l++) expect(expToNext(l + 1)).toBeGreaterThan(expToNext(l));
  });
});

describe('spatial grid', () => {
  it('returns only items within radius', () => {
    const g = new SpatialGrid<{ x: number; y: number; id: number }>(50);
    for (let i = 0; i < 100; i++) g.insert({ x: i * 10, y: 0, id: i });
    const out = g.query(100, 0, 25, []);
    expect(out.map((o) => o.id).sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12]);
    g.clear();
    expect(g.query(100, 0, 25, [])).toEqual([]);
  });
});

describe('skill selector', () => {
  const ctx = (over: Partial<SelectorContext> = {}): SelectorContext => ({
    selfTypes: ['water'], selfHpFrac: 1, energy: 100, threatsNearSelf: 0, hasShield: false,
    target: { types: ['rock', 'ground'], dist: 50, radius: 14, hasStatus: () => false },
    enemiesAroundTarget: () => 1, lowestAlly: { hpFrac: 1, dist: 10 }, teamBuffActive: false, ...over,
  });
  const squirtle = ['tackle', 'water_gun', 'withdraw', 'bubble'].map((id) => ({ def: getSkill(id), cooldownLeft: 0 }));

  it('prefers super-effective skill over neutral', () => {
    const c = chooseSkill(squirtle, ctx());
    expect(squirtle[c!.slot].def.type).toBe('water');
    expect(c!.reason).toBe('super-effective');
  });
  it('respects range', () => {
    const c = chooseSkill(squirtle, ctx({ target: { types: ['normal'], dist: 230, radius: 14, hasStatus: () => false } }));
    expect(['water_gun', 'bubble']).toContain(squirtle[c!.slot].def.id);
    expect(chooseSkill(squirtle, ctx({ target: { types: ['normal'], dist: 900, radius: 14, hasStatus: () => false } }))).toBeNull();
  });
  it('respects cooldown and energy', () => {
    const cds = squirtle.map((s) => ({ ...s, cooldownLeft: s.def.id === 'tackle' ? 0 : 5 }));
    expect(cds[chooseSkill(cds, ctx())!.slot].def.id).toBe('tackle');
    const poor = chooseSkill(squirtle, ctx({ energy: 0, target: { types: ['normal'], dist: 200, radius: 14, hasStatus: () => false } }));
    expect(squirtle[poor!.slot].def.energyCost).toBe(0);
  });
  it('shields when in danger', () => {
    const c = chooseSkill(squirtle, ctx({ selfHpFrac: 0.2, threatsNearSelf: 4 }));
    expect(squirtle[c!.slot].def.id).toBe('withdraw');
  });
  it('heals hurt allies and prefers AoE into groups', () => {
    const bulba = ['vine_whip', 'razor_leaf', 'synthesis', 'leech_seed'].map((id) => ({ def: getSkill(id), cooldownLeft: 0 }));
    const c = chooseSkill(bulba, ctx({ selfTypes: ['grass', 'poison'], lowestAlly: { hpFrac: 0.2, dist: 50 } }));
    expect(bulba[c!.slot].def.id).toBe('synthesis');
    const char = ['ember', 'flame_burst', 'fire_spin', 'scratch'].map((id) => ({ def: getSkill(id), cooldownLeft: 0 }));
    const group = chooseSkill(char, ctx({ selfTypes: ['fire'], target: { types: ['normal'], dist: 200, radius: 14, hasStatus: () => false }, enemiesAroundTarget: () => 8 }));
    expect(['flame_burst', 'fire_spin']).toContain(char[group!.slot].def.id);
  });
  it('never picks a skill the target is immune to', () => {
    const elec = [{ def: getSkill('thunder_shock'), cooldownLeft: 0 }];
    expect(chooseSkill(elec, ctx({ selfTypes: ['electric'], target: { types: ['ground'], dist: 100, radius: 10, hasStatus: () => false } }))).toBeNull();
  });
});

describe('director', () => {
  it('ramps difficulty on several axes', () => {
    expect(curves.spawnRate(600)).toBeGreaterThan(curves.spawnRate(0) * 3);
    expect(curves.enemyLevel(600)).toBeGreaterThan(curves.enemyLevel(0));
    expect(curves.speedMult(600)).toBeGreaterThan(1);
    expect(curves.eliteChance(600)).toBeGreaterThan(curves.eliteChance(0));
  });
  it('spawns bosses at 5-minute marks exactly once', () => {
    const d = new EnemyDirector(new Rng(1));
    let bosses = 0;
    for (let t = 0; t < 905; t += 0.5) bosses += d.update(t, 0.5, 0, false).events.filter((e) => e.kind === 'boss').length;
    expect(bosses).toBe(3);
  });
  it('never sends Adventure-only world bosses into Survivor', () => {
    const d = new EnemyDirector(new Rng(5));
    const ids: string[] = [];
    for (let t = 0; t < 905; t += 0.5) for (const e of d.update(t, 0.5, 0, false).events) if (e.kind === 'boss') ids.push(e.bossId);
    expect(ids).toEqual(['onix', 'onix', 'onix']);
  });
  it('respects the enemy cap', () => {
    const d = new EnemyDirector(new Rng(2));
    const max = curves.maxEnemies(60, 260);
    const { spawns } = d.update(60, 30, max, false);
    expect(spawns.filter((s) => s.placement === 'edge').length).toBe(0);
  });
  it('only spawns unlocked enemies', () => {
    const d = new EnemyDirector(new Rng(3));
    for (let i = 0; i < 50; i++) expect(d.pickEnemy(10).id).toBe('rattata');
  });
});

describe('upgrades', () => {
  const view = (over: Partial<RunView> = {}): RunView => ({
    mods: emptyMods(),
    party: [{ uid: 1, defId: 'charmander', name: 'Charmander', skills: [{ id: 'ember', name: 'Ember', level: 1 }] }],
    recruitable: ['squirtle', 'bulbasaur'], ...over,
  });
  it('rolls 3 distinct offers', () => {
    for (let s = 0; s < 50; s++) {
      const offers = rollOffers(view(), new Rng(s));
      expect(offers.length).toBe(3);
      expect(new Set(offers.map((o) => o.key)).size).toBe(3);
    }
  });
  it('never exceeds caps', () => {
    const mods = emptyMods();
    mods.dmgMult = 0.78;
    for (let s = 0; s < 100; s++) {
      for (const o of rollOffers(view({ mods }), new Rng(s))) {
        if (o.kind === 'stat' && o.stat === 'dmgMult') expect(mods.dmgMult + o.value).toBeLessThanOrEqual(0.8 + 1e-9);
      }
    }
  });
  it('boss rewards are epic or better', () => {
    for (let s = 0; s < 30; s++) {
      for (const o of rollOffers(view({ recruitable: [] }), new Rng(s), 3, 'epic')) {
        if (o.kind !== 'heal') expect(['epic', 'legendary']).toContain(o.rarity);
      }
    }
  });
  it('falls back to heal when everything is capped', () => {
    const mods = { dmgMult: 0.8, cdr: 0.4, hpMult: 1, areaMult: 0.6, critBonus: 0.4, trainerSpeed: 0.4, magnet: 1.5, energyRegen: 0.8, extraProjectiles: 2 };
    const offers = rollOffers(view({ mods, recruitable: [], party: [] }), new Rng(9));
    expect(offers.every((o) => o.kind === 'heal')).toBe(true);
  });
});
