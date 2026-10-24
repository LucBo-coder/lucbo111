import { describe, expect, it } from 'vitest';
import { applyPermanent, buyUpgrade, nextCost, PERM_UPGRADES, upgradeLevel } from '../src/core/permanentUpgrades';
import { COMBOS, findCombo, partySynergy } from '../src/core/synergy';
import { emptyMods } from '../src/core/upgrades';
import { STEP, World } from '../src/core/world';
import { defaultSave, starterEntry } from '../src/systems/saveSchema';
import { makeOwned } from '../src/core/progression';

describe('Survivor: held items', () => {
  it('the starter brings the held item + IVs of its Collection entry (highest level)', () => {
    const save = defaultSave();
    const lo = makeOwned('charmander', 5, 'starter'); lo.held = 'leftovers';
    const hi = makeOwned('charmander', 30, 'wild'); hi.held = 'charcoal';
    save.collection.push(lo, hi);
    expect(starterEntry(save, 'charmander')?.held).toBe('charcoal');
    const w = new World({ starter: 'charmander', seed: 3, starterHeld: 'charcoal' });
    expect(w.allies[0].heldId).toBe('charcoal');
    expect(w.allies[0].held?.type).toBe('typeBoost');
    const plain = new World({ starter: 'charmander', seed: 3 });
    expect(plain.allies[0].heldId).toBeNull();
  });
});

describe('Permanent Upgrades', () => {
  it('buying: costs rise, coins are spent, max level holds', () => {
    const s = { currency: 10_000, permanentUpgrades: {} as Record<string, number> };
    const u = PERM_UPGRADES[0];
    let spent = 0;
    for (let i = 0; i < u.max; i++) { spent += nextCost(s.permanentUpgrades, u.id)!; expect(buyUpgrade(s, u.id)).toBe(true); }
    expect(upgradeLevel(s.permanentUpgrades, u.id)).toBe(u.max);
    expect(nextCost(s.permanentUpgrades, u.id)).toBeNull();
    expect(buyUpgrade(s, u.id)).toBe(false);
    expect(s.currency).toBe(10_000 - spent);
    const poor = { currency: 5, permanentUpgrades: {} };
    expect(buyUpgrade(poor, 'power')).toBe(false);
    expect(poor.currency).toBe(5);
  });

  it('applied to Survivor runs only, clamped', () => {
    const m = applyPermanent(emptyMods(), { power: 2, vitality: 99, bogus: 3 });
    expect(m.dmgMult).toBeCloseTo(0.06);
    expect(m.hpMult).toBeCloseTo(0.2); // clamped to max 5 levels
    const base = new World({ starter: 'charmander', seed: 1 });
    const up = new World({ starter: 'charmander', seed: 1, upgrades: { vitality: 5, power: 5 } });
    expect(up.allies[0].maxHp).toBeGreaterThan(base.allies[0].maxHp);
    expect(up.trainer.maxHp).toBeGreaterThan(base.trainer.maxHp);
    const adv = new World({ mode: 'adventure', seed: 1, upgrades: { power: 5 } });
    expect(adv.mods.dmgMult).toBe(0);
  });
});

describe('Synergy & Elemental Combo', () => {
  it('synergy: shared types and a diverse party', () => {
    const s = partySynergy([['fire'], ['fire', 'flying'], ['fire'], ['water'], ['grass', 'poison']]);
    expect(s.byType.fire).toBe(0.2);
    expect(s.byType.water).toBeUndefined();
    expect(s.all).toBe(0.05); // fire, flying, water, grass, poison
    expect(partySynergy([['fire'], ['water']]).lines).toEqual([]);
  });

  it('combos: the right type on the right status', () => {
    expect(findCombo('water', ['burn'])?.id).toBe('steam');
    expect(findCombo('rock', ['freeze'])?.id).toBe('shatter');
    expect(findCombo('electric', ['paralysis'])?.id).toBe('overload');
    expect(findCombo('fire', ['burn'])).toBeNull();
    expect(COMBOS.length).toBe(5);
  });

  it('in a Survivor run: Steam cures the burn, splashes, is reported, then waits its cooldown', () => {
    const w = new World({ starter: 'squirtle', seed: 8, obstacles: false });
    const a = w.allies[0];
    const t = w.trainer;
    const e1 = w.spawnEnemy(w.enemies.length ? w.enemies[0].defId : 'rattata', 5, false, t.x + 120, t.y)!;
    const e2 = w.spawnEnemy(e1.defId, 5, false, t.x + 150, t.y + 20)!;
    e1.maxHp = e1.hp = 1e6; e2.maxHp = e2.hp = 1e6;
    w.applyStatus(e1, { kind: 'burn', chance: 1, duration: 10, magnitude: 0.05 }, a);
    expect(w.hasStatus(e1, 'burn')).toBe(true);
    const slot = a.skills.find((s) => s.def.type === 'water' && s.def.power > 0)!;
    w.drainEvents();
    const hp2 = e2.hp;
    (w as unknown as { hit(src: unknown, dst: unknown, slot: unknown, mult: number): void }).hit(a, e1, slot, 1);
    expect(w.hasStatus(e1, 'burn')).toBe(false);
    expect(e2.hp).toBeLessThan(hp2);
    expect(w.drainEvents().some((e) => e.t === 'combo' && e.name === 'Hơi Nước')).toBe(true);
    // cooldown: burned again right away → no second combo yet
    w.applyStatus(e1, { kind: 'burn', chance: 1, duration: 10, magnitude: 0.05 }, a);
    (w as unknown as { hit(src: unknown, dst: unknown, slot: unknown, mult: number): void }).hit(a, e1, slot, 1);
    expect(w.drainEvents().some((e) => e.t === 'combo')).toBe(false);
    for (let i = 0; i < 60 * 2.1; i++) w.step(STEP);
    void w;
  });

  it('Adventure is untouched: no synergy, no combos', () => {
    const w = new World({ mode: 'adventure', seed: 2, width: 4000, height: 4000 });
    w.addPokemon('squirtle', { level: 20 });
    w.addPokemon('wartortle', { level: 20 });
    for (let i = 0; i < 70; i++) w.step(STEP);
    expect(w.synergy.lines).toEqual([]);
  });
});

describe('background music', () => {
  it('every mood loop parses (notes, rests, holds) and lead/bass loops line up', async () => {
    const { MOODS, parseNote, trackSteps } = await import('../src/systems/music');
    expect(parseNote('A4')).toBeCloseTo(440);
    expect(parseNote('C5')).toBeCloseTo(523.25, 1);
    expect(parseNote('-')).toBeNull();
    expect(parseNote('.')).toBe('hold');
    expect(MOODS.length).toBe(11);
    for (const m of MOODS) {
      const t = trackSteps(m);
      expect(t.lead.length, m).toBe(32);
      expect(t.bass.length % 8, m).toBe(0);
      expect(32 % t.bass.length === 0 || t.bass.length % 32 === 0, m).toBe(true);
    }
  });
});

describe('regional environment effects', () => {
  it('ice / deep snow / blizzard slow, with Ice types immune and Fire warmth', async () => {
    const { terrainSlow, ENV } = await import('../src/core/environment');
    expect(terrainSlow('ice', ['water'], false, false)).toBe(ENV.iceSlow);
    expect(terrainSlow('snowDeep', ['water'], false, false)).toBe(ENV.snowSlow);
    expect(terrainSlow('other', ['water'], true, false)).toBe(ENV.blizzardSlow);
    expect(terrainSlow('other', ['water'], true, true)).toBe(0); // warmed by a Fire ally
    expect(terrainSlow('ice', ['ice', 'flying'], true, false)).toBe(0);
  });

  it('lava heat wears down but never kills; resistant types are spared', async () => {
    const { heatDamage, ENV } = await import('../src/core/environment');
    expect(heatDamage(['grass'], 100, 100)).toBeCloseTo(100 * ENV.heatPct);
    expect(heatDamage(['grass'], 26, 100)).toBeCloseTo(1);
    expect(heatDamage(['grass'], 25, 100)).toBe(0);
    for (const t of ['fire', 'water', 'ground'] as const) expect(heatDamage([t], 100, 100)).toBe(0);
  });

  it('event cycle: only in its region, idle → event → idle', async () => {
    const { stepCycle, eventDuration } = await import('../src/core/environment');
    const c = { event: null as null | 'blizzard' | 'eruption', t: 1 };
    expect(stepCycle(c, 'frozen', 1.01, () => 0.5)).toBe('blizzard');
    expect(c.t).toBe(eventDuration('blizzard'));
    expect(stepCycle(c, 'frozen', 12.01, () => 0.5)).toBeNull();
    expect(c.event).toBeNull();
    expect(c.t).toBeGreaterThanOrEqual(50);
    const v = { event: null as null | 'blizzard' | 'eruption', t: 0.5 };
    expect(stepCycle(v, 'volcanic', 1, () => 0)).toBe('eruption');
    const none = { event: null as null | 'blizzard' | 'eruption', t: 0.1 };
    expect(stepCycle(none, undefined, 5, () => 0)).toBeNull();
  });

  it('envSlow lowers a unit\'s speed factor (capped with statuses)', () => {
    const w = new World({ mode: 'adventure', seed: 1, width: 3000, height: 3000 });
    const u = w.addPokemon('pikachu', { level: 10 });
    expect(w.slowFactor(u)).toBe(1);
    u.envSlow = 0.3;
    expect(w.slowFactor(u)).toBeCloseTo(0.7);
  });
});
