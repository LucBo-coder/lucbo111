import { describe, expect, it } from 'vitest';
import { SKILLS } from '../src/core/data';
import { ADVENTURE_COMBO_COOLDOWN, COMBO_COOLDOWN } from '../src/core/synergy';
import { STEP, World, type Unit } from '../src/core/world';
import type { SkillDef } from '../src/core/types';

// V22 combat in Adventure / Vietnam Odyssey (never PvP, Survivor unchanged): elemental combos with a longer
// per-target cooldown, a hurt non-tank Pokémon falls back beside the trainer, front-liners guard a hurt trainer,
// and a calm Pokémon can walk to an errand spot.

const waterSkill = [...SKILLS.values()].find((s) => s.type === 'water' && s.power >= 40 && (s.kind === 'projectile' || s.kind === 'melee') && !s.status && (s.accuracy ?? 1) >= 1)! as SkillDef;
const world = (mode: 'adventure' | 'survivor', pvp = false) => new World({ mode, seed: 3, width: 4000, height: 4000, ...(pvp ? { pvp: {} } : {}) });
const hit = (w: World, src: Unit, dst: Unit) => (w as unknown as { hit(a: Unit, b: Unit, s: unknown, m: number): void }).hit(src, dst, { ...src.skills[0], def: waterSkill, cd: 0 }, 1);
const combos = (w: World) => w.drainEvents().filter((e) => e.t === 'combo').length;

function setup(w: World) {
  w.teleport(2000, 2000);
  const a = w.addPokemon('pidgey', { level: 30 });
  w.setCommand('follow');
  const e = w.spawnWild('rattata', 30, 2100, 2000, { hostile: true });
  e.maxHp = e.hp = 1e9; e.contactPower = 0; e.skills.length = 0;
  w.drainEvents();
  return { a, e };
}

describe('V22 combat: elemental combos', () => {
  it('Adventure: water on a burned target makes Steam, then waits the longer cooldown', () => {
    const w = world('adventure');
    const { a, e } = setup(w);
    w.applyStatus(e, { kind: 'burn', chance: 1, duration: 30, magnitude: 0 }, null);
    hit(w, a, e);
    expect(combos(w)).toBe(1);
    // within the adventure cooldown: no second combo (even past the survivor one)
    const wait = (sec: number) => { e.statuses.length = 0; for (let i = 0; i < sec / STEP; i++) { w.step(STEP); } e.hp = e.maxHp; }; // a fresh burn each time
    wait(COMBO_COOLDOWN + 0.5);
    w.applyStatus(e, { kind: 'burn', chance: 1, duration: 30, magnitude: 0 }, null);
    w.drainEvents();
    hit(w, a, e);
    expect(combos(w)).toBe(0);
    wait(ADVENTURE_COMBO_COOLDOWN);
    w.applyStatus(e, { kind: 'burn', chance: 1, duration: 30, magnitude: 0 }, null);
    w.drainEvents();
    hit(w, a, e);
    expect(combos(w)).toBe(1);
  });

  it('PvP has no combos', () => {
    const w = world('adventure', true);
    expect(w.adventureCombat).toBe(false);
    expect(world('adventure').adventureCombat).toBe(true);
    expect(world('survivor').adventureCombat).toBe(false);
  });
});

describe('V22 combat: situational AI', () => {
  it('a hurt non-tank ally is "wounded" only in Adventure', () => {
    for (const mode of ['adventure', 'survivor'] as const) {
      const w = world(mode);
      const { a } = setup(w);
      a.hp = a.maxHp * 0.2;
      expect(w.wounded(a), mode).toBe(mode === 'adventure' && a.role !== 'tank');
      a.hp = a.maxHp;
      expect(w.wounded(a)).toBe(false);
    }
  });

  it('a wounded ally fights from closer to the trainer than a healthy one', () => {
    const dist = (low: boolean) => {
      const w = world('adventure');
      w.teleport(2000, 2000);
      const a = w.addPokemon('charmander', { level: 30 });
      const e = w.spawnWild('geodude', 30, 2250, 2000, { hostile: true, hpMult: 200 });
      e.contactPower = 0; e.skills.length = 0;
      if (low) a.hp = a.maxHp * 0.2;
      let sum = 0;
      for (let i = 0; i < 4 / STEP; i++) { w.step(STEP); if (low) a.hp = Math.min(a.hp, a.maxHp * 0.2); if (i > 1 / STEP) sum += Math.hypot(a.x - w.trainer.x, a.y - w.trainer.y); }
      return sum;
    };
    expect(dist(true)).toBeLessThan(dist(false) * 0.85);
  });

  it('a calm ally walks to its errand spot', () => {
    const w = world('adventure');
    w.teleport(2000, 2000);
    const a = w.addPokemon('bulbasaur', { level: 20 });
    for (let i = 0; i < 1 / STEP; i++) w.step(STEP);
    a.errand = { x: 2180, y: 2100 };
    for (let i = 0; i < 4 / STEP; i++) w.step(STEP);
    expect(Math.hypot(a.x - 2180, a.y - 2100)).toBeLessThan(40);
    a.errand = null;
    for (let i = 0; i < 4 / STEP; i++) w.step(STEP);
    expect(Math.hypot(a.x - w.trainer.x, a.y - w.trainer.y)).toBeLessThan(110);
  });
});
