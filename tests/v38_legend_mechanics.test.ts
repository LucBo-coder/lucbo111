import { describe, expect, it } from 'vitest';
import { beatBossTo } from './bossHelpers';
import { BOSSES } from '../src/core/data';
import { STEP, World } from '../src/core/world';
import { LEGEND_MECHS, MECH_INFO, type MechId } from '../src/core/bosses/legendMechanics';
import legendJson from '../src/data/dex/legend-bosses.json';

const LEGEND_IDS = [
  ...(legendJson as unknown as { id: string }[]).map((b) => b.id).filter((id) => id !== 'rayquaza'),
  'articuno', 'zapdos', 'moltres', 'mewtwo', 'mew',
];

function arena(id: string, level = 50) {
  const w = new World({ mode: 'adventure', seed: 7, width: 6000, height: 6000 });
  w.addPokemon('caterpie', { level: 5 });
  const t = w.trainer;
  const b = w.spawnBoss(id, level, false, { x: t.x + 260, y: t.y });
  t.maxHp = 1e9; t.hp = 1e9;
  return { w, b };
}

/** Steps until the boss casts the named mechanic (trainer kept alive). */
function runUntilCast(w: World, b: ReturnType<typeof arena>['b'], name: string, secs: number): boolean {
  for (let i = 0; i < 60 * secs; i++) {
    w.trainer.hp = w.trainer.maxHp;
    w.step(STEP);
    if (b.boss!.cast?.name === name && b.boss!.mech) return true;
  }
  return false;
}

describe('V38 signature mechanics of the legendaries', () => {
  it('every legendary (but Rayquaza, with its own script) has 2–3 distinct mechanics, no two the same set', () => {
    expect(Object.keys(LEGEND_MECHS).sort()).toEqual([...LEGEND_IDS].sort());
    const seen = new Map<string, string>();
    for (const id of LEGEND_IDS) {
      const ms = LEGEND_MECHS[id].map((m) => m.id);
      expect(BOSSES.get(id)?.ai, id).toBe('legendary');
      expect(ms.length, id).toBeGreaterThanOrEqual(2);
      expect(ms.length, id).toBeLessThanOrEqual(3);
      expect(new Set(ms).size, id).toBe(ms.length);
      const key = [...ms].sort().join('+');
      expect(seen.get(key), `${id} has the same mechanics as ${seen.get(key)}`).toBeUndefined();
      seen.set(key, id);
    }
    expect(LEGEND_MECHS.rayquaza).toBeUndefined();
  });

  it('every mechanic is used by some legendary, and each one fires in a real fight', () => {
    const ids = Object.keys(MECH_INFO) as MechId[];
    for (const mech of ids) {
      // the legendary that has it earliest (lowest phase)
      let best: { id: string; i: number } | null = null;
      for (const id of LEGEND_IDS) {
        const i = LEGEND_MECHS[id].findIndex((m) => m.id === mech);
        if (i >= 0 && (!best || i < best.i)) best = { id, i };
      }
      expect(best, mech).toBeTruthy();
      const { w, b } = arena(best!.id);
      if (best!.i >= 1) beatBossTo(w, b, best!.i === 1 ? 0.45 : 0.2);
      expect(b.boss!.phase, mech).toBeGreaterThanOrEqual(best!.i + 1);
      expect(runUntilCast(w, b, MECH_INFO[mech].name, 60), `${best!.id} ${mech}`).toBe(true);
      // and the fight goes on without errors for a while after
      for (let i = 0; i < 60 * 6; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); }
      expect(b.alive, mech).toBe(true);
    }
  });

  it('a later mechanic only joins in its phase', () => {
    // Raikou: Lao tới from phase 1, Lưới sét from phase 2
    const { w, b } = arena('raikou');
    expect(runUntilCast(w, b, MECH_INFO.grid.name, 40)).toBe(false);
    beatBossTo(w, b, 0.45);
    expect(runUntilCast(w, b, MECH_INFO.grid.name, 60)).toBe(true);
  });

  it('crystal shield: no damage lands while a crystal stands, the shield breaks with the last one', () => {
    const { w, b } = arena('diancie');
    expect(runUntilCast(w, b, MECH_INFO.crystals.name, 40)).toBe(true);
    const m = b.boss!.mech!;
    expect(m.shieldOn).toBe(true);
    expect(m.crystals.length).toBeGreaterThan(0);
    const hp = b.hp;
    w.applyDamage(b, 500, w.trainer);
    expect(b.hp).toBe(hp);
    for (const c of m.crystals) w.applyDamage(c, c.hp + 10, w.trainer);
    w.step(STEP);
    expect(m.shieldOn).toBe(false);
    w.applyDamage(b, 500, w.trainer);
    expect(b.hp).toBeLessThan(hp);
  });

  it('counter stance sends half of a hit back; enrage raises its damage and a burst breaks it', () => {
    const s = arena('zamazenta');
    expect(runUntilCast(s.w, s.b, MECH_INFO.stance.name, 40)).toBe(true);
    const a = s.w.trainer;
    a.hp = 1e6;
    const bhp = s.b.hp;
    s.w.applyDamage(s.b, 200, a);
    expect(bhp - s.b.hp).toBeCloseTo(100, 0);
    expect(a.hp).toBeLessThan(1e6);

    const e = arena('regigigas');
    expect(runUntilCast(e.w, e.b, MECH_INFO.enrage.name, 40)).toBe(true);
    const m = e.b.boss!.mech!;
    expect(m.stacks).toBeGreaterThan(0);
    e.w.applyDamage(e.b, e.b.maxHp * 0.09, e.w.trainer);
    expect(m.stacks).toBe(0);
  });

  it('heal never lifts the boss back above its phase threshold; copies and minions leave with the boss', () => {
    const { w, b } = arena('cresselia');
    beatBossTo(w, b, 0.45);
    expect(b.boss!.phase).toBe(2);
    expect(runUntilCast(w, b, MECH_INFO.heal.name, 60)).toBe(true);
    for (let i = 0; i < 60 * 4; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); }
    expect(b.hp).toBeLessThanOrEqual(b.maxHp * b.boss!.def.phase2Threshold + 1);

    const c = arena('mew');
    expect(runUntilCast(c.w, c.b, MECH_INFO.clones.name, 40)).toBe(true);
    const adds = c.b.boss!.mech!.adds.filter((u) => u.alive);
    expect(adds.length).toBeGreaterThan(0);
    expect(adds.every((u) => u.tag === 'boss-clone' && u.noCapture)).toBe(true);
    c.w.removeEnemy(c.b);
    expect(adds.every((u) => !u.alive)).toBe(true);
  });

  it('vanish: the boss cannot be hit while hidden', () => {
    const { w, b } = arena('lunala');
    expect(runUntilCast(w, b, MECH_INFO.vanish.name, 40)).toBe(true);
    expect(b.boss!.mech!.hidden).toBeTruthy();
    const hp = b.hp;
    w.applyDamage(b, 500, w.trainer);
    expect(b.hp).toBe(hp);
  });
});
