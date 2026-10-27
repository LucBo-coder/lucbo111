// Shrine rituals (pure): what the player does at a shrine's ritual spot `P` before its legendary appears
// (LEGENDARY_SHRINES.md §2.2). Each shrine lists 0–3 steps built from eight reusable kinds; `RitualRun` is the state
// machine of one attempt. The scene (adventure/ShrineController) feeds it touches, plates stepped on, movement and
// wave clears, and reacts to the events it returns. A completed ritual is remembered in the save (`adv.rites`), so
// a rematch only needs E at `P`.
import ritualsJson from '../data/world/rituals.json';
import relicsJson from '../data/world/relics.json';
import type { FieldAbility } from './field';
import type { HazardDef } from './shrineHazards';

export type RitualStep =
  /** place relic items (key items kept in the bag); `alt` weather replaces the relic (Articuno in a blizzard) */
  | { kind: 'relic'; items: string[]; alt?: string[]; text: string }
  /** touch (E) the shrine objects of `part` in the order they light up; `window` s per touch, else no time limit */
  | { kind: 'sequence'; part: string; count: number; window?: number; cooldown?: number; text: string }
  /** step on the plates of `part` in `order` (indexes clockwise from north); `hidden`: the plates do not show it */
  | { kind: 'plates'; part: string; order: number[]; hidden?: boolean; text: string }
  /** stand still on P for `seconds` (`fast` weather: `fastSeconds`) */
  | { kind: 'still'; seconds: number; fast?: string[]; fastSeconds?: number; text: string }
  /** hold the ring (radius `ring` tiles around P) through `waves` waves of wild Pokémon */
  | { kind: 'waves'; waves: number; ring: number; species: string[]; text: string }
  /** answer every question (dialogue choices) */
  | { kind: 'quiz'; questions: { q: string; options: string[]; answer: number }[]; text: string }
  /** a field ability of the party (Flash lights the lamps, Strength moves the stones) */
  | { kind: 'field'; ability: FieldAbility; text: string };

/** How the legendary shows itself after the ritual (cutscene look). */
export type Appear = 'descend' | 'rise' | 'shatter' | 'burst' | 'wall' | 'shadow' | 'reflect' | 'coil' | 'fade' | 'fly';

export interface RitualDef {
  /** shrine id (data/world/shrines.json) */
  shrine: string;
  /** the legendary of the shrine (several for a roaming trigger) */
  legends: string[];
  /** fight (default) · gift (non-combat meeting) · roam (wakes roamers) · portal (opens the way to a plane) · egg */
  mode?: 'fight' | 'gift' | 'roam' | 'portal' | 'egg';
  /** portal: target region + tile */
  to?: { region: string; x: number; y: number };
  /** flags needed (beyond the legend's own) — e.g. a portal's story gate */
  requires?: string[];
  title: string;
  steps: RitualStep[];
  appear: Appear;
  /** element colour of the cutscene / core glow */
  color: number;
  /** cutscene text when the ritual completes */
  awaken: string;
  /** statues (`S`, clockwise) that wake these roaming legendaries when touched (Ho-Oh's three Beasts) */
  wake?: string[];
  /** arena hazards during the fight (≤ 2 kinds, see core/shrineHazards) */
  hazards?: HazardDef[];
}

export const RITUALS = new Map((ritualsJson as unknown as RitualDef[]).map((r) => [r.shrine, r]));
/** Shrine of a legendary (the shrine where it is fought / met). */
export const RITUAL_OF = new Map<string, RitualDef>();
for (const r of RITUALS.values()) if ((r.mode ?? 'fight') === 'fight' || r.mode === 'gift') for (const l of r.legends) RITUAL_OF.set(l, r);

export interface RelicDef {
  id: string;
  /** granted when every flag is set (boss:…) or the legend's investigation completes (clues:<legend>) */
  from: string[];
}
export const RELICS = relicsJson as unknown as RelicDef[];

/** Relics the player has earned but does not hold yet (story flags / completed investigations). */
export function relicsDue(has: (flag: string) => boolean, investigated: (legend: string) => boolean, owned: (item: string) => boolean): string[] {
  return RELICS.filter((r) => !owned(r.id) && r.from.every((f) => (f.startsWith('clues:') ? investigated(f.slice(6)) : has(f)))).map((r) => r.id);
}

export type RitualEvent =
  | { t: 'step'; index: number; step: RitualStep }
  | { t: 'progress'; done: number; of: number }
  | { t: 'light'; part: string; index: number }
  | { t: 'fail'; reason: string; cooldown?: number }
  | { t: 'wave'; n: number; of: number }
  | { t: 'complete' };

/** Plate / object order: clockwise from north around the anchor (stable for every layout). */
export function clockwise<T extends { x: number; y: number }>(cells: T[], ax: number, ay: number): T[] {
  const ang = (c: T) => (Math.atan2(c.x - ax, -(c.y - ay)) + Math.PI * 2) % (Math.PI * 2);
  return [...cells].sort((a, b) => ang(a) - ang(b) || a.y - b.y || a.x - b.x);
}

/**
 * One ritual attempt. Steps run in order; `relic`, `field` and `quiz` are answered by the scene through `pass()` /
 * `failStep()` after checking the bag / party / answers; the others are driven by `touch`, `stepOn`, `tick`, `waveCleared`.
 */
export class RitualRun {
  index = 0;
  /** touches / plates done in the current step, seconds stood still, waves cleared */
  done = 0;
  /** sequence: which object (index into the part list) is lit · plates: next expected plate */
  lit = -1;
  /** sequence: seconds left for the current touch */
  left = 0;
  stillT = 0;
  finished = false;
  private events: RitualEvent[] = [];
  private seq = 0;

  constructor(readonly def: RitualDef, readonly counts: Record<string, number>, private rand: () => number = Math.random) {
    this.enter();
  }

  get step(): RitualStep | undefined { return this.def.steps[this.index]; }

  drain(): RitualEvent[] { const e = this.events; this.events = []; return e; }

  private enter(): void {
    this.done = 0; this.stillT = 0; this.lit = -1; this.left = 0;
    const s = this.step;
    if (!s) { this.finished = true; this.events.push({ t: 'complete' }); return; }
    this.events.push({ t: 'step', index: this.index, step: s });
    if (s.kind === 'sequence') this.relight();
    if (s.kind === 'plates') { this.lit = s.order[0]; if (!s.hidden) this.events.push({ t: 'light', part: s.part, index: this.lit }); }
  }

  private relight(): void {
    const s = this.step;
    if (s?.kind !== 'sequence') return;
    const n = Math.max(1, this.counts[s.part] ?? 1);
    // the light never stays on the same object twice in a row (when there is a choice)
    let next = Math.floor(this.rand() * n);
    if (n > 1 && next === this.lit) next = (next + 1 + Math.floor(this.rand() * (n - 1))) % n;
    if (s.window == null) next = (this.seq++) % n; // untimed: a fixed round (pillars ringing one after another)
    this.lit = next;
    this.left = s.window ?? 0;
    this.events.push({ t: 'light', part: s.part, index: next });
  }

  /** The scene confirmed a relic / field / quiz step. */
  pass(): void {
    if (this.finished) return;
    this.index++;
    this.enter();
  }

  /** The step failed (wrong answer, left the ring, missing relic): the attempt starts over at step 0. */
  failStep(reason: string, cooldown?: number): void {
    this.events.push({ t: 'fail', reason, cooldown });
    this.index = 0;
    this.enter();
  }

  /** E on the object `index` of `part`. */
  touch(part: string, index: number): void {
    const s = this.step;
    if (s?.kind !== 'sequence' || s.part !== part) return;
    if (index !== this.lit) { this.failStep('Sai thứ tự — ánh sáng tắt.', s.cooldown); return; }
    this.done++;
    this.events.push({ t: 'progress', done: this.done, of: s.count });
    if (this.done >= s.count) this.pass();
    else this.relight();
  }

  /** The trainer stands on plate `index` of `part`. */
  stepOn(part: string, index: number): void {
    const s = this.step;
    if (s?.kind !== 'plates' || s.part !== part) return;
    // standing on the plate already pressed is fine
    if (this.done > 0 && index === s.order[this.done - 1]) return;
    if (index !== this.lit) { this.failStep('Tấm nén sai — các phiến tắt sáng.'); return; }
    this.done++;
    this.events.push({ t: 'progress', done: this.done, of: s.order.length });
    if (this.done >= s.order.length) { this.pass(); return; }
    this.lit = s.order[this.done];
    if (!s.hidden) this.events.push({ t: 'light', part: s.part, index: this.lit });
  }

  /** Per frame: `moved` = the trainer moved this frame, `weather` = current weather id. */
  tick(dt: number, moved: boolean, weather: string): void {
    const s = this.step;
    if (!s || this.finished) return;
    if (s.kind === 'sequence' && s.window != null) {
      this.left -= dt;
      if (this.left <= 0) this.failStep('Ánh sáng vụt tắt — chậm quá.', s.cooldown);
    } else if (s.kind === 'still') {
      if (moved) { if (this.stillT > 0.3) this.events.push({ t: 'fail', reason: 'Bạn đã cử động — đếm lại từ đầu.' }); this.stillT = 0; return; }
      const need = s.fast?.includes(weather) ? s.fastSeconds ?? s.seconds : s.seconds;
      const before = Math.floor(this.stillT);
      this.stillT += dt;
      if (Math.floor(this.stillT) !== before) this.events.push({ t: 'progress', done: Math.min(need, Math.floor(this.stillT)), of: need });
      if (this.stillT >= need) this.pass();
    }
  }

  /** Seconds the current `still` step needs (for the HUD). */
  stillNeed(weather: string): number {
    const s = this.step;
    return s?.kind === 'still' ? (s.fast?.includes(weather) ? s.fastSeconds ?? s.seconds : s.seconds) : 0;
  }

  /** A wave of the `waves` step was cleared. */
  waveCleared(): void {
    const s = this.step;
    if (s?.kind !== 'waves') return;
    this.done++;
    this.events.push({ t: 'wave', n: this.done, of: s.waves });
    if (this.done >= s.waves) this.pass();
  }
}

/** Story flag set when a roaming legendary has been woken by its trigger (stone, terrace, Beast statue). */
export const roamFlag = (legend: string) => `roam:${legend}`;
