import variantsJson from '../data/world/regional-events.json';
import type { WeatherKind } from './encounters';
import type { Rng } from './rng';
import type { EventType } from './worldEvents';

// Regional events (pure): local flavours of the world events. When the director starts an event of a type in a
// region that has a variant of that type, the variant usually takes over (REGIONAL_CHANCE): its own name and
// announcement, its own species / weather / market goods and an optional extra completion bonus. Gameplay
// (spawning, weather, shop, rewards) stays the world-event controller's.

export interface RegionalVariant {
  id: string;
  type: Extract<EventType, 'outbreak' | 'migration' | 'weather' | 'merchant'>;
  /** encounter-region ids (regions.json) */
  regions: string[];
  name: string;
  intro: string;
  species?: string[];
  weather?: WeatherKind;
  title?: string;
  tag?: string;
  greeting?: string;
  offers?: { id: string; stock: number }[];
  bonus?: Record<string, number>;
}

export const REGIONAL_VARIANTS = variantsJson as RegionalVariant[];
export const REGIONAL_CHANCE = 0.7;

export function variantsFor(type: EventType, region: string): RegionalVariant[] {
  return REGIONAL_VARIANTS.filter((v) => v.type === type && v.regions.includes(region));
}

/** The local flavour for a starting event, or null (no variant here, or the generic event this time). */
export function pickVariant(rng: Rng, type: EventType, region: string): RegionalVariant | null {
  const vs = variantsFor(type, region);
  if (!vs.length || !rng.chance(REGIONAL_CHANCE)) return null;
  return rng.pick(vs);
}

export function variantById(id: unknown): RegionalVariant | null {
  return REGIONAL_VARIANTS.find((v) => v.id === id) ?? null;
}
