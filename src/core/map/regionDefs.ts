import valleyJson from '../../data/world/starter-valley.json';
import frozenJson from '../../data/world/frozen-mountains.json';
import volcanicJson from '../../data/world/volcanic-lands.json';
import sanctuaryJson from '../../data/world/legendary-sanctuary.json';
import swampJson from '../../data/world/misty-swamp.json';
import coastJson from '../../data/world/coral-coast.json';
import caMauJson from '../../data/vietnam/ca-mau.json';
import anGiangJson from '../../data/vietnam/an-giang.json';
import type { RegionDef } from './valley';

// Every overworld map of the game. The valley is the hub; the other regions are reached through portals.
export const REGION_DEFS: Record<string, RegionDef> = {
  'starter-valley': valleyJson as unknown as RegionDef,
  'frozen-mountains': frozenJson as unknown as RegionDef,
  'volcanic-lands': volcanicJson as unknown as RegionDef,
  'legendary-sanctuary': sanctuaryJson as unknown as RegionDef,
  'misty-swamp': swampJson as unknown as RegionDef,
  'coral-coast': coastJson as unknown as RegionDef,
  // Vietnam Odyssey mode (separate campaign)
  'ca-mau': caMauJson as unknown as RegionDef,
  'an-giang': anGiangJson as unknown as RegionDef,
};

export function regionDef(id: string | null | undefined): RegionDef {
  return REGION_DEFS[id ?? ''] ?? REGION_DEFS['starter-valley'];
}

/** Which map an area id belongs to (quest markers / events only show on their own map). */
export function mapOfArea(areaId: string): string | null {
  for (const [id, d] of Object.entries(REGION_DEFS)) if (d.areas.some((a) => a.id === areaId)) return id;
  return null;
}
