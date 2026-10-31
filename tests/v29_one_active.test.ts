import { describe, expect, it } from 'vitest';
import { BOSSES } from '../src/core/data';
import { expShares, FIELD, restoredCooldown, switchCooldown, switchTimes } from '../src/core/fieldRules';
import { FIELD_MAX } from '../src/core/trainerAI';
import { STEP, World } from '../src/core/world';
import { migrate, SAVE_VERSION } from '../src/systems/saveSchema';

// V29: one Pokémon per trainer outside its ball (Adventure, Vietnam Odyssey and their co-op).

const adv = () => new World({ mode: 'adventure', seed: 11, width: 4000, height: 4000 });

describe('field rules (data/field-rules.json)', () => {
  it('one active Pokémon per trainer, the same for NPC trainers', () => {
    expect(FIELD.maxActivePerTrainer).toBe(1);
    expect(FIELD_MAX).toBe(1);
    expect(FIELD.partyMax).toBe(6);
  });

  it('switching: quick when calm, ~0.6 s with a 6 s cooldown in combat', () => {
    expect(switchCooldown(false)).toBeLessThan(1.5);
    expect(switchCooldown(true)).toBe(6);
    const c = switchTimes(true);
    expect(c.recall + c.summon).toBeCloseTo(0.6, 2);
    const k = switchTimes(false);
    expect(k.recall + k.summon).toBeGreaterThan(c.recall + c.summon);
  });

  it('EXP: the Pokémon that fought gets it all, healthy reserves a share, fainted ones nothing', () => {
    const m = expShares([{ uid: 'a', fainted: false }, { uid: 'b', fainted: false }, { uid: 'c', fainted: true }], ['a'], 100);
    expect(m.get('a')).toBe(100);
    expect(m.get('b')).toBe(Math.floor(100 * FIELD.reserveExpShare));
    expect(m.has('c')).toBe(false);
  });

  it('cooldowns keep running in the ball, never below zero', () => {
    const snap = { cds: { ember: 5 }, energy: 30, at: 10 };
    expect(restoredCooldown(snap, 'ember', 12)).toBeCloseTo(3);
    expect(restoredCooldown(snap, 'ember', 30)).toBe(0);
    expect(restoredCooldown(snap, 'tackle', 12)).toBe(0);
    expect(restoredCooldown(undefined, 'ember', 12)).toBe(0);
  });
});

describe('World: one active per trainer', () => {
  it('adding a party member recalls the one outside first — never two on the field, whoever calls', () => {
    const w = adv();
    w.addPokemon('charmander', { uid: 'a', level: 10 });
    w.addPokemon('squirtle', { uid: 'b', level: 10 });
    w.addPokemon('bulbasaur', { uid: 'c', level: 10 });
    expect(w.allies.length).toBe(1);
    expect(w.allies[0].ownerUid).toBe('c');
    expect(w.fieldViolations()).toEqual([]);
    // rapid repeated summons (mashing a key) still leave exactly one
    for (let i = 0; i < 20; i++) w.addPokemon(i % 2 ? 'charmander' : 'squirtle', { uid: i % 2 ? 'a' : 'b', level: 10 });
    expect(w.allies.length).toBe(1);
  });

  it('the co-op guest also fields one Pokémon; the host invariant check covers both trainers', () => {
    const w = adv();
    w.addCompanion();
    w.addPokemon('charmander', { uid: 'h1', level: 10 });
    w.addPokemon('pikachu', { uid: 'g1', level: 10, companion: true });
    w.addPokemon('eevee', { uid: 'g2', level: 10, companion: true, bench: true });
    w.addPokemon('squirtle', { uid: 'g3', level: 10, companion: true });
    expect(w.home.allies.length).toBe(1);
    expect(w.companion!.allies.length).toBe(1);
    expect(w.companion!.bench.map((u) => u.ownerUid)).toContain('g2');
    expect(w.fieldViolations()).toEqual([]);
  });

  it('recalling keeps skill cooldowns (they tick in the ball) and energy: no free reset', () => {
    const w = adv();
    const u = w.addPokemon('charmander', { uid: 'a', level: 20 });
    u.skills[0].cd = 8;
    u.energy = 3;
    w.removePokemon(u);
    for (let i = 0; i < 60 * 3; i++) w.step(STEP);
    const back = w.addPokemon('charmander', { uid: 'a', level: 20 });
    expect(back.skills[0].cd).toBeGreaterThan(4);
    expect(back.skills[0].cd).toBeLessThan(5.5);
    expect(back.energy).toBeLessThanOrEqual(3 + 0.001);
  });

  it('an enemy targeting the recalled Pokémon loses it; its lingering zones end', () => {
    const w = adv();
    const u = w.addPokemon('charmander', { uid: 'a', level: 20 });
    const e = w.spawnWild('rattata', 10, u.x + 60, u.y, { hostile: true });
    e.target = u;
    w.removePokemon(u);
    expect(e.target).toBeNull();
  });

  it('bench switch: cooldown in combat, a fainted Pokémon is replaced at once', () => {
    const w = adv();
    w.addCompanion();
    const side = w.companion!;
    w.addPokemon('pikachu', { uid: 'g1', level: 20, companion: true });
    const b2 = w.addPokemon('eevee', { uid: 'g2', level: 20, companion: true, bench: true });
    const b3 = w.addPokemon('squirtle', { uid: 'g3', level: 20, companion: true, bench: true });
    expect(w.benchSwitch(side, b2, true)).toBe('ok');
    expect(side.allies[0]).toBe(b2);
    expect(side.switchCd).toBe(FIELD.combatCooldown);
    expect(w.benchSwitch(side, b3, true)).toBe('cooldown');
    // the active one faints: the next may come out at once
    b2.fainted = true; b2.hp = 0;
    expect(w.benchSwitch(side, b3, true)).toBe('ok');
    expect(side.allies.length).toBe(1);
    expect(w.fieldViolations()).toEqual([]);
  });

  it('nobody picks after a faint: the reserve with the best match-up comes out by itself', () => {
    const w = adv();
    w.addCompanion();
    const side = w.companion!;
    const out = w.addPokemon('bulbasaur', { uid: 'g1', level: 30, companion: true });
    w.addPokemon('pikachu', { uid: 'g2', level: 30, companion: true, bench: true });
    w.addPokemon('squirtle', { uid: 'g3', level: 30, companion: true, bench: true });
    w.spawnBoss('torkoal', 30, false, { x: side.trainer.x + 400, y: side.trainer.y });
    w.step(STEP);
    w.applyDamage(out, out.maxHp * 10, null);
    expect(out.fainted).toBe(true);
    for (let i = 0; i < (FIELD.faintAutoSendAfter + 0.5) / STEP; i++) { w.trainer.hp = w.trainer.maxHp; side.trainer.hp = side.trainer.maxHp; w.step(STEP); }
    expect(side.allies.length).toBe(1);
    expect(side.allies[0].ownerUid).toBe('g3'); // water against the fire boss
  });

  it('Adventure Pokémon do not revive by themselves on the field (no free immortality)', () => {
    const w = adv();
    const u = w.addPokemon('charmander', { uid: 'a', level: 10 });
    w.applyDamage(u, u.maxHp * 10, null);
    expect(u.fainted).toBe(true);
    for (let i = 0; i < 60 * 30; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); }
    expect(u.fainted).toBe(true);
  });

  it('throwing a ball: the Pokémon on the field stops attacking the target', () => {
    const w = adv();
    const a = w.addPokemon('charmander', { uid: 'a', level: 30 });
    w.trainer.maxHp = w.trainer.hp = 1e9;
    const e = w.spawnWild('snorlax', 40, a.x + 80, a.y, { hostile: true });
    for (let i = 0; i < 30; i++) w.step(STEP);
    expect(e.alive).toBe(true);
    w.spare(e, 2);
    expect(a.target).not.toBe(e);
    for (let i = 0; i < 60; i++) { w.step(STEP); expect(a.target).not.toBe(e); }
    expect(w.spared(e)).toBe(true);
    for (let i = 0; i < 90; i++) w.step(STEP);
    expect(e.alive).toBe(true);
    expect(w.spared(e)).toBe(false);
  });

  it('boss: phase-2 adds are capped per trainer; damage-over-time and control are reduced, never removed', () => {
    const w = adv();
    w.addPokemon('charmander', { uid: 'a', level: 30 });
    const t = w.trainer; t.maxHp = t.hp = 1e9;
    const b = w.spawnBoss('mega-venusaur', 24, false, { x: t.x + 300, y: t.y });
    expect(BOSSES.get('mega-venusaur')!.phase2Summon.count).toBeGreaterThan(FIELD.bossAddsPerTrainer);
    w.applyDamage(b, Math.ceil(b.hp - b.maxHp * 0.49), null);
    w.step(STEP);
    expect(w.enemies.filter((e) => e.tag === 'boss-add').length).toBe(FIELD.bossAddsPerTrainer);
    expect(FIELD.bossDotResist).toBeGreaterThan(0);
    expect(FIELD.bossControlScale).toBeGreaterThan(0);
    expect(FIELD.bossControlImmunity).toBeGreaterThan(0);
  });
});

describe('save migration v9: single active, fainted active hands over', () => {
  it('a v8 save with several Pokémon "out" and a fainted active loads with exactly one, healthy, active', () => {
    const raw = {
      version: 8,
      collection: [
        { uid: 'a', species: 'charmander', level: 10, hpFrac: 0 },
        { uid: 'b', species: 'squirtle', level: 10, hpFrac: 0.5 },
        { uid: 'c', species: 'bulbasaur', level: 10 },
      ],
      adventure: { party: ['a', 'b', 'c', 'b'], activeUid: 'a', recalled: [] },
    };
    const s = migrate(raw);
    expect(s.version).toBe(SAVE_VERSION);
    const a = s.adventure!;
    expect(a.party).toEqual(['a', 'b', 'c']);
    expect(a.activeUid).toBe('b');
    expect(a.recalled.sort()).toEqual(['a', 'c']);
  });

  it('loading never leaves a party member both active and "out": recalled = party − active', () => {
    const s = migrate({ version: SAVE_VERSION, collection: [{ uid: 'a', species: 'pikachu', level: 5 }, { uid: 'b', species: 'eevee', level: 5 }], adventure: { party: ['a', 'b'], activeUid: 'a', recalled: [] } });
    expect(s.adventure!.recalled).toEqual(['b']);
  });
});
