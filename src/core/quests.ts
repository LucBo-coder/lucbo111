// Data-driven quest engine (pure; persisted through the save system).
// Objectives are sequential: only the current objective of an active quest receives progress.

export type QuestKind = 'main' | 'side' | 'exploration' | 'capture' | 'trainer' | 'dungeon' | 'boss';
export type ObjectiveType = 'talk' | 'capture' | 'defeat' | 'explore' | 'activate' | 'dungeon' | 'collect' | 'trainer' | 'rescue' | 'puzzle' | 'boss' | 'evolve';

export interface ObjectiveDef {
  type: ObjectiveType;
  /** Matching target id ('*' or omitted = any) */
  target?: string;
  count: number;
  text: string;
  /** World position hint for the HUD tracker / map (pixels) */
  /** World position hint; `region` = map id (default: the valley) */
  marker?: { x: number; y: number; region?: string };
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
}

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

  /** Feeds a gameplay event to every active quest. Completion is returned; rewards are applied by the caller. */
  notify(ev: QuestEvent): QuestUpdate[] {
    const out: QuestUpdate[] = [];
    for (const d of this.active()) {
      const st = this.states[d.id];
      const obj = d.objectives[st.step];
      if (!obj || obj.type !== ev.type) continue;
      if (obj.target && obj.target !== '*' && obj.target !== ev.target) continue;
      st.progress = Math.min(obj.count, st.progress + (ev.amount ?? 1));
      const objectiveDone = st.progress >= obj.count;
      let completed = false;
      if (objectiveDone) {
        st.step++;
        st.progress = 0;
        if (st.step >= d.objectives.length) {
          st.status = 'completed';
          completed = true;
        }
      }
      out.push({ questId: d.id, advanced: true, objectiveDone, completed });
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
