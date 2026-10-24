import { describe, expect, it } from 'vitest';
import { beatBossTo } from './bossHelpers';
import { BossPhaseManager, BossPhaseConfig, PENDING_MAX, phaseConfigFor, RAYQUAZA_PHASES } from '../src/core/bossPhases';
import { RAY_PHASE_SKILLS, RAY_T, rayAirborne } from '../src/core/bosses/rayquaza';
import { BOSSES, POKEMON } from '../src/core/data';
import { megaFormsOf } from '../src/core/evolution';
import { STEP, World } from '../src/core/world';

const CFG: BossPhaseConfig = {
  maxInvuln: 4,
  phases: [
    { id: 'a', name: 'A', at: 1, kind: 'normal', cinematic: 0, banner: '' },
    { id: 'b', name: 'B', at: 0.7, kind: 'mega', form: 'x-mega', cinematic: 1, banner: 'B!' },
    { id: 'c', name: 'C', at: 0.3, kind: 'enrage', cinematic: 1, banner: 'C!' },
  ],
};
const tick = (m: BossPhaseManager, secs: number, busy = false) => { for (let t = 0; t < secs; t += 0.05) m.update(0.05, busy); };

describe('BossPhaseManager', () => {
  it('one huge hit never skips a phase: HP stops at the threshold, every phase triggers once', () => {
    const m = new BossPhaseManager(CFG);
    let hp = m.damage(1000, 1000, 5000);
    expect(hp).toBe(700);
    expect(m.index).toBe(1);
    expect(m.state).toBe('TRANSITION_PENDING');
    expect(m.drain()).toEqual([{ t: 'transition', from: 0, to: 1 }]);
    // invulnerable while transitioning
    expect(m.damage(hp, 1000, 500)).toBe(700);
    tick(m, 5);
    expect(m.state).toBe('ACTIVE');
    const evs = m.drain().map((e) => e.t);
    expect(evs).toEqual(['cinematic', 'formChange', 'ready', 'active']);
    hp = m.damage(hp, 1000, 5000);
    expect(hp).toBe(300);
    expect(m.index).toBe(2);
    tick(m, 5);
    expect(m.drain().map((e) => e.t)).toEqual(['transition', 'cinematic', 'ready', 'active']); // no form → no FORM_CHANGE
    // last phase, no capture → dies; nothing re-triggers
    hp = m.damage(hp, 1000, 5000);
    expect(hp).toBe(0);
    expect(m.state).toBe('DEFEATED');
    expect(m.drain()).toEqual([{ t: 'defeated' }]);
  });

  it('the cinematic waits for the current action, but at most PENDING_MAX; invulnerability is capped', () => {
    const m = new BossPhaseManager({ ...CFG, maxInvuln: 1.5 });
    m.damage(1000, 1000, 400);
    tick(m, PENDING_MAX * 0.5, true);
    expect(m.state).toBe('TRANSITION_PENDING');
    tick(m, PENDING_MAX, true);
    expect(m.state).toBe('TRANSITION_CINEMATIC');
    tick(m, 2);
    expect(m.state).toBe('ACTIVE'); // forced out by maxInvuln although cinematic + form change + ready > 1.5 s
    expect(m.invulnerable).toBe(false);
  });

  it('weakened: the last phase floors HP for the capture window and reports when it expires', () => {
    const m = new BossPhaseManager({ ...CFG, weakened: { hpFrac: 0.05, duration: 3 } });
    let hp = m.damage(1000, 1000, 400); tick(m, 5);
    hp = m.damage(hp, 1000, 600); tick(m, 5);
    m.drain();
    hp = m.damage(hp, 1000, 9999);
    expect(hp).toBe(50);
    expect(m.state).toBe('WEAKENED');
    expect(m.damage(hp, 1000, 9999)).toBe(50);
    tick(m, 4);
    expect(m.drain().map((e) => e.t)).toEqual(['weakened', 'weakenedExpired']);
    m.finish();
    expect(m.state).toBe('DEFEATED');
  });

  it('safe checkpoint: a snapshot taken mid-cinematic resumes ACTIVE in that phase without replaying it', () => {
    const m = new BossPhaseManager(CFG);
    m.damage(1000, 1000, 400);
    tick(m, 0.3);
    expect(m.invulnerable).toBe(true);
    const snap = m.snapshot();
    const r = BossPhaseManager.restore(CFG, JSON.parse(JSON.stringify(snap)));
    expect(r.state).toBe('ACTIVE');
    expect(r.index).toBe(1);
    expect(r.hasTriggered(1)).toBe(true);
    expect(r.damage(700, 1000, 100)).toBe(600); // no second transition into phase B
    expect(r.drain()).toEqual([]);
    expect(BossPhaseManager.restore(CFG, { index: 9, state: 'TRANSITION_CINEMATIC', triggered: [0, 7] }).index).toBe(2);
  });

  it('configs: Rayquaza is the only boss with a form change, and the form is real & boss-only', () => {
    const ray = phaseConfigFor(BOSSES.get('rayquaza')!, { capture: true });
    expect(ray.phases.map((p) => [p.kind, p.at])).toEqual([['normal', 1], ['mega', 0.7], ['enrage', 0.3]]);
    expect(ray.weakened).toBeTruthy();
    const form = RAYQUAZA_PHASES.phases[1].form!;
    expect(POKEMON.get(form)?.mega).toMatchObject({ base: 'rayquaza', bossOnly: true });
    expect(POKEMON.get(form)?.baseStats.atk).toBe(180); // PokéAPI #10079
    expect(megaFormsOf('rayquaza')).toEqual([]); // the player can never Mega-evolve a Rayquaza
    for (const d of BOSSES.values()) {
      if (d.id === 'rayquaza') continue;
      expect(phaseConfigFor(d).phases.every((p) => !p.form), d.id).toBe(true);
    }
  });
});

function rayArena(seed = 5) {
  const w = new World({ mode: 'adventure', seed, width: 6000, height: 6000 });
  w.addPokemon('caterpie', { level: 5 });
  const t = w.trainer;
  t.maxHp = t.hp = 1e9;
  const b = w.spawnBoss('rayquaza', 55, false, { x: t.x + 300, y: t.y });
  return { w, b, t };
}
function run(w: World, secs: number, each?: () => boolean | void) {
  for (let i = 0; i < 60 * secs; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); if (each?.()) return true; }
  return false;
}

describe('Rayquaza boss', () => {
  it('phase 1 uses only its Normal skills, each with a cast warning and a telegraph', () => {
    const { w, b } = rayArena();
    const used = new Set<string>();
    const casts = new Set<string>();
    run(w, 40, () => { used.add(b.lastSkill); for (const e of w.events) if (e.t === 'bossCast') casts.add(e.name); });
    used.delete('');
    expect([...used].every((s) => RAY_PHASE_SKILLS[0].includes(s as never)), [...used].join()).toBe(true);
    expect(used.size).toBeGreaterThanOrEqual(3);
    expect(casts.size).toBeGreaterThanOrEqual(3);
  });

  it('telegraph = hitbox: Dragon Pulse fires exactly when its warning ends, on the shown line only', () => {
    const { w, b, t } = rayArena(9);
    let z = null as null | (typeof w.zones)[number];
    run(w, 30, () => { z = w.zones.find((q) => q.active && q.owner === b && q.shape === 'line' && !q.visualOnly && q.length === 560) ?? null; return !!z; });
    expect(z).toBeTruthy();
    expect(z!.delay).toBe(RAY_T.pulse);
    // the trainer stands on the line → hit when it fires
    t.x = z!.x + Math.cos(z!.angle) * 200; t.y = z!.y + Math.sin(z!.angle) * 200;
    const hp0 = t.hp;
    let fired = false;
    for (let i = 0; i < 120 && !fired; i++) { t.x = z!.x + Math.cos(z!.angle) * 200; t.y = z!.y + Math.sin(z!.angle) * 200; w.step(STEP); fired = z!.fired || !z!.active; }
    expect(fired).toBe(true);
    expect(t.hp).toBeLessThan(hp0);
  });

  it('70 %: Mega Evolution (real form, old hitboxes cleared, invulnerable cinematic) → Mega skills', () => {
    const { w, b } = rayArena(3);
    run(w, 6);
    w.applyDamage(b, Math.ceil(b.hp - b.maxHp * 0.5), null);
    expect(b.hp / b.maxHp).toBeCloseTo(0.7, 2); // clamped at the threshold
    w.step(STEP);
    expect(b.boss!.phase).toBe(2);
    expect(w.zones.some((z) => z.active && z.owner === b)).toBe(false);
    expect(b.boss!.pm.invulnerable).toBe(true);
    const hp = b.hp;
    w.applyDamage(b, 99999, null);
    expect(b.hp).toBe(hp);
    run(w, 6, () => b.boss!.pm.canAct);
    expect(b.boss!.form).toBe('rayquaza-mega');
    expect(b.stats.atk).toBeGreaterThan(0);
    const used = new Set<string>();
    run(w, 40, () => { used.add(b.lastSkill); });
    used.delete('');
    expect([...used].some((s) => ['dragon_ascent', 'hyper_beam', 'multi_dash', 'beam_sweep'].includes(s)), [...used].join()).toBe(true);
    expect([...used].every((s) => RAY_PHASE_SKILLS[1].includes(s as never) || RAY_PHASE_SKILLS[0].includes(s as never))).toBe(true);
  });

  it('30 %: Enraged opens with Sky Cataclysm (rise → storm → dive → shockwave → rest); airborne = untouchable', () => {
    const { w, b } = rayArena(4);
    beatBossTo(w, b, 0.25);
    expect(b.boss!.phase).toBe(3);
    let air = false, safeRing = false, bolts = 0;
    const hpAt = () => b.hp;
    let untouched = true;
    const ok = run(w, 20, () => {
      if (rayAirborne(b)) {
        air = true;
        const h = hpAt(); w.applyDamage(b, 5000, null); if (b.hp !== h) untouched = false;
      }
      bolts = Math.max(bolts, w.zones.filter((z) => z.active && z.owner === b && z.shape === 'circle' && z.r === 85).length);
      if (w.zones.some((z) => z.active && z.owner === b && z.safe?.length)) safeRing = true;
      return b.lastSkill === 'sky_cataclysm' && safeRing && !b.boss!.ray!.act;
    });
    expect(ok).toBe(true);
    expect(air).toBe(true);
    expect(untouched).toBe(true);
    expect(bolts).toBeGreaterThanOrEqual(10);
  });

  it('ends WEAKENED at the HP floor (capture window), never dies from damage', () => {
    const { w, b } = rayArena(6);
    beatBossTo(w, b, 0);
    expect(b.boss!.weakened).toBe(true);
    expect(b.alive).toBe(true);
    expect(b.hp).toBeGreaterThan(0);
    const evs: string[] = [];
    w.applyDamage(b, 1e6, null);
    expect(b.hp).toBeGreaterThan(0);
    run(w, 1, () => { for (const e of w.events) evs.push(e.t); });
    expect(w.zones.some((z) => z.active && z.owner === b)).toBe(false); // no attacks while weakened
  });
});

describe('legendary capture rules', () => {
  it('per-boss rules: throws, window, chance floor, allowed balls', async () => {
    const { legendRule, legendThrowChance, DEFAULT_LEGEND_RULE } = await import('../src/core/legendCapture');
    expect(legendRule('articuno')).toEqual(DEFAULT_LEGEND_RULE);
    const r = legendRule('rayquaza');
    expect(r.maxAttempts).toBe(4);
    expect(legendThrowChance(r, 'pokeball', 0.01)).toBe(r.minChance);
    expect(legendThrowChance(r, 'ultraball', 0.99)).toBe(0.95);
    const arc = legendRule('arceus');
    expect(legendThrowChance(arc, 'pokeball', 0.5)).toBe(0); // bounces off
    expect(legendThrowChance(arc, 'ultraball', 0.5)).toBe(0.5);
    // the boss's weakened window comes from its rule
    expect(phaseConfigFor(BOSSES.get('rayquaza')!, { capture: true }).weakened!.duration).toBe(r.window);
  });
});
