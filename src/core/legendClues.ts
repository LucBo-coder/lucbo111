import cluesJson from '../data/world/legend-clues.json';
import type { WeatherKind } from './encounters';
import { LEGENDS, type LegendDef } from './legends';

// Legendary investigation (pure): three clues per investigated legend, lying on its maps. Each clue found is a story
// flag (`clue:<id>`), so it is saved with the campaign and never shared between campaigns. Finding all three
// completes the investigation: the encounter's exact conditions are known (Pokédex / dialogue) and the capture
// window grants one extra throw. Clues show only once the legend's story requirements are met and until it is caught.

export interface Clue { id: string; region: string; x: number; y: number; text: string }
export interface LegendClues { legend: string; clues: Clue[] }

export const LEGEND_CLUES = new Map((cluesJson as LegendClues[]).map((c) => [c.legend, c.clues]));
/** Extra capture throws once an investigation is complete. */
export const INVESTIGATION_BONUS = 1;

export const clueFlag = (id: string) => `clue:${id}`;

export function cluesFound(legend: string, hasFlag: (f: string) => boolean): number {
  return (LEGEND_CLUES.get(legend) ?? []).filter((c) => hasFlag(clueFlag(c.id))).length;
}

export function investigated(legend: string, hasFlag: (f: string) => boolean): boolean {
  const all = LEGEND_CLUES.get(legend);
  return !!all && all.every((c) => hasFlag(clueFlag(c.id)));
}

/** Clues to place on a map right now: the legend is unlocked, not yet caught, the clue not yet found. */
export function visibleClues(region: string, o: { hasFlag: (f: string) => boolean; caught: (legend: string) => boolean }): (Clue & { legend: string })[] {
  const out: (Clue & { legend: string })[] = [];
  for (const [legend, clues] of LEGEND_CLUES) {
    const l = LEGENDS.get(legend);
    if (!l || o.caught(legend) || !l.requires.every(o.hasFlag)) continue;
    for (const c of clues) if (c.region === region && !o.hasFlag(clueFlag(c.id))) out.push({ ...c, legend });
  }
  return out;
}

const WEATHER_VI: Partial<Record<WeatherKind, string>> = {
  clear: 'trời quang', rain: 'mưa', fog: 'sương mù', thunderstorm: 'giông sét', blizzard: 'bão tuyết', heatwave: 'nắng gắt', heavyRain: 'mưa xối xả', mysticFog: 'sương huyền bí',
};

/** "ban đêm · khi có mưa / giông sét" — what the investigation reveals (empty conditions: "bất cứ lúc nào"). */
export function conditionSummary(l: Pick<LegendDef, 'time' | 'weather' | 'friendship'>): string {
  const parts: string[] = [];
  if (l.time) parts.push(l.time === 'night' ? 'ban đêm' : l.time === 'dawn' ? 'lúc bình minh (5:00–7:30)' : 'ban ngày');
  if (l.weather?.length) parts.push('khi ' + l.weather.map((w) => WEATHER_VI[w] ?? w).join(' / '));
  if (l.friendship) parts.push(`Pokémon dẫn đầu thân thiết ≥ ${l.friendship}`);
  return parts.length ? parts.join(' · ') : 'bất cứ lúc nào, khi đã đủ điều kiện cốt truyện';
}
