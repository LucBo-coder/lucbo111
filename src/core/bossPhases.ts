// BossPhaseManager — one phase state machine shared by every boss (Survivor bosses, world bosses, legendaries).
//
//   ACTIVE ──(HP reaches the next threshold)──▶ TRANSITION_PENDING ──(boss finished its current action, ≤ 0.6 s)──▶
//   TRANSITION_CINEMATIC ──▶ [FORM_CHANGE, only for a real alternate form] ──▶ PHASE_READY ──▶ ACTIVE (next phase)
//   last phase: HP floor ──▶ WEAKENED (legendaries: capture window)   or   HP 0 ──▶ DEFEATED
//
// Rules:
//  • every phase triggers exactly once (a `triggered` set, restored from saves);
//  • one huge hit never skips a phase: HP is clamped at the next threshold, the following phase comes later;
//  • the boss is invulnerable only while transitioning, and never longer than `maxInvuln` seconds;
//  • the manager owns no timers or scene objects — the World steps it — so there is nothing to leak when a scene dies.

import type { BossDef } from './types';
import { legendRule } from './legendCapture';

export type BossPhaseState = 'ACTIVE' | 'TRANSITION_PENDING' | 'TRANSITION_CINEMATIC' | 'FORM_CHANGE' | 'PHASE_READY' | 'WEAKENED' | 'DEFEATED';

export interface PhaseDef {
  id: string;
  /** Display name (HUD phase panel) */
  name: string;
  /** Phase starts when HP fraction reaches this value (first phase: 1) */
  at: number;
  /** normal: opening phase · mega: form change · stance: new pattern set · enrage: final, fastest phase */
  kind: 'normal' | 'mega' | 'stance' | 'enrage';
  /** Species id to change into — only for species that really have that form (Mega Rayquaza) */
  form?: string;
  /** Seconds of transition cinematic (boss invulnerable, no attacks) */
  cinematic: number;
  banner: string;
  /** Multipliers applied by the boss AI while this phase is active */
  speedMult?: number;
  cdMult?: number;
}

export interface BossPhaseConfig {
  phases: PhaseDef[];
  /** Hard cap on one transition's invulnerability (s) */
  maxInvuln: number;
  /** Legendaries: the last phase ends WEAKENED at this HP fraction (capture window, `duration` s) instead of dying */
  weakened?: { hpFrac: number; duration: number };
}

export type PhaseEvent =
  | { t: 'transition'; from: number; to: number }
  | { t: 'cinematic'; phase: number }
  | { t: 'formChange'; phase: number; form: string }
  | { t: 'ready'; phase: number }
  | { t: 'active'; phase: number }
  | { t: 'weakened' }
  | { t: 'weakenedExpired' }
  | { t: 'defeated' };

export interface PhaseSnapshot {
  index: number;
  state: BossPhaseState;
  triggered: number[];
}

/** Max wait for the boss to finish its current action before the cinematic starts. */
export const PENDING_MAX = 0.6;
export const FORM_CHANGE_TIME = 0.7;
export const READY_TIME = 0.5;

const TRANSITION: BossPhaseState[] = ['TRANSITION_PENDING', 'TRANSITION_CINEMATIC', 'FORM_CHANGE', 'PHASE_READY'];

export class BossPhaseManager {
  state: BossPhaseState = 'ACTIVE';
  index = 0;
  /** seconds spent in the current state */
  stateT = 0;
  /** seconds of invulnerability of the current transition */
  invulnT = 0;
  private triggered = new Set<number>([0]);
  private events: PhaseEvent[] = [];

  constructor(readonly cfg: BossPhaseConfig) {
    if (!cfg.phases.length) throw new Error('BossPhaseManager: no phases');
  }

  get phase(): PhaseDef { return this.cfg.phases[this.index]; }
  get count(): number { return this.cfg.phases.length; }
  get invulnerable(): boolean { return TRANSITION.includes(this.state); }
  /** The boss AI may attack / move aggressively only while ACTIVE. */
  get canAct(): boolean { return this.state === 'ACTIVE'; }
  hasTriggered(i: number): boolean { return this.triggered.has(i); }

  private nextIndex(): number {
    const i = this.index + 1;
    return i < this.cfg.phases.length && !this.triggered.has(i) ? i : -1;
  }

  /** Filters one hit and returns the boss's new HP (the caller writes it). */
  damage(hp: number, maxHp: number, amount: number): number {
    if (this.state === 'DEFEATED' || this.state === 'WEAKENED' || this.invulnerable || amount <= 0) return hp;
    let next = hp - amount;
    const ni = this.nextIndex();
    if (ni >= 0) {
      const floor = Math.max(1, Math.floor(maxHp * this.cfg.phases[ni].at));
      if (next <= floor) { next = floor; this.begin(ni); }
      return next;
    }
    const w = this.cfg.weakened;
    if (w) {
      const floor = Math.max(1, Math.ceil(maxHp * w.hpFrac));
      if (next <= floor) { next = floor; this.set('WEAKENED'); this.events.push({ t: 'weakened' }); }
      return next;
    }
    if (next <= 0) { next = 0; this.set('DEFEATED'); this.events.push({ t: 'defeated' }); }
    return next;
  }

  /** Forces the defeat of a weakened boss (it fled / was captured). */
  finish(): void {
    if (this.state === 'DEFEATED') return;
    this.set('DEFEATED');
    this.events.push({ t: 'defeated' });
  }

  private begin(i: number): void {
    const from = this.index;
    this.triggered.add(i);
    this.index = i;
    this.invulnT = 0;
    this.set('TRANSITION_PENDING');
    this.events.push({ t: 'transition', from, to: i });
  }

  private set(s: BossPhaseState): void {
    this.state = s;
    this.stateT = 0;
  }

  /** busy: the boss is still in the middle of an action (cast / dash) — the cinematic waits for it, briefly. */
  update(dt: number, busy = false): void {
    this.stateT += dt;
    if (this.invulnerable) {
      this.invulnT += dt;
      if (this.invulnT >= this.cfg.maxInvuln) { this.set('ACTIVE'); this.events.push({ t: 'active', phase: this.index }); return; }
    }
    const p = this.phase;
    switch (this.state) {
      case 'TRANSITION_PENDING':
        if (!busy || this.stateT >= PENDING_MAX) { this.set('TRANSITION_CINEMATIC'); this.events.push({ t: 'cinematic', phase: this.index }); }
        break;
      case 'TRANSITION_CINEMATIC':
        if (this.stateT >= p.cinematic) {
          if (p.form) { this.set('FORM_CHANGE'); this.events.push({ t: 'formChange', phase: this.index, form: p.form }); }
          else { this.set('PHASE_READY'); this.events.push({ t: 'ready', phase: this.index }); }
        }
        break;
      case 'FORM_CHANGE':
        if (this.stateT >= FORM_CHANGE_TIME) { this.set('PHASE_READY'); this.events.push({ t: 'ready', phase: this.index }); }
        break;
      case 'PHASE_READY':
        if (this.stateT >= READY_TIME) { this.set('ACTIVE'); this.events.push({ t: 'active', phase: this.index }); }
        break;
      case 'WEAKENED': {
        const w = this.cfg.weakened;
        if (w && w.duration > 0 && this.stateT >= w.duration && this.stateT - dt < w.duration) this.events.push({ t: 'weakenedExpired' });
        break;
      }
      default:
    }
  }

  /** Events since the last drain, in order. */
  drain(): PhaseEvent[] {
    if (!this.events.length) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot(): PhaseSnapshot {
    return { index: this.index, state: this.state, triggered: [...this.triggered].sort((a, b) => a - b) };
  }

  /**
   * Safe checkpoint: a save taken mid-cinematic resumes ACTIVE in the phase that was starting
   * (the transition already counted — it never replays or is skipped); WEAKENED / DEFEATED stay.
   */
  static restore(cfg: BossPhaseConfig, s: PhaseSnapshot | null | undefined): BossPhaseManager {
    const m = new BossPhaseManager(cfg);
    if (!s) return m;
    const n = cfg.phases.length;
    m.index = Math.max(0, Math.min(n - 1, s.index | 0));
    m.triggered = new Set((s.triggered ?? []).filter((i) => i >= 0 && i < n));
    for (let i = 0; i <= m.index; i++) m.triggered.add(i);
    m.state = s.state === 'WEAKENED' || s.state === 'DEFEATED' ? s.state : 'ACTIVE';
    return m;
  }
}

// ───────────────────────────── per-boss configs ─────────────────────────────

/**
 * Rayquaza: Normal (100–70 %) → Mega Rayquaza (≤ 70 %, real form change with cinematic) → Enraged (≤ 30 %).
 * Rayquaza is the only boss here with a Mega form; every other boss changes phase by stance / enrage.
 */
export const RAYQUAZA_PHASES: BossPhaseConfig = {
  maxInvuln: 5,
  phases: [
    { id: 'normal', name: 'Rồng Trời', at: 1, kind: 'normal', cinematic: 0, banner: '' },
    { id: 'mega', name: 'Mega Rayquaza', at: 0.7, kind: 'mega', form: 'rayquaza-mega', cinematic: 2.2, banner: 'Rayquaza Mega Tiến Hóa!', speedMult: 1.15, cdMult: 0.85 },
    { id: 'enraged', name: 'Cuồng Nộ', at: 0.3, kind: 'enrage', cinematic: 1.4, banner: 'Mega Rayquaza cuồng nộ — bầu trời nứt toác!', speedMult: 1.3, cdMult: 0.7 },
  ],
};

const SCRIPTED: Record<string, BossPhaseConfig> = { rayquaza: RAYQUAZA_PHASES };

/** Phase config of any boss: a scripted one, else built from the BossDef thresholds (stance / enrage, no form change). */
export function phaseConfigFor(def: BossDef, opts: { capture?: boolean } = {}): BossPhaseConfig {
  const weakened = opts.capture ? { hpFrac: 0.04, duration: legendRule(def.id).window } : undefined;
  const s = SCRIPTED[def.id];
  if (s) return { ...s, weakened };
  const phases: PhaseDef[] = [
    { id: 'p1', name: 'Phase 1', at: 1, kind: 'normal', cinematic: 0, banner: '' },
    { id: 'p2', name: 'Phase 2', at: def.phase2Threshold, kind: 'stance', cinematic: 0.9, banner: `${def.name} nổi giận! (Phase 2)` },
  ];
  if (def.phase3Threshold) phases.push({ id: 'p3', name: 'Phase 3', at: def.phase3Threshold, kind: 'enrage', cinematic: 1.1, banner: `${def.name}: ${def.phase3Banner ?? 'Phase 3!'}` });
  return { phases, maxInvuln: 3, weakened };
}
