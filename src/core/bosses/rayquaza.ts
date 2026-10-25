// Rayquaza — scripted 3-phase legendary boss (phases from bossPhases.ts: Normal → Mega Rayquaza → Enraged).
//
// Every skill is an action with three parts:
//   windup    — the boss holds still; the telegraph zone is created at the start with delay = windup,
//               so what the player sees is exactly the hitbox that fires (same shape, same size, same moment);
//   execution — the zone fires / the dash runs;
//   recovery  — the boss does nothing for a moment (the punish window).
// A cast warning event ('bossCast') names the skill for the HUD while it winds up.

import type { SkillDef } from '../types';
import type { SkillSlot, Unit, World } from '../world';

export type RaySkill =
  | 'dragon_pulse' | 'extreme_speed' | 'hurricane' | 'dragon_dance'
  | 'dragon_ascent' | 'hyper_beam' | 'multi_dash' | 'beam_sweep'
  | 'sky_cataclysm';

export interface RayAct {
  id: RaySkill;
  /** world time the action started */
  start: number;
  /** sub-step (multi-dash index, cataclysm stage…) */
  step: number;
  /** stage start time */
  stepAt: number;
  ang: number;
  x: number;
  y: number;
  /** world time the action ends (recovery included); -1 while it still depends on a dash */
  end: number;
}

export interface RayState {
  act: RayAct | null;
  cd: Partial<Record<RaySkill, number>>;
  /** Dragon Dance speed buff (s) */
  danceT: number;
  /** 0 = on the ground … 1 = high in the sky (untargetable, drawn lifted) */
  air: number;
  airTarget: number;
}

/** Skills each phase draws from (phase index 0 / 1 / 2). */
export const RAY_PHASE_SKILLS: RaySkill[][] = [
  ['dragon_pulse', 'extreme_speed', 'hurricane', 'dragon_dance'],
  ['dragon_ascent', 'hyper_beam', 'multi_dash', 'beam_sweep', 'dragon_pulse'],
  ['sky_cataclysm', 'multi_dash', 'beam_sweep', 'hyper_beam', 'dragon_ascent'],
];

export const RAY_NAMES: Record<RaySkill, string> = {
  dragon_pulse: 'Dragon Pulse', extreme_speed: 'Extreme Speed', hurricane: 'Hurricane', dragon_dance: 'Dragon Dance',
  dragon_ascent: 'Dragon Ascent', hyper_beam: 'Hyper Beam', multi_dash: 'Extreme Speed ×3', beam_sweep: 'Dragon Pulse quét',
  sky_cataclysm: 'Sky Cataclysm',
};

const COOLDOWN: Record<RaySkill, number> = {
  dragon_pulse: 3, extreme_speed: 4, hurricane: 5, dragon_dance: 14,
  dragon_ascent: 7, hyper_beam: 8, multi_dash: 7, beam_sweep: 8, sky_cataclysm: 15,
};

/** Timings (s) — exported for tests: telegraph === hitbox delay. */
export const RAY_T = {
  pulse: 0.9, esWind: 0.55, hurricane: 1.0, dance: 0.6, rise: 0.7, ascentMark: 1.1, hyper: 1.5, hyperRecover: 1.8,
  dashWind: 0.45, sweep: 0.9, cataRise: 1.0, cataStorm: 2.0, cataDive: 1.0, shock: 0.8, rest: 2.6,
};
const DASH_SPEED = 1900;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const DASH_R = 30;

export function newRayState(): RayState {
  return { act: null, cd: {}, danceT: 0, air: 0, airTarget: 0 };
}

/** True while Rayquaza is high in the sky: no damage, no contact. */
export function rayAirborne(b: Unit): boolean {
  return (b.boss?.ray?.air ?? 0) > 0.5;
}

function slot(w: World, b: Unit, base: string, over: Partial<SkillDef>, key: string): SkillSlot {
  const pw = b.boss!.def.legend?.power ?? 1;
  return w.bossSlot(b, base, { ...over, power: (over.power ?? 80) * pw }, 'ray-' + key);
}

function warn(w: World, b: Unit, id: RaySkill, windup: number): void {
  b.boss!.cast = { name: RAY_NAMES[id], at: w.time, windup };
  w.emit({ t: 'bossCast', id: b.id, name: RAY_NAMES[id], windup });
}

function begin(w: World, b: Unit, id: RaySkill, t: Unit): RayAct {
  const rs = b.boss!.ray!;
  const cdMult = b.boss!.pm?.phase.cdMult ?? 1;
  rs.cd[id] = w.time + COOLDOWN[id] * cdMult;
  const ang = Math.atan2(t.y + t.vy * 0.3 - b.y, t.x + t.vx * 0.3 - b.x);
  const act: RayAct = { id, start: w.time, step: 0, stepAt: w.time, ang, x: t.x, y: t.y, end: -1 };
  b.lastSkill = id;
  b.animCast = 0.6;
  b.vx = 0; b.vy = 0;
  const L = (n: number) => w.time + n;
  switch (id) {
    case 'dragon_pulse':
      warn(w, b, id, RAY_T.pulse);
      w.addZone(b, slot(w, b, 'dragon_pulse', { power: 95, radius: 30, kind: 'aoe' }, 'pulse'), 'line', b.x, b.y, 30, ang, 560, RAY_T.pulse, 0, 0, false);
      act.end = L(RAY_T.pulse + 0.6);
      break;
    case 'extreme_speed':
      warn(w, b, id, RAY_T.esWind);
      act.x = Math.min(480, Math.hypot(t.x - b.x, t.y - b.y) + 120); // dash length
      w.addZone(b, slot(w, b, 'extreme_speed', { power: 80, radius: DASH_R }, 'es'), 'line', b.x, b.y, DASH_R, ang, act.x, RAY_T.esWind, 0, 0, true);
      break;
    case 'hurricane':
      warn(w, b, id, RAY_T.hurricane);
      w.addZone(b, slot(w, b, 'hurricane', { power: 90, kind: 'cone', status: { kind: 'confusion', chance: 0.3, duration: 2.5, magnitude: 0 } }, 'hurricane'), 'cone', b.x, b.y, 0.5, ang, 360, RAY_T.hurricane, 0, 0, false);
      act.end = L(RAY_T.hurricane + 0.7);
      break;
    case 'dragon_dance':
      warn(w, b, id, RAY_T.dance);
      w.emit({ t: 'vfx', name: 'buff', x: b.x, y: b.y, r: 70, type: 'dragon' });
      act.end = L(RAY_T.dance + 0.3);
      break;
    case 'dragon_ascent':
      warn(w, b, id, RAY_T.rise + RAY_T.ascentMark);
      rs.airTarget = 1;
      break;
    case 'hyper_beam':
      warn(w, b, id, RAY_T.hyper);
      w.addZone(b, slot(w, b, 'hyper_beam', { power: 150, radius: 44, kind: 'aoe' }, 'hyper'), 'line', b.x, b.y, 44, ang, 720, RAY_T.hyper, 0, 0, false);
      act.end = L(RAY_T.hyper + RAY_T.hyperRecover);
      break;
    case 'multi_dash':
      warn(w, b, id, RAY_T.dashWind);
      act.step = -1; // first telegraph is laid by stepAct
      break;
    case 'beam_sweep': {
      warn(w, b, id, RAY_T.sweep);
      const s = slot(w, b, 'dragon_pulse', { power: 85, radius: 28, kind: 'aoe' }, 'sweep');
      for (let i = 0; i < 7; i++) w.addZone(b, s, 'line', b.x, b.y, 28, ang - 0.9 + i * 0.3, 600, RAY_T.sweep + i * 0.12, 0, 0, false);
      act.end = L(RAY_T.sweep + 6 * 0.12 + 0.9);
      break;
    }
    case 'sky_cataclysm':
      warn(w, b, id, RAY_T.cataRise + RAY_T.cataStorm + RAY_T.cataDive);
      w.emit({ t: 'banner', text: 'Rayquaza bay vút lên tầng mây...', color: '#a0e0ff' });
      rs.airTarget = 1;
      break;
  }
  return act;
}

/** Advances a running action; returns false once it is over. */
function stepAct(w: World, b: Unit, a: RayAct): boolean {
  const st = b.boss!, rs = st.ray!;
  const since = w.time - a.stepAt;
  const live = w.friendlyUnits().filter(x => !x.fainted && x.hp > 0);
  const tg = w.trainer;
  switch (a.id) {
    case 'dragon_dance':
      if (a.step === 0 && w.time - a.start >= RAY_T.dance) {
        a.step = 1;
        w.applyStatus(b, { kind: 'atkUp', chance: 1, duration: 8, magnitude: 0.3 }, b);
        rs.danceT = 8;
      }
      break;
    case 'extreme_speed':
      if (a.step === 0 && since >= RAY_T.esWind) {
        a.step = 1;
        b.dash = { dx: Math.cos(a.ang), dy: Math.sin(a.ang), remaining: a.x, speed: DASH_SPEED, slot: slot(w, b, 'extreme_speed', { power: 80, radius: DASH_R }, 'es'), hit: new Set() };
      } else if (a.step === 1 && !b.dash) { a.step = 2; a.end = w.time + 0.7; }
      break;
    case 'multi_dash': {
      // three telegraphed dashes, each aimed from where the previous one ended
      if (a.step === -1 || (a.step % 2 === 1 && !b.dash && since >= 0.15)) {
        const n = (a.step + 1) / 2; // dashes done
        if (n >= 3) { if (a.end < 0) a.end = w.time + 1.0; break; }
        a.ang = Math.atan2(tg.y + tg.vy * 0.25 - b.y, tg.x + tg.vx * 0.25 - b.x);
        a.x = Math.min(460, Math.hypot(tg.x - b.x, tg.y - b.y) + 110);
        w.addZone(b, slot(w, b, 'extreme_speed', { power: 75, radius: DASH_R }, 'mdash'), 'line', b.x, b.y, DASH_R, a.ang, a.x, RAY_T.dashWind, 0, 0, true);
        a.step++; a.stepAt = w.time;
      } else if (a.step % 2 === 0 && since >= RAY_T.dashWind) {
        b.dash = { dx: Math.cos(a.ang), dy: Math.sin(a.ang), remaining: a.x, speed: DASH_SPEED, slot: slot(w, b, 'extreme_speed', { power: 75, radius: DASH_R }, 'mdash'), hit: new Set() };
        a.step++; a.stepAt = w.time;
      }
      break;
    }
    case 'dragon_ascent':
      if (a.step === 0 && since >= RAY_T.rise) {
        // marked landing spot = where the trainer is heading
        a.x = tg.x + tg.vx * 0.5; a.y = tg.y + tg.vy * 0.5;
        w.addZone(b, slot(w, b, 'fly', { power: 120, radius: 120, kind: 'aoe', type: 'flying', name: 'Dragon Ascent' }, 'ascent'), 'circle', a.x, a.y, 120, 0, 0, RAY_T.ascentMark, 0, 0, false);
        a.step = 1; a.stepAt = w.time;
      } else if (a.step === 1 && since >= RAY_T.ascentMark) {
        land(w, b, a.x, a.y);
        a.step = 2; a.end = w.time + 1.0;
      }
      break;
    case 'sky_cataclysm':
      if (a.step === 0 && since >= RAY_T.cataRise) {
        // lightning: on every target first, then scattered over the arena
        const s = slot(w, b, 'thunder', { power: 90, radius: 85, kind: 'aoe' }, 'cata-bolt');
        for (let i = 0; i < 12; i++) {
          let x: number, y: number;
          if (i < live.length) { x = live[i].x + live[i].vx * 0.5; y = live[i].y + live[i].vy * 0.5; }
          else { const r = w.rng.range(60, 380), ang = w.rng.range(0, Math.PI * 2); x = st.homeX + Math.cos(ang) * r; y = st.homeY + Math.sin(ang) * r; }
          w.addZone(b, s, 'circle', x, y, 85, 0, 0, 0.8 + (i / 12) * (RAY_T.cataStorm - 0.8), 0, 0, false);
        }
        a.step = 1; a.stepAt = w.time;
      } else if (a.step === 1 && since >= RAY_T.cataStorm) {
        a.x = tg.x; a.y = tg.y;
        w.addZone(b, slot(w, b, 'fly', { power: 130, radius: 150, kind: 'aoe', type: 'dragon', name: 'Sky Cataclysm' }, 'cata-dive'), 'circle', a.x, a.y, 150, 0, 0, RAY_T.cataDive, 0, 0, false);
        a.step = 2; a.stepAt = w.time;
      } else if (a.step === 2 && since >= RAY_T.cataDive) {
        land(w, b, a.x, a.y);
        // shockwave: everything beyond the inner circle around the impact is hit — step in close or get far away
        w.addZone(b, slot(w, b, 'thunder', { power: 100, radius: 420, kind: 'aoe', type: 'dragon', name: 'Shockwave' }, 'cata-shock'), 'circle', b.x, b.y, 420, 0, 0, RAY_T.shock, 0, 0, false, [{ x: b.x, y: b.y, r: 150 }]);
        a.step = 3; a.stepAt = w.time;
      } else if (a.step === 3 && since >= RAY_T.shock) {
        w.emit({ t: 'banner', text: 'Rayquaza kiệt sức — tấn công ngay!', color: '#80ff90' });
        a.step = 4; a.end = w.time + RAY_T.rest;
      }
      break;
    default:
  }
  return a.end < 0 || w.time < a.end;
}

function land(w: World, b: Unit, x: number, y: number): void {
  const rs = b.boss!.ray!;
  b.x = clamp(x, 40, w.width - 40); b.y = clamp(y, 40, w.height - 40);
  rs.air = 0; rs.airTarget = 0;
  w.emit({ t: 'shake', intensity: 0.02, duration: 500 });
  w.emit({ t: 'vfx', name: 'impact', x: b.x, y: b.y, r: 90, type: 'dragon' });
}

/** Cancels the running action (phase transition / weakened): the boss comes back down. */
export function rayCancel(b: Unit): void {
  const rs = b.boss?.ray;
  if (!rs) return;
  rs.act = null;
  rs.air = 0; rs.airTarget = 0;
}

export function rayquazaThink(w: World, b: Unit, t: Unit, dt: number): void {
  const st = b.boss!;
  const rs = (st.ray ??= newRayState());
  const ph = st.pm?.index ?? 0;
  // lift / descend smoothly
  rs.air += clamp(rs.airTarget - rs.air, -dt * 2.5, dt * 2.5);
  rs.danceT = Math.max(0, rs.danceT - dt);

  if (rs.act) {
    if (!stepAct(w, b, rs.act)) { rs.act = null; st.patternT = 0.7 * (st.pm?.phase.cdMult ?? 1); }
    return;
  }

  // movement between actions: circle-strafe at ~260 px, leashed to the arena
  const speed = b.moveSpeed * w.slowFactor(b) * (st.pm?.phase.speedMult ?? 1) * (rs.danceT > 0 ? 1.3 : 1);
  const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy) || 1;
  const homeD = Math.hypot(b.x - st.homeX, b.y - st.homeY);
  if (homeD > 330) {
    const hx = st.homeX - b.x, hy = st.homeY - b.y, hl = Math.hypot(hx, hy);
    b.vx = (hx / hl) * speed; b.vy = (hy / hl) * speed;
  } else {
    const radial = clamp((d - 260) / 260, -1, 1);
    b.vx = ((dx / d) * radial - (dy / d) * 0.8) * speed;
    b.vy = ((dy / d) * radial + (dx / d) * 0.8) * speed;
  }
  b.x = clamp(b.x + b.vx * dt, 40, w.width - 40); b.y = clamp(b.y + b.vy * dt, 40, w.height - 40);
  if (Math.abs(dx) > 4) b.facing = Math.sign(dx);
  w.contact(b, t);

  st.patternT -= dt;
  if (st.patternT > 0) return;
  const pool = RAY_PHASE_SKILLS[Math.min(ph, RAY_PHASE_SKILLS.length - 1)];
  const ready = pool.filter((s) => (rs.cd[s] ?? 0) <= w.time && !(s === 'dragon_dance' && rs.danceT > 0) && !(s === 'hurricane' && d > 380));
  if (!ready.length) { st.patternT = 0.3; return; }
  // the phase signature first (Sky Cataclysm opens the enraged phase), else weighted random
  const pick = ph === 2 && ready.includes('sky_cataclysm') ? 'sky_cataclysm' : w.rng.pick(ready);
  rs.act = begin(w, b, pick, t);
}
