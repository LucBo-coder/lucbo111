// Authoring types of the campaign stories (scripts/gen-story.ts turns them into src/data/story/*.json).
// Positions are written as anchors ("near this NPC / waypoint / the boss arena, a few tiles off"); the generator
// resolves each one to a free, walkable tile of the real map and fills every objective's map marker.
import type { QuestDef, ObjectiveDef, QuestRewards, QuestOption } from '../../src/core/quests';
import type { StoryCharacter, StoryChapter, Cutscene, EncounterKind, AllyDef } from '../../src/core/story';

/** `wp:<id>` · `npc:<id>` · `trainer:<id>` · `boss` (world boss arena) · `area:<id>` (rect centre) · `xy:<x>,<y>` */
export interface Spot { region: string; at: string; dx?: number; dy?: number }

export interface NpcIn {
  id: string; name: string; sprite: string; look?: string; at: Spot; lines: string[];
  showIf?: string[]; hideIf?: string[];
}

export interface TrainerIn extends Omit<NpcIn, 'lines'> {
  team: [string, number][]; challenge: string[]; win: string[]; lose: string[];
  rewards: { items?: Record<string, number>; exp?: number };
}

export interface EncounterIn {
  kind: EncounterKind; at: Spot; radius?: number; seconds?: number; secondsIf?: { flag: string; seconds: number };
  waves?: [string, number][][]; every?: number;
  device?: { name: string; species: string; level: number; hpMult?: number };
  ally?: AllyDef;
  /** escort: who follows (sprite kind + look seed), from where */
  npc?: { name: string; sprite?: string; look?: string; from: Spot };
}

export type ObjectiveIn = Omit<ObjectiveDef, 'marker' | 'encounter' | 'count'> & { count?: number; encounter?: EncounterIn; marker?: Spot | false };

export interface QuestIn extends Omit<QuestDef, 'objectives' | 'rewards'> {
  /** map of the quest (markers are looked up there first) */
  region: string;
  objectives: ObjectiveIn[];
  rewards: QuestRewards;
}

export interface StoryIn {
  id: string;
  campaign: 'classic' | 'vietnam';
  title: string;
  premise: string;
  characters: StoryCharacter[];
  chapters: StoryChapter[];
  cutscenes: Cutscene[];
  quests: QuestIn[];
  npcs: NpcIn[];
  trainers: TrainerIn[];
}

export type { QuestOption };

/** Three hostile waves from a few species: two, then three, then three of the strongest. */
export function waves(species: string[], level: number): [string, number][][] {
  const [a, b = a, c = b] = species;
  return [[[a, level - 2], [b, level - 2]], [[a, level - 1], [b, level - 1], [c, level]], [[b, level], [c, level], [c, level + 1]]];
}
