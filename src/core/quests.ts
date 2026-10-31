// Data-driven quest engine (pure; persisted through the save system).
// Objectives run in order, but the order only binds where it means something (V30): talking / reporting, a choice and
// the story encounters (hold / destroy / escort) happen only at their step, while fighting, catching, exploring,
// collecting… done early while the quest is active is kept (`pre`) and counted the moment the quest gets there.
// Branching (V22): a 'choose' objective offers options; the pick is stored on the quest state, sets the flag
// `choice:<quest>:<option>` (follow-up quests can require it), adds the option's rewards, and from then on only
// objectives without a `branch` or with that branch apply.

import type { EncounterDef } from './story';

export type QuestKind = 'main' | 'side' | 'exploration' | 'capture' | 'trainer' | 'dungeon' | 'boss';
export type ObjectiveType = 'talk' | 'capture' | 'defeat' | 'explore' | 'activate' | 'dungeon' | 'collect' | 'trainer' | 'rescue' | 'puzzle' | 'boss' | 'evolve' | 'choose'
  // story encounters (V29, core/story.ts): keep a point against waves, break a device, bring someone somewhere
  | 'hold' | 'destroy' | 'escort';

export interface ObjectiveDef {
  type: ObjectiveType;
  /** Matching target id ('*' or omitted = any) */
  target?: string;
  count: number;
  text: string;
  /** World position hint (tiles); `region` = map id (default: the valley); `approx` = only an area of this radius
   *  (tiles) is known — the map draws a ring, the tracker a rough distance (a hidden shrine's obstacle) */
  marker?: { x: number; y: number; region?: string; approx?: number };
  /** Only applies when this option was chosen */
  branch?: string;
  /** Counts as done when any of these story flags is set (a choice made in an earlier quest made it unneeded) */
  skipIf?: string[];
  /** 'choose' objective: the options (target = the NPC who asks) */
  options?: QuestOption[];
  /** 'hold' / 'destroy' / 'escort': where and how (target = the encounter id the controller reports) */
  encounter?: EncounterDef;
}

export interface QuestOption {
  id: string;
  label: string;
  /** Extra rewards of this path (added to the quest's own) */
  rewards?: QuestRewards;
  /** What the NPC says right after the pick */
  reply?: string[];
  /** Completion dialogue of this path (replaces the quest's) */
  complete?: string[];
}

export interface QuestRewards {
  items?: Record<string, number>;
  exp?: number;
  worldExp?: number;
  reputation?: number;
  flags?: string[];
  pokemon?: { species: string; level: number };
}

export interface QuestDef {
  id: string;
  kind: QuestKind;
  title: string;
  description: string;
  giver?: string;
  /** Quest ids that must be completed first */
  requires?: string[];
  /** Flags that must be set first */
  requiresFlags?: string[];
  /** Starts automatically when available instead of via NPC dialogue */
  autoStart?: boolean;
  objectives: ObjectiveDef[];
  /** First talk of this quest hands out a starter: the species offered */
  starter?: string[];
  rewards: QuestRewards;
  dialogue: { offer: string[]; progress?: string[]; complete: string[] };
  /** Story (V29): the act / chapter it belongs to and the cutscenes it plays (skippable, kept in the journal) */
  chapter?: string;
  cutscene?: { start?: string; complete?: string };
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'completed';
export interface QuestState {
  status: QuestStatus;
  step: number;
  progress: number;
  /** The option picked at the quest's 'choose' objective */
  branch?: string;
  /** progress already made on later objectives (index → count), see ORDERED */
  pre?: Record<number, number>;
}

/** Objective types that only count at their own step: a conversation, a choice, a story encounter. */
export const ORDERED = new Set<ObjectiveType>(['talk', 'choose', 'hold', 'destroy', 'escort']);

export const choiceFlag = (quest: string, option: string): string => `choice:${quest}:${option}`;

export interface QuestEvent {
  type: ObjectiveType;
  target: string;
  amount?: number;
}

export interface QuestUpdate {
  questId: string;
  advanced: boolean;
  objectiveDone: boolean;
  completed: boolean;
}

/**
 * How much of an objective the world already shows done (0 = nothing / unknown). Many events fire once per save — a
 * waypoint is activated once, a trainer / boss beaten once, a chest opened once — so an objective whose event happened
 * before the quest reached it would otherwise wait forever. AdventureState answers from the save (core: never guesses).
 */
export type AlreadyDone = (obj: ObjectiveDef) => number;

export class QuestManager {
  readonly states: Record<string, QuestState>;
  /** quests completed by catching up (not by an event): the caller drains them to pay the rewards */
  private autoDone: string[] = [];

  constructor(readonly defs: QuestDef[], saved: Record<string, QuestState> = {}, private flags: () => Set<string> = () => new Set(),
    private already: AlreadyDone = (o) => (o.type === 'boss' && o.target && flags().has('boss:' + o.target) ? 1 : 0)) {
    this.states = {};
    for (const d of defs) {
      const st: QuestState = saved[d.id] ? { ...saved[d.id] } : { status: 'locked', step: 0, progress: 0 };
      // a save from before the quest lost objectives: never leave it active with nothing left to do
      if (st.status === 'active' && st.step >= d.objectives.length) { st.step = Math.max(0, d.objectives.length - 1); st.progress = 0; }
      this.states[d.id] = st;
    }
    this.refresh();
    this.catchUpAll();
  }

  def(id: string): QuestDef | undefined {
    return this.defs.find((d) => d.id === id);
  }

  /** Unlocks quests whose prerequisites are met; auto-starts autoStart quests. Returns newly started ids. */
  refresh(): string[] {
    const started: string[] = [];
    const flags = this.flags();
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of this.defs) {
        const st = this.states[d.id];
        if (st.status !== 'locked') continue;
        const reqOk = (d.requires ?? []).every((r) => this.states[r]?.status === 'completed');
        const flagOk = (d.requiresFlags ?? []).every((f) => flags.has(f));
        if (!reqOk || !flagOk) continue;
        st.status = d.autoStart ? 'active' : 'available';
        if (d.autoStart) { started.push(d.id); this.catchUp(d, st); }
        changed = true;
      }
    }
    return started;
  }

  start(id: string): boolean {
    const st = this.states[id];
    if (!st || st.status !== 'available') return false;
    st.status = 'active';
    st.step = 0;
    st.progress = 0;
    this.catchUp(this.def(id)!, st);
    return true;
  }

  /**
   * Brings the quest's current objective up to what the world already shows (see AlreadyDone): e.g. two quests share a
   * boss (the old province chain and the V29 story both send the player to Seviper), the waypoint was activated before
   * the quest asked for it, the restoration sites were planted before the ranger's quest was taken. Moves on while
   * objectives are done; a quest finished this way is queued in `autoDone`.
   */
  private catchUp(d: QuestDef, st: QuestState): void {
    while (st.status === 'active') {
      const obj = d.objectives[st.step];
      if (!obj || obj.type === 'choose') return;
      const skip = obj.skipIf?.some((f) => this.flags().has(f));
      st.progress = skip ? obj.count : Math.max(st.progress, Math.min(obj.count, this.already(obj)));
      if (st.progress < obj.count) return;
      if (this.advance(d, st).completed) this.autoDone.push(d.id);
    }
  }

  /** A later objective of the quest's path this event counts for (not ORDERED, not yet full), or -1. */
  private aheadFor(d: QuestDef, st: QuestState, ev: QuestEvent): number {
    for (let i = st.step + 1; i < d.objectives.length; i++) {
      const o = d.objectives[i];
      if (o.branch && o.branch !== st.branch) continue; // a branch not (yet) picked never collects anything
      if (ORDERED.has(o.type) || o.type !== ev.type) continue;
      if (o.target && o.target !== '*' && o.target !== ev.target) continue;
      if ((st.pre?.[i] ?? 0) < o.count) return i;
    }
    return -1;
  }

  /** Progress shown for any objective: done, current, or made early. */
  objectiveProgress(id: string, i: number): number {
    const st = this.states[id], o = this.def(id)?.objectives[i];
    if (!st || !o) return 0;
    if (st.status === 'completed' || i < st.step) return o.count;
    return i === st.step ? st.progress : Math.min(o.count, st.pre?.[i] ?? 0);
  }

  /** Re-checks every active quest against the world (after loading, travelling, or a change made outside events). */
  catchUpAll(): void {
    for (const d of this.active()) this.catchUp(d, this.states[d.id]);
  }

  /** Quests completed by catching up since the last call (rewards not yet paid). */
  takeAutoDone(): string[] {
    const out = this.autoDone;
    this.autoDone = [];
    return out;
  }

  active(): QuestDef[] {
    return this.defs.filter((d) => this.states[d.id].status === 'active');
  }

  currentObjective(id: string): ObjectiveDef | null {
    const d = this.def(id);
    const st = this.states[id];
    if (!d || st.status !== 'active') return null;
    return d.objectives[st.step] ?? null;
  }

  /** The objectives of the quest's path (branch objectives hidden until their option is picked), with their index. */
  pathObjectives(id: string): { obj: ObjectiveDef; i: number }[] {
    const d = this.def(id), st = this.states[id];
    if (!d) return [];
    return d.objectives.map((obj, i) => ({ obj, i })).filter(({ obj }) => !obj.branch || obj.branch === st.branch);
  }

  /** True when the current objective is the last one of the quest's path. */
  isLastStep(id: string): boolean {
    const path = this.pathObjectives(id);
    return path.length > 0 && path[path.length - 1].i === this.states[id]?.step;
  }

  /** The picked option of a quest, if any. */
  option(id: string): QuestOption | null {
    const d = this.def(id), b = this.states[id]?.branch;
    if (!d || !b) return null;
    for (const o of d.objectives) { const hit = o.options?.find((x) => x.id === b); if (hit) return hit; }
    return null;
  }

  /** The quest's rewards plus its picked option's. */
  rewardsOf(id: string): QuestRewards {
    const base = this.def(id)?.rewards ?? {};
    const extra = this.option(id)?.rewards;
    if (!extra) return base;
    const items = { ...(base.items ?? {}) };
    for (const [k, n] of Object.entries(extra.items ?? {})) items[k] = (items[k] ?? 0) + n;
    return {
      ...base, ...extra, items,
      exp: (base.exp ?? 0) + (extra.exp ?? 0) || undefined,
      worldExp: (base.worldExp ?? 0) + (extra.worldExp ?? 0) || undefined,
      reputation: (base.reputation ?? 0) + (extra.reputation ?? 0) || undefined,
      flags: [...(base.flags ?? []), ...(extra.flags ?? [])],
      pokemon: extra.pokemon ?? base.pokemon,
    };
  }

  /** Picks an option at the quest's current 'choose' objective. Returns null if that is not possible. */
  choose(id: string, option: string): QuestUpdate | null {
    const d = this.def(id), st = this.states[id], obj = this.currentObjective(id);
    if (!d || obj?.type !== 'choose' || !obj.options?.some((o) => o.id === option)) return null;
    st.branch = option;
    const u = this.advance(d, st);
    this.catchUp(d, st);
    return u;
  }

  /** Moves past the finished objective (skipping other branches' objectives); completes the quest at the end. */
  private advance(d: QuestDef, st: QuestState): QuestUpdate {
    st.step++;
    while (st.step < d.objectives.length && d.objectives[st.step].branch && d.objectives[st.step].branch !== st.branch) st.step++;
    // what was done early on this objective counts now (catchUp moves on if that already fills it)
    st.progress = Math.min(d.objectives[st.step]?.count ?? 0, st.pre?.[st.step] ?? 0);
    if (st.pre) { delete st.pre[st.step]; if (!Object.keys(st.pre).length) delete st.pre; }
    const completed = st.step >= d.objectives.length;
    if (completed) { st.status = 'completed'; delete st.pre; }
    return { questId: d.id, advanced: true, objectiveDone: true, completed };
  }

  /** Feeds a gameplay event to every active quest. Completion is returned; rewards are applied by the caller. */
  notify(ev: QuestEvent): QuestUpdate[] {
    const out: QuestUpdate[] = [];
    for (const d of this.active()) {
      const st = this.states[d.id];
      const obj = d.objectives[st.step];
      const here = !!obj && obj.type === ev.type && obj.type !== 'choose' && (!obj.target || obj.target === '*' || obj.target === ev.target);
      if (!here) {
        // not this step: kept for a later step of the path, unless that one has to wait its turn
        const j = this.aheadFor(d, st, ev);
        if (j < 0) continue;
        (st.pre ??= {})[j] = Math.min(d.objectives[j].count, (st.pre[j] ?? 0) + (ev.amount ?? 1));
        out.push({ questId: d.id, advanced: true, objectiveDone: st.pre[j] >= d.objectives[j].count, completed: false });
        continue;
      }
      st.progress = Math.min(obj.count, st.progress + (ev.amount ?? 1));
      if (st.progress >= obj.count) { const u = this.advance(d, st); this.catchUp(d, st); out.push(u); }
      else out.push({ questId: d.id, advanced: true, objectiveDone: false, completed: false });
    }
    return out;
  }

  /** Quests an NPC can offer or is waiting on. */
  forGiver(npc: string): QuestDef[] {
    return this.defs.filter((d) => d.giver === npc && (this.states[d.id].status === 'available' || this.states[d.id].status === 'active'));
  }

  serialize(): Record<string, QuestState> {
    return JSON.parse(JSON.stringify(this.states));
  }
}
