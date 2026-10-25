import legendsJson from '../data/world/legends.json';
import { REGION_DEFS } from './map/regionDefs';
import type { WeatherKind } from './encounters';
import type { QuestDef } from './quests';

// LegendaryEncounterManager data + rules (pure). Legendary / Mythical species never appear in ordinary pools;
// each one has its own encounter: a shrine boss, a roaming encounter, a non-combat meeting (gift) or a story egg.
// State machine per legend:  locked → available → active → caught   (a caught legend never spawns again as a
// new individual; shrine rematches only give items).

export type LegendKind = 'shrine' | 'roaming' | 'gift' | 'egg';
export type LegendState = 'locked' | 'available' | 'active' | 'defeated' | 'caught';

export interface LegendDef {
  id: string;
  kind: LegendKind;
  name?: string;
  lore: string;
  hint?: string;
  requires: string[];
  level?: number;
  site?: { x: number; y: number; region?: string };
  regions?: string[];
  time?: 'day' | 'night' | 'dawn';
  weather?: WeatherKind[];
  friendship?: number;
  /** egg: seconds of play before it hatches */
  hatch?: number;
  /** egg: species the player must own (Phione: Manaphy + Ditto at the farm) */
  needs?: string[];
}

export const LEGENDS = new Map((legendsJson as LegendDef[]).map((l) => [l.id, l]));

export interface LegendEnv {
  /** in-game minutes 0..1440 */
  clock: number;
  weather: WeatherKind;
  /** friendship of the party lead */
  leadFriendship: number;
}

export function timeOk(t: LegendDef['time'], clock: number): boolean {
  if (!t) return true;
  const h = clock / 60;
  if (t === 'dawn') return h >= 5 && h < 7.5;
  const night = h >= 19 || h < 5;
  return t === 'night' ? night : !night;
}

/** Unmet non-story conditions (time, weather, friendship) — empty when the encounter can happen now. */
export function missingConditions(l: LegendDef | { time?: LegendDef['time']; weather?: WeatherKind[]; friendship?: number }, env: LegendEnv): string[] {
  const out: string[] = [];
  if (!timeOk(l.time, env.clock)) out.push(l.time === 'night' ? 'ban đêm' : l.time === 'dawn' ? 'lúc bình minh (5:00–7:30)' : 'ban ngày');
  if (l.weather?.length && !l.weather.includes(env.weather)) out.push('thời tiết đặc biệt');
  if (l.friendship && env.leadFriendship < l.friendship) out.push(`Pokémon dẫn đầu thân thiết ≥ ${l.friendship}`);
  return out;
}

export function storyUnlocked(l: LegendDef, hasFlag: (f: string) => boolean): boolean {
  return l.requires.every(hasFlag);
}

/** Current state given the saved state and story flags (never goes backwards from caught). */
export function legendState(saved: LegendState | undefined, l: LegendDef, hasFlag: (f: string) => boolean): LegendState {
  if (saved === 'caught') return 'caught';
  if (!storyUnlocked(l, hasFlag)) return 'locked';
  return saved === 'active' ? 'active' : 'available';
}

const QUEST_ID = (id: string) => (id === 'mega-venusaur' ? 'q-main-4' : 'q-legend-' + id);

/** Quest chain for every legend (the 5 Gen 1 quests are authored in quests.json and kept). */
export function legendQuests(authored: QuestDef[]): QuestDef[] {
  const have = new Set(authored.map((q) => q.id));
  const out: QuestDef[] = [];
  for (const l of LEGENDS.values()) {
    const id = QUEST_ID(l.id);
    if (have.has(id)) continue;
    const req = l.requires.filter((f) => f.startsWith('boss:')).map((f) => QUEST_ID(f.slice(5)));
    const name = l.name ?? l.id;
    // shrines / meetings name their map too: they are spread over the regions, not all in the valley
    const map = REGION_DEFS[l.site?.region ?? 'starter-valley']?.name;
    const where = l.kind === 'roaming' ? 'Lang thang — tìm trong các vùng của nó' : l.kind === 'egg' ? 'Ấp trứng (tự nở sau một thời gian chơi)' : map ? `${name} — ${map}` : name;
    const verb = l.kind === 'gift' ? 'Gặp' : l.kind === 'egg' ? 'Ấp nở' : 'Đánh bại';
    out.push({
      id, kind: 'boss', title: `Truyền thuyết — ${cap(l.id)}`, requires: req, autoStart: true, description: l.lore,
      objectives: [{ type: 'boss', target: l.id, count: 1, text: `${verb} ${cap(l.id)} (${where})`, ...(l.site ? { marker: l.site } : {}) }],
      rewards: { worldExp: 400, reputation: 30 },
      dialogue: { offer: [l.lore], progress: [l.hint || l.lore], complete: [`${cap(l.id)} đã công nhận bạn!`] },
    } as QuestDef);
  }
  return out;
}

const cap = (s: string) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-');
