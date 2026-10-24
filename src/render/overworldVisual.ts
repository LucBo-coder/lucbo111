import groundData from './pmdGround.json';

export type Locomotion = 'walk' | 'crawl' | 'low-flight' | 'high-flight';
export interface VisualProfile {
  locomotion: Locomotion;
  visualScale: number;
  /** Optional authored pixel anchor, relative to the centre of a PMD frame. */
  footAnchor?: { x: number; y: number };
  spriteOffset: { x: number; y: number };
  shadowScale: number;
  flightHeight: number;
}
const ground = groundData as Record<string, number[]>;
const crawl = new Set('caterpie weedle wurmple ekans arbok onix steelix snom shuckle dunsparce dudunsparce'.split(' '));
const low = new Set('butterfree beedrill zubat golbat crobat magnemite magneton magnezone gastly haunter gengar mew celebi jirachi rotom yanma yanmega vibrava flygon frosmoth dragapult'.split(' '));
const high = new Set('articuno zapdos moltres rayquaza rayquaza-mega lugia ho-oh latias latios aerodactyl'.split(' '));
/** Exact form overrides take precedence; no battle radius/stat is used for appearance. */
export const VISUAL_OVERRIDES: Record<string, Partial<VisualProfile>> = {
  // The long tail is NOT a foot: keep these authored pivots fixed when turning.
  articuno: { visualScale: 1.5, footAnchor: { x: 0, y: 0 }, shadowScale: 2.5, flightHeight: 24 },
  zapdos: { visualScale: 1.75, footAnchor: { x: 0, y: 2 }, shadowScale: 2.5, flightHeight: 24 },
  moltres: { visualScale: 1.5, shadowScale: 2.5, flightHeight: 24 },
  rayquaza: { visualScale: 1.4, footAnchor: { x: 0, y: 8 }, shadowScale: 3, flightHeight: 30 },
  'rayquaza-mega': { visualScale: 1.5, shadowScale: 3.4, flightHeight: 32 },
  snorlax: { visualScale: 2.5, shadowScale: 2.8 },
  wailord: { visualScale: 1.25, shadowScale: 3.5 },
  caterpie: { visualScale: 1.8, shadowScale: 1.2 },
  'rotom-wash': { locomotion: 'low-flight', flightHeight: 12, shadowScale: 1.8 },
  'articuno-galar': { locomotion: 'high-flight', flightHeight: 24, shadowScale: 2.5 },
  'zapdos-galar': { locomotion: 'walk', flightHeight: 0, shadowScale: 2.5 },
};
export function visualProfile(species: string, pmd: boolean, fallbackScale = 3): VisualProfile {
  const id = species.replace('~shiny', '');
  const locomotion: Locomotion = high.has(id) ? 'high-flight' : low.has(id) ? 'low-flight' : crawl.has(id) ? 'crawl' : 'walk';
  const override = VISUAL_OVERRIDES[id] ?? {};
  return { locomotion, visualScale: pmd ? 2 : fallbackScale, spriteOffset: { x: 0, y: 0 },
    shadowScale: crawl.has(id) ? 1.6 : 1.8, flightHeight: high.has(id) ? 24 : low.has(id) ? 12 : 0,
    ...override, // PMD scale corrections must not shrink the already-small box icon fallback.
    ...(!pmd ? { visualScale: fallbackScale } : {}),
  };
}

/** PMD's canvas centre is invariant across sheets of different sizes. Never trim action frames. */
export function pmdFootAnchor(species: string, direction: number, width: number, height: number, profile: VisualProfile) {
  const offsets = ground[species.replace('~shiny', '')];
  const foot = profile.footAnchor ?? { x: 0, y: offsets?.[direction % offsets.length] ?? 0 };
  return { x: width / 2 + foot.x, y: height / 2 + foot.y };
}

/** All values here are visual; logical position and collision radius are never mutated. */
export function groundPose(x: number, y: number, profile: VisualProfile, altitude = 0) {
  return { x: x + profile.spriteOffset.x, y: y + profile.spriteOffset.y - profile.flightHeight - altitude,
    shadowX: x, shadowY: y, depth: y };
}
