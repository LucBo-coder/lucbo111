import { describe, it, expect } from 'vitest';
import { ACTIVE_SKILL_GCD, ACTIVE_SKILL_WINDOW, STEP, World, type WorldEvent } from '../src/core/world';
import { makeWildState } from '../src/core/wildAI';

/** Adventure world with one party member and one hostile wild Pokémon at `dx` px. */
function setup(species = 'charmander', level = 20, foe = 'bulbasaur', dx = 120) {
  const w = new World({ mode: 'adventure', seed: 7, width: 4000, height: 4000 });
  const a = w.addPokemon(species, { level });
  const t = w.trainer;
  a.x = t.x + 20; a.y = t.y;
  const e = w.spawnWild(foe, level, t.x + dx, t.y, { wild: makeWildState(t.x + dx, t.y, 'aggressive', { homeR: 40, aggroR: 600, leash: 900 }), hostile: true });
  w.step(STEP); w.drainEvents(); // builds the spatial grid the target query reads
  for (const s of a.skills) s.cd = 0;
  a.castSlot = -1; a.dash = null;
  return { w, a, e, t };
}

function manualEvents(w: World): Extract<WorldEvent, { t: 'manual' }>[] {
  return w.drainEvents().filter((ev): ev is Extract<WorldEvent, { t: 'manual' }> => ev.t === 'manual');
}

describe('Active skills (player-triggered)', () => {
  it('casts the chosen slot on the nearest hostile target and starts its cooldown', () => {
    const { w, a, e } = setup();
    for (const s of a.skills) s.cd = 0;
    a.energy = a.maxEnergy;
    const idx = a.skills.findIndex((s) => s.def.power > 0 && s.def.range + e.radius >= Math.hypot(e.x - a.x, e.y - a.y));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(w.requestSkill(a, idx)).toBe('cast');
    expect(a.castSlot).toBe(idx);
    expect(a.skills[idx].cd).toBeGreaterThan(0);
    expect(manualEvents(w).some((m) => m.ok && m.skill === a.skills[idx].def.id)).toBe(true);
  });

  it('a global cooldown stops spamming, and it runs out with the simulation', () => {
    const { w, a } = setup();
    for (const s of a.skills) s.cd = 0;
    a.energy = a.maxEnergy;
    expect(w.requestSkill(a, 'best')).not.toBe('global');
    expect(w.requestSkill(a, 'best')).toBe('global');
    for (let i = 0; i < Math.ceil(ACTIVE_SKILL_GCD / STEP) + 1; i++) w.step(STEP);
    a.castSlot = -1; a.dash = null;
    for (const s of a.skills) s.cd = 0;
    a.energy = a.maxEnergy;
    expect(w.requestSkill(a, 'best')).not.toBe('global');
  });

  it('respects cooldown and energy like an AI cast', () => {
    const { w, a } = setup();
    a.skills[0].cd = 3;
    expect(w.requestSkill(a, 0)).toBe('cooldown');
    a.skills[0].cd = 0;
    const cost = a.skills.find((s) => s.def.energyCost > 0);
    if (cost) {
      const i = a.skills.indexOf(cost);
      a.energy = 0;
      expect(w.requestSkill(a, i)).toBe('energy');
    }
  });

  it('refuses a damaging skill on an immune target (Normal → Ghost)', () => {
    const { w, a } = setup('rattata', 20, 'gastly');
    for (const s of a.skills) s.cd = 0;
    a.energy = a.maxEnergy;
    const normal = a.skills.findIndex((s) => s.def.type === 'normal' && s.def.power > 0);
    expect(normal).toBeGreaterThanOrEqual(0);
    expect(w.requestSkill(a, normal)).toBe('immune');
  });

  it('with no opponent around, an attack has no target', () => {
    const w = new World({ mode: 'adventure', seed: 1, width: 4000, height: 4000 });
    const a = w.addPokemon('charmander', { level: 20 });
    for (const s of a.skills) s.cd = 0;
    const atk = a.skills.findIndex((s) => s.def.power > 0);
    expect(w.requestSkill(a, atk)).toBe('noTarget');
  });

  it('out of range: the request is queued, the Pokémon walks in and casts inside the window', () => {
    const { w, a, e, t } = setup('charmander', 20, 'bulbasaur', 340);
    e.wild!.mode = 'idle';
    for (const s of a.skills) s.cd = 0;
    a.energy = a.maxEnergy;
    const melee = a.skills.findIndex((s) => s.def.power > 0 && s.def.range < 120);
    const idx = melee >= 0 ? melee : a.skills.findIndex((s) => s.def.power > 0);
    expect(w.requestSkill(a, idx)).toBe('queued');
    let cast = false;
    for (let i = 0; i < Math.ceil(ACTIVE_SKILL_WINDOW / STEP) && !cast; i++) {
      t.hp = t.maxHp;
      w.step(STEP);
      cast = manualEvents(w).some((m) => m.ok);
    }
    expect(cast).toBe(true);
  });

  it('a queued request that cannot be fulfilled expires and frees the AI again', () => {
    const { w, a, e } = setup('charmander', 20, 'bulbasaur', 340);
    for (const s of a.skills) s.cd = 0;
    a.energy = a.maxEnergy;
    const idx = a.skills.findIndex((s) => s.def.power > 0);
    expect(w.requestSkill(a, idx)).toBe('queued');
    e.alive = false; // target gone
    w.step(STEP);
    expect(a.queuedSlot).toBe(-1);
    expect(manualEvents(w).some((m) => !m.ok)).toBe(true);
  });

  it('reserved slots are never used by the AI but stay available to the player', () => {
    const { w, a, t } = setup('charmander', 20, 'bulbasaur', 90);
    for (let i = 0; i < a.skills.length; i++) w.setReserved(a, i, i === 0);
    const reservedId = a.skills[0].def.id;
    const used = new Set<string>();
    for (let i = 0; i < 60 * 10; i++) {
      t.hp = t.maxHp;
      w.step(STEP);
      if (a.castSlot >= 0) used.add(a.skills[a.castSlot].def.id);
    }
    expect(used.has(reservedId)).toBe(false);
    a.skills[0].cd = 0;
    a.energy = a.maxEnergy;
    a.castSlot = -1; a.dash = null;
    w.home.manualCd = 0;
    expect(['cast', 'queued', 'noTarget']).toContain(w.requestSkill(a, 0));
  });

  it('fainted Pokémon cannot be ordered', () => {
    const { w, a } = setup();
    a.fainted = true;
    expect(w.requestSkill(a, 0)).toBe('fainted');
  });
});
