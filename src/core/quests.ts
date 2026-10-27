// Data-driven quest engine (pure; persisted through the save system).
// Objectives are sequential: only the current objective of an active quest receives progress.
// Branching (V22): a 'choose' objective offers options; the pick is stored on the quest state, sets the flag
// `choice:<quest>:<option>` (follow-up quests can require it), adds the option's rewards, and from then on only
// objectives without a `branch` or with that branch apply.

export type QuestKind = 'main' | 'side' | 'exploration' | 'capture' | 'trainer' | 'dungeon' | 'boss';
export type ObjectiveType = 'talk' | 'capture' | 'defeat' | 'explore' | 'activate' | 'dungeon' | 'collect' | 'trainer' | 'rescue' | 'puzzle' | 'boss' | 'evolve' | 'choose';

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
  /** 'choose' objective: the options (target = the NPC who asks) */
  options?: QuestOption[];
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
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'completed';
export interface QuestState {
  status: QuestStatus;
  step: number;
  progress: number;
  /** The option picked at the quest's 'choose' objective */
  branch?: string;
}

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

export class QuestManager {
  readonly states: Record<string, QuestState>;

  constructor(readonly defs: QuestDef[], saved: Record<string, QuestState> = {}, private flags: () => Set<string> = () => new Set()) {
    this.states = {};
    for (const d of defs) this.states[d.id] = saved[d.id] ? { ...saved[d.id] } : { status: 'locked', step: 0, progress: 0 };
    this.refresh();
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
        if (d.autoStart) started.push(d.id);
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
    return true;
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
    return this.advance(d, st);
  }

  /** Moves past the finished objective (skipping other branches' objectives); completes the quest at the end. */
  private advance(d: QuestDef, st: QuestState): QuestUpdate {
    st.step++;
    st.progress = 0;
    while (st.step < d.objectives.length && d.objectives[st.step].branch && d.objectives[st.step].branch !== st.branch) st.step++;
    const completed = st.step >= d.objectives.length;
    if (completed) st.status = 'completed';
    return { questId: d.id, advanced: true, objectiveDone: true, completed };
  }

  /** Feeds a gameplay event to every active quest. Completion is returned; rewards are applied by the caller. */
  notify(ev: QuestEvent): QuestUpdate[] {
    const out: QuestUpdate[] = [];
    for (const d of this.active()) {
      const st = this.states[d.id];
      const obj = d.objectives[st.step];
      if (!obj || obj.type !== ev.type || obj.type === 'choose') continue;
      if (obj.target && obj.target !== '*' && obj.target !== ev.target) continue;
      st.progress = Math.min(obj.count, st.progress + (ev.amount ?? 1));
      if (st.progress >= obj.count) out.push(this.advance(d, st));
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
