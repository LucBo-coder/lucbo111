// Story layer of the two campaigns (pure, testable): characters, acts / chapters, cutscenes that can be skipped and
// read again in the journal, NPCs that appear / leave with story flags, and the encounter objectives of the story
// quests ('hold' a point against waves, 'destroy' a device, 'escort' someone). Quests themselves stay in the quest
// engine (core/quests.ts): a story is a list of QuestDefs plus the data here.
import type { QuestDef } from './quests';

export interface StoryCharacter {
  id: string;
  name: string;
  /** one line: who they are (journal) */
  role: string;
  /** NPC id whose portrait / look the dialogue uses (optional) */
  npc?: string;
}

export interface CutsceneLine {
  /** character id, an NPC name, or '' for narration */
  who: string;
  text: string;
}

export interface Cutscene {
  id: string;
  title: string;
  /** act / chapter id (journal grouping) */
  chapter: string;
  lines: CutsceneLine[];
}

export interface StoryChapter {
  id: string;
  title: string;
  /** map ids the chapter takes place in */
  regions: string[];
  /** short synopsis shown in the journal once the chapter is reached */
  summary: string;
  /** what visibly changes in the world when it is finished (journal, after completion) */
  change: string;
  /** main quests of the chapter, in order (the last one closes it) */
  quests: string[];
}

/** Gating of a story NPC / trainer by story flags (see npcVisible) */
export interface StoryGate { showIf?: string[]; hideIf?: string[] }

/** A story NPC placed on a map (joins RegionDef.npcs); `look` = seed of its pixel look, shared across maps */
export interface StoryNpc extends StoryGate { region: string; id: string; name: string; sprite: string; look?: string; x: number; y: number; lines: string[] }

/** A story trainer (joins RegionDef.trainers) */
export interface StoryTrainer extends StoryGate {
  region: string; id: string; name: string; sprite: string; look?: string; x: number; y: number;
  team: [string, number][]; challenge: string[]; win: string[]; lose: string[]; rewards: { items?: Record<string, number>; exp?: number };
}

export interface StoryDef {
  id: string;
  campaign: 'classic' | 'vietnam';
  title: string;
  premise: string;
  characters: StoryCharacter[];
  chapters: StoryChapter[];
  cutscenes: Cutscene[];
  quests: QuestDef[];
  npcs: StoryNpc[];
  trainers: StoryTrainer[];
}

/** NPC visibility by story flags: every `showIf` flag set and no `hideIf` flag set. */
export function npcVisible(d: { showIf?: string[]; hideIf?: string[] }, has: (f: string) => boolean): boolean {
  return (d.showIf ?? []).every(has) && !(d.hideIf ?? []).some(has);
}

export type ChapterState = 'locked' | 'current' | 'done';

/** Chapter progress from the quest states: done when its last quest is completed, current from its first available. */
export function chapterStates(story: StoryDef, status: (questId: string) => string | undefined): Record<string, ChapterState> {
  const out: Record<string, ChapterState> = {};
  for (const c of story.chapters) {
    const last = c.quests[c.quests.length - 1];
    if (status(last) === 'completed') out[c.id] = 'done';
    else if (c.quests.some((q) => { const s = status(q); return s === 'available' || s === 'active' || s === 'completed'; })) out[c.id] = 'current';
    else out[c.id] = 'locked';
  }
  return out;
}

/** The cutscene a quest plays when it starts / when it is completed. */
export function cutsceneOf(q: QuestDef | undefined, when: 'start' | 'complete'): string | undefined {
  return q?.cutscene?.[when];
}

/**
 * Lines of a cutscene grouped by speaker (one dialogue box per group). `name` resolves a character id to its
 * display name; narration keeps an empty speaker.
 */
export function cutscenePages(c: Cutscene, name: (who: string) => string): { speaker: string; lines: string[] }[] {
  const out: { speaker: string; lines: string[] }[] = [];
  for (const l of c.lines) {
    const speaker = l.who ? name(l.who) : '';
    const last = out[out.length - 1];
    if (last && last.speaker === speaker) last.lines.push(l.text);
    else out.push({ speaker, lines: [l.text] });
  }
  return out;
}

// ───────────────────────────── story encounters ─────────────────────────────

/** Objective types run by the story encounter controller. */
export type EncounterKind = 'hold' | 'destroy' | 'escort';

export interface EncounterDef {
  kind: EncounterKind;
  /** tiles; `region` = map id */
  x: number;
  y: number;
  region: string;
  /** hold: stay within this radius (tiles); escort: arrival radius at the destination */
  radius?: number;
  /** hold: seconds to keep the point */
  seconds?: number;
  /** hold / destroy: hostile waves, [species, level] each, one wave every `every` seconds */
  waves?: [string, number][][];
  every?: number;
  /** destroy: the device (a Pokémon-like construct the party attacks) */
  device?: { name: string; species: string; level: number; hpMult?: number };
  /** escort: the NPC that follows the trainer, from where it waits to the destination (sprite kind + look seed) */
  npc?: { name: string; sprite?: string; look?: string; fromX: number; fromY: number };
}

export interface HoldState { t: number; out: number }

/**
 * One tick of a 'hold' objective: progress while the trainer stands in the circle with a Pokémon fighting;
 * stepping out pauses it, staying out for `grace` seconds resets it (the waves start again). Returns the new state
 * and whether the point is held.
 */
export function holdTick(st: HoldState, dt: number, inside: boolean, def: { seconds?: number }, grace = 8): { st: HoldState; done: boolean; reset: boolean } {
  const need = def.seconds ?? 45;
  if (inside) {
    const t = Math.min(need, st.t + dt);
    return { st: { t, out: 0 }, done: t >= need, reset: false };
  }
  const out = st.out + dt;
  if (out >= grace) return { st: { t: 0, out: 0 }, done: false, reset: true };
  return { st: { t: st.t, out }, done: false, reset: false };
}

/** Wave index due at time `t` of a hold / destroy encounter (-1 = none yet). */
export function waveDue(t: number, def: EncounterDef): number {
  const n = def.waves?.length ?? 0;
  if (!n) return -1;
  const every = def.every ?? 12;
  return Math.min(n - 1, Math.floor(t / every));
}

/** Validates a story: ids unique, quests referenced by chapters exist, cutscenes referenced by quests exist. */
export function validateStory(story: StoryDef): string[] {
  const errs: string[] = [];
  const qids = new Set<string>();
  for (const q of story.quests) { if (qids.has(q.id)) errs.push(`duplicate quest ${q.id}`); qids.add(q.id); }
  const cids = new Set(story.cutscenes.map((c) => c.id));
  if (cids.size !== story.cutscenes.length) errs.push('duplicate cutscene id');
  const chars = new Set(story.characters.map((c) => c.id));
  for (const c of story.chapters) for (const q of c.quests) if (!qids.has(q)) errs.push(`chapter ${c.id}: unknown quest ${q}`);
  for (const q of story.quests) {
    for (const w of ['start', 'complete'] as const) { const id = q.cutscene?.[w]; if (id && !cids.has(id)) errs.push(`${q.id}: unknown cutscene ${id}`); }
    for (const r of q.requires ?? []) if (!qids.has(r) && !r.startsWith('vn-') && !r.startsWith('q-')) errs.push(`${q.id}: unknown requirement ${r}`);
    for (const o of q.objectives) if ((o.type === 'hold' || o.type === 'destroy' || o.type === 'escort') && !o.encounter) errs.push(`${q.id}: ${o.type} without encounter`);
  }
  for (const c of story.cutscenes) for (const l of c.lines) if (l.who && !chars.has(l.who) && !l.who.includes(' ')) errs.push(`${c.id}: unknown speaker ${l.who}`);
  return errs;
}
